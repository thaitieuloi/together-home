import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from './useFamily';

export function useRealtimeProfiles(
  members: FamilyMemberWithProfile[],
  onProfileUpdate: (userId: string, updates: Partial<FamilyMemberWithProfile['profile']>) => void
) {
  useEffect(() => {
    if (members.length === 0) return;

    const memberIds = new Set(members.map((m) => m.user_id));

    const channel = supabase
      .channel('profile-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const record = payload.new as {
            user_id: string;
            display_name: string;
            avatar_url: string | null;
            status: 'online' | 'idle' | 'offline';
          };
          
          if (record && memberIds.has(record.user_id)) {
            onProfileUpdate(record.user_id, {
              display_name: record.display_name,
              avatar_url: record.avatar_url,
              status: record.status,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [members.length, onProfileUpdate]);
}
