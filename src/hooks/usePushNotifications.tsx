import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    const register = async () => {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        console.warn('Push notification permission denied');
        return;
      }

      await PushNotifications.register();

      PushNotifications.addListener('registration', async (token) => {
        console.log('Push token:', token.value);
        // Store the token in the database for later use
        await supabase.from('profiles').update({
          // You can add a push_token column to profiles table later
        }).eq('user_id', user.id);
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received:', notification);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Push action:', action);
      });
    };

    register();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [user]);
}
