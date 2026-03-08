import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export function useLocationTracking() {
  const { user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!user) return;

    const isNative = Capacitor.isNativePlatform();

    const sendLocation = async (lat: number, lng: number, accuracy: number | null) => {
      await supabase.from('user_locations').insert({
        user_id: user.id,
        latitude: lat,
        longitude: lng,
        accuracy,
      });
    };

    const startTracking = async () => {
      if (isNative) {
        // Request permissions on native
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted') {
          console.warn('Location permission denied');
          return;
        }

        // Watch position using Capacitor (native GPS)
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          (position, err) => {
            if (err) {
              console.error('Capacitor geolocation error:', err);
              return;
            }
            if (position) {
              sendLocation(
                position.coords.latitude,
                position.coords.longitude,
                position.coords.accuracy
              );
            }
          }
        );
        watchIdRef.current = id;
      } else {
        // Web fallback
        if (!navigator.geolocation) return;

        const sendCurrentLocation = () => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              sendLocation(
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy
              );
            },
            console.error,
            { enableHighAccuracy: true, maximumAge: 5000 }
          );
        };

        sendCurrentLocation();
        intervalRef.current = setInterval(sendCurrentLocation, 10000);
      }
    };

    startTracking();

    return () => {
      if (isNative && watchIdRef.current !== null) {
        Geolocation.clearWatch({ id: watchIdRef.current as string });
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [user]);
}
