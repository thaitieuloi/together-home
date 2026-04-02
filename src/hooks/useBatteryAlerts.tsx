import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from './useFamily';

const BATTERY_THRESHOLD = 20;
// 30-minute cooldown per member to prevent alert spam
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Watches all family members' battery levels. When a member's battery drops
 * below 20% (transition from >=20 → <20), inserts a notification record for
 * the current user so the in-app notification system picks it up.
 *
 * Note: The device's own battery alert (send-battery-alert edge function) is
 * already triggered by useLocationTracking. This hook covers the OTHER direction:
 * notifying a viewer watching their family members' batteries.
 */
export function useBatteryAlerts(
  members: FamilyMemberWithProfile[],
  currentUserId: string | undefined
) {
  // userId → last known battery level
  const prevBatteryRef = useRef<Map<string, number | null>>(new Map());
  // userId → timestamp of last alert sent (to enforce cooldown)
  const lastAlertRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!currentUserId) return;

    const now = Date.now();

    members.forEach((member) => {
      const { user_id } = member;

      // Don't self-alert
      if (user_id === currentUserId) {
        prevBatteryRef.current.set(user_id, member.location?.battery_level ?? null);
        return;
      }

      const battery = member.location?.battery_level ?? null;
      const prevBattery = prevBatteryRef.current.get(user_id);

      // Only fire when we have a previous reading AND battery just crossed the threshold
      const justDropped =
        battery !== null &&
        battery < BATTERY_THRESHOLD &&
        prevBattery !== undefined &&
        prevBattery !== null &&
        prevBattery >= BATTERY_THRESHOLD;

      if (justDropped) {
        const lastAlerted = lastAlertRef.current.get(user_id) ?? 0;

        if (now - lastAlerted >= ALERT_COOLDOWN_MS) {
          lastAlertRef.current.set(user_id, now);

          const name = member.profile.display_name;

          supabase
            .from('notifications')
            .insert({
              user_id: currentUserId,
              type: 'battery_low',
              title: `🔋 Pin yếu: ${name}`,
              body: `Pin của ${name} còn ${battery}%. Nhắc họ sạc pin ngay.`,
              metadata: {
                member_user_id: user_id,
                battery_level: battery,
              },
            })
            .then(({ error }) => {
              if (error) {
                console.warn('[useBatteryAlerts] insert error:', error.message);
              }
            });
        }
      }

      prevBatteryRef.current.set(user_id, battery);
    });
  }, [members, currentUserId]);
}
