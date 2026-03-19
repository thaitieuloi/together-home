import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Returns a Set of user_ids that have sent an SOS alert within the last 5 minutes.
 */
export function useActiveSOSAlerts() {
  const { user } = useAuth();
  const [activeSOSUserIds, setActiveSOSUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const fetchActive = async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('sos_alerts')
        .select('user_id')
        .gte('created_at', fiveMinAgo);

      if (data) {
        setActiveSOSUserIds(new Set(data.map((a) => a.user_id)));
      }
    };

    fetchActive();

    // Listen for new SOS alerts
    const channel = supabase
      .channel('active-sos-watch')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sos_alerts' },
        (payload) => {
          const alert = payload.new as { user_id: string };
          setActiveSOSUserIds((prev) => new Set(prev).add(alert.user_id));

          // Auto-remove after 5 minutes
          setTimeout(() => {
            setActiveSOSUserIds((prev) => {
              const next = new Set(prev);
              next.delete(alert.user_id);
              return next;
            });
          }, 5 * 60 * 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return activeSOSUserIds;
}
