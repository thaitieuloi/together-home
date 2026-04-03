import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from './useFamily';

const POLL_INTERVAL_MS = 60_000; // Fallback polling every 60s

export function useRealtimeLocations(
  members: FamilyMemberWithProfile[],
  onLocationUpdate: (
    userId: string,
    lat: number,
    lng: number,
    accuracy: number | null,
    updatedAt: string,
    speed?: number | null,
    isMoving?: boolean | null,
    batteryLevel?: number | null
  ) => void
) {
  const lastRealtimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (members.length === 0) return;

    const memberIds = new Set(members.map((m) => m.user_id));
    const memberIdArr = [...memberIds];

    // ── Realtime channel (primary) ──────────────────────────────
    const channel = supabase
      .channel('latest-location-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'latest_locations',
        },
        (payload) => {
          try {
            const record = payload.new as {
              user_id: string;
              latitude: number;
              longitude: number;
              accuracy: number | null;
              updated_at: string;
              speed?: number | null;
              is_moving?: boolean | null;
              battery_level?: number | null;
            };
            
            if (record && record.user_id && memberIds.has(record.user_id)) {
              lastRealtimeRef.current = Date.now();
              onLocationUpdate(
                record.user_id,
                record.latitude,
                record.longitude,
                record.accuracy,
                record.updated_at,
                record.speed ?? null,
                record.is_moving ?? null,
                record.battery_level ?? null
              );
            }
          } catch (err) {
            console.error('Realtime location update error:', err);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 [Realtime] Subscribed to location updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [Realtime] Location updates channel error — polling fallback will cover');
        }
      });

    // ── Polling fallback (safety net) ───────────────────────────
    // If Realtime disconnects (network hiccup, websocket timeout),
    // this ensures the dashboard self-heals within 60 seconds.
    const pollLocations = async () => {
      try {
        const { data, error } = await supabase
          .from('latest_locations')
          .select('*')
          .in('user_id', memberIdArr);

        if (error) {
          console.warn('[Polling] latest_locations fetch error:', error.message);
          return;
        }

        for (const record of data ?? []) {
          if (memberIds.has(record.user_id)) {
            onLocationUpdate(
              record.user_id,
              record.latitude,
              record.longitude,
              record.accuracy,
              record.updated_at,
              record.speed ?? null,
              record.is_moving ?? null,
              record.battery_level ?? null
            );
          }
        }
        console.log(`🔄 [Polling] Refreshed ${data?.length ?? 0} member locations`);
      } catch (err) {
        console.warn('[Polling] Unexpected error:', err);
      }
    };

    const pollTimer = setInterval(pollLocations, POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [members, onLocationUpdate]);
}
