import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from './useFamily';

export function useRealtimeLocations(
  members: FamilyMemberWithProfile[],
  onLocationUpdate: (userId: string, lat: number, lng: number, accuracy: number | null, updatedAt: string) => void
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
          };
          if (record && memberIds.has(record.user_id)) {
            onLocationUpdate(
              record.user_id,
              record.latitude,
              record.longitude,
              record.accuracy,
              record.updated_at
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
