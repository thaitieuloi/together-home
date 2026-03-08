import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const MIN_DISTANCE_METERS = 10;
const WEB_INTERVAL_MS = 30000; // 30 seconds instead of 10

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useLocationTracking() {
  const { user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<string | number | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user) return;

    const isNative = Capacitor.isNativePlatform();

    const sendLocation = async (lat: number, lng: number, accuracy: number | null) => {
      // Skip if hasn't moved significantly
      if (lastLocationRef.current) {
        const dist = haversine(lastLocationRef.current.lat, lastLocationRef.current.lng, lat, lng);
        if (dist < MIN_DISTANCE_METERS) return;
      }
      lastLocationRef.current = { lat, lng };

      await supabase.from('user_locations').insert({
        user_id: user.id,
        latitude: lat,
        longitude: lng,
        accuracy,
      });
    };

    const startTracking = async () => {
      if (isNative) {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted') {
          console.warn('Location permission denied');
          return;
        }

        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          (position, err) => {
            if (err) {
              console.error('Capacitor geolocation error:', err);
              return;
            }
            if (position) {
              sendLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
            }
          }
        );
        watchIdRef.current = id;
      } else {
        if (!navigator.geolocation) return;

        const sendCurrentLocation = () => {
          navigator.geolocation.getCurrentPosition(
            (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
            () => {}, // silently ignore errors
            { enableHighAccuracy: true, maximumAge: 10000 }
          );
        };

        sendCurrentLocation();
        intervalRef.current = setInterval(sendCurrentLocation, WEB_INTERVAL_MS);
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
