import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from './useFamily';

export function useRealtimeLocations(
  members: FamilyMemberWithProfile[],
  onUpdate: () => void
) {
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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
          // Debounce: only refetch once per 5 seconds max
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            onUpdate();
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [members.length, onUpdate]);
}
