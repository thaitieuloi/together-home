import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useLocationTracking() {
  const { user } = useAuth();
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user || !navigator.geolocation) return;

    const sendLocation = async (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      lastLocationRef.current = { lat: latitude, lng: longitude };

      await supabase.from('user_locations').insert({
        user_id: user.id,
        latitude,
        longitude,
        accuracy,
      });
    };

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastLocationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      console.error,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    // Send location every 10 seconds
    const sendCurrentLocation = () => {
      navigator.geolocation.getCurrentPosition(sendLocation, console.error, {
        enableHighAccuracy: true,
        maximumAge: 5000,
      });
    };

    sendCurrentLocation(); // Send immediately
    intervalRef.current = setInterval(sendCurrentLocation, 10000);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [user]);
}
