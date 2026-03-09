import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface LiveSession {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

export function useLiveLocationSharing(familyId: string | undefined) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [mySession, setMySession] = useState<LiveSession | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!familyId || !user) return;
    const { data } = await supabase
      .from('live_location_sessions')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString());

    if (data) {
      const typed = data as unknown as LiveSession[];
      setSessions(typed);
      setMySession(typed.find((s) => s.user_id === user.id) ?? null);
    }
  }, [familyId, user]);

  useEffect(() => {
    fetchSessions();

    if (!familyId) return;

    const channel = supabase
      .channel('live-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_location_sessions' },
        () => fetchSessions()
      )
      .subscribe();

    // Check expired sessions every 30s
    const interval = setInterval(fetchSessions, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchSessions, familyId]);

  const startSharing = useCallback(
    async (durationMinutes: number) => {
      if (!user || !familyId) return;
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

      // Deactivate existing session first
      if (mySession) {
        await supabase
          .from('live_location_sessions')
          .update({ is_active: false })
          .eq('id', mySession.id);
      }

      await supabase.from('live_location_sessions').insert({
        user_id: user.id,
        family_id: familyId,
        expires_at: expiresAt,
      });

      await fetchSessions();
    },
    [user, familyId, mySession, fetchSessions]
  );

  const stopSharing = useCallback(async () => {
    if (!mySession) return;
    await supabase
      .from('live_location_sessions')
      .update({ is_active: false })
      .eq('id', mySession.id);
    await fetchSessions();
  }, [mySession, fetchSessions]);

  const isUserSharing = useCallback(
    (userId: string) => sessions.some((s) => s.user_id === userId),
    [sessions]
  );

  const getSessionForUser = useCallback(
    (userId: string) => sessions.find((s) => s.user_id === userId) ?? null,
    [sessions]
  );

  return {
    sessions,
    mySession,
    startSharing,
    stopSharing,
    isUserSharing,
    getSessionForUser,
    isSharing: !!mySession,
  };
}
