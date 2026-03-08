import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from './useFamily';

export function useRealtimeLocations(
  members: FamilyMemberWithProfile[],
  onUpdate: () => void
) {
  useEffect(() => {
    if (members.length === 0) return;

    const channel = supabase
      .channel('location-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_locations',
        },
        () => {
          // Refetch when any location updates
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [members.length, onUpdate]);
}
