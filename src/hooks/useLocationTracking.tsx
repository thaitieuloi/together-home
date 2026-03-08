import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const MAX_ACCURACY_METERS = 100;
const MIN_DISTANCE_METERS = 10;
const INTERVAL_MOVING_MS = 15000;
const INTERVAL_IDLE_MS = 60000;
const INTERVAL_BACKGROUND_MS = 120000;
const SPEED_THRESHOLD_KMH = 5;

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
  const lastLocationRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const isMovingRef = useRef(false);
  const pendingQueueRef = useRef<Array<{ lat: number; lng: number; accuracy: number | null; speed: number | null }>>([]);

  const getInterval = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return INTERVAL_BACKGROUND_MS;
    }
    return isMovingRef.current ? INTERVAL_MOVING_MS : INTERVAL_IDLE_MS;
  }, []);

  useEffect(() => {
    if (!user) return;

    const isNative = Capacitor.isNativePlatform();

    const sendLocation = async (lat: number, lng: number, accuracy: number | null, speed: number | null) => {
      // Accuracy filter - discard very inaccurate readings, but always allow first location
      if (accuracy !== null && accuracy > MAX_ACCURACY_METERS && lastLocationRef.current !== null) {
        console.log(`[LocationTracking] Skipped: accuracy ${accuracy}m > ${MAX_ACCURACY_METERS}m`);
        return;
      }

      const now = Date.now();
      let calculatedSpeed = speed;

      // Calculate speed and distance from last known position
      if (lastLocationRef.current) {
        const dist = haversine(lastLocationRef.current.lat, lastLocationRef.current.lng, lat, lng);
        const timeDiffSec = (now - lastLocationRef.current.time) / 1000;

        // Skip if hasn't moved significantly
        if (dist < MIN_DISTANCE_METERS) return;

        // Calculate speed in km/h if not provided
        if (calculatedSpeed === null && timeDiffSec > 0) {
          calculatedSpeed = (dist / timeDiffSec) * 3.6;
        }
      }

      // Determine if moving
      const speedKmh = calculatedSpeed ?? 0;
      isMovingRef.current = speedKmh > SPEED_THRESHOLD_KMH;

      lastLocationRef.current = { lat, lng, time: now };

      // Batch write: upsert latest_locations + insert user_locations
      try {
        await Promise.all([
          supabase.from('latest_locations').upsert({
            user_id: user.id,
            latitude: lat,
            longitude: lng,
            accuracy,
            speed: calculatedSpeed,
            is_moving: isMovingRef.current,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' }),
          supabase.from('user_locations').insert({
            user_id: user.id,
            latitude: lat,
            longitude: lng,
            accuracy,
          }),
        ]);

        // Flush any pending queued locations
        if (pendingQueueRef.current.length > 0) {
          const queue = [...pendingQueueRef.current];
          pendingQueueRef.current = [];
          for (const item of queue) {
            await supabase.from('user_locations').insert({
              user_id: user.id,
              latitude: item.lat,
              longitude: item.lng,
              accuracy: item.accuracy,
            });
          }
        }
      } catch {
        // Queue for retry on failure (offline)
        pendingQueueRef.current.push({ lat, lng, accuracy, speed: calculatedSpeed });
      }
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
            if (err || !position) return;
            sendLocation(
              position.coords.latitude,
              position.coords.longitude,
              position.coords.accuracy,
              position.coords.speed
            );
          }
        );
        watchIdRef.current = id;
      } else {
        if (!navigator.geolocation) return;

        const sendCurrentLocation = () => {
          navigator.geolocation.getCurrentPosition(
            (pos) => sendLocation(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy,
              pos.coords.speed
            ),
            () => {},
            { enableHighAccuracy: true, maximumAge: 10000 }
          );
        };

        // Adaptive interval based on movement and visibility
        const scheduleNext = () => {
          if (intervalRef.current) clearTimeout(intervalRef.current);
          intervalRef.current = setTimeout(() => {
            sendCurrentLocation();
            scheduleNext();
          }, getInterval());
        };

        sendCurrentLocation();
        scheduleNext();

        // Listen for visibility changes to adjust interval
        const handleVisibility = () => {
          scheduleNext(); // Reschedule with new interval
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
          document.removeEventListener('visibilitychange', handleVisibility);
        };
      }
    };

    const cleanupPromise = startTracking();

    return () => {
      cleanupPromise?.then((cleanup) => cleanup?.());
      if (isNative && watchIdRef.current !== null) {
        Geolocation.clearWatch({ id: watchIdRef.current as string });
      }
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [user, getInterval]);
}
