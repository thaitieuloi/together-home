import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from './useFamily';

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
  useEffect(() => {
    if (members.length === 0) return;

    const memberIds = new Set(members.map((m) => m.user_id));

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
          if (record && memberIds.has(record.user_id)) {
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
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [members.length, onLocationUpdate]);
}
