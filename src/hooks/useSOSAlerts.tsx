import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export function useSOSAlerts() {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('sos-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sos_alerts',
        },
        async (payload) => {
          const alert = payload.new as any;
          // Don't alert the sender
          if (alert.user_id === user.id) return;

          // Get sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', alert.user_id)
            .single();

          // Vibrate urgently on mobile
          if ('vibrate' in navigator) {
            navigator.vibrate([300, 100, 300, 100, 300, 100, 300]);
          }

          // Play urgent SOS sound
          try {
            const audio = new Audio('/notification.mp3');
            audio.volume = 1.0;
            audio.play().catch(() => {});
          } catch {}

          // Get address
          const { reverseGeocodeString } = await import('@/lib/geocoding');
          const address = await reverseGeocodeString(alert.latitude, alert.longitude);

          toast({
            title: '🆘 SOS Khẩn cấp!',
            description: `${profile?.display_name || 'Thành viên'} cần giúp đỡ khẩn cấp tại: ${address}`,
            variant: 'destructive',
            duration: 15000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);
}
