import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from './useFamily';

export function useRealtimeProfiles(
  members: FamilyMemberWithProfile[],
  onProfileUpdate: (userId: string, updates: Partial<FamilyMemberWithProfile['profile']>) => void
) {
  // Use a ref to keep member IDs current without re-triggering the useEffect
  const memberIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    memberIdsRef.current = new Set(members.map((m) => m.user_id));
  }, [members]);

  useEffect(() => {
    // We want this effect to run once and subscribe to ALL profile changes 
    // that we have access to via RLS.
    const channel = supabase
      .channel('profile-updates-global')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          try {
            const record = payload.new as {
              user_id: string;
              display_name: string;
              avatar_url: string | null;
              status: 'online' | 'idle' | 'offline' | 'logged_out';
              updated_at: string;
            };
            
            // Check if this profile belongs to one of our family members
            if (record && record.user_id && memberIdsRef.current.has(record.user_id)) {
              console.log(`📡 [Realtime] Profile update for ${record.user_id}: ${record.status}`);
              onProfileUpdate(record.user_id, {
                display_name: record.display_name,
                avatar_url: record.avatar_url,
                status: record.status,
                updated_at: record.updated_at,
              });
            }
          } catch (err) {
            console.error('Realtime profile update error:', err);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 [Realtime] Subscribed to global profile updates');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onProfileUpdate]); // members is NOT a dependency anymore
}
