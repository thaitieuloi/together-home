import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useUnreadMessages(familyId: string | undefined, chatOpen: boolean) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenRef = useRef<string>(new Date().toISOString());

  // Reset when chat opens
  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0);
      lastSeenRef.current = new Date().toISOString();
    }
  }, [chatOpen]);

  // Listen for new messages when chat is closed
  useEffect(() => {
    if (!familyId || !user) return;

    const channel = supabase
      .channel('unread-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          const msg = payload.new as any;
          if (msg.user_id !== user.id && !chatOpen) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyId, user, chatOpen]);

  return { unreadCount, resetUnread: () => setUnreadCount(0) };
}
