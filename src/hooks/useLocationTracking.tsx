import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (position: { latitude: number; longitude: number; accuracy: number; speed: number | null } | undefined, error: any) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

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
  const watcherIdRef = useRef<string | null>(null);
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
      if (accuracy !== null && accuracy > MAX_ACCURACY_METERS && lastLocationRef.current !== null) {
        console.log(`[LocationTracking] Skipped: accuracy ${accuracy}m > ${MAX_ACCURACY_METERS}m`);
        return;
      }

      const now = Date.now();
      let calculatedSpeed = speed;

      if (lastLocationRef.current) {
        const dist = haversine(lastLocationRef.current.lat, lastLocationRef.current.lng, lat, lng);
        const timeDiffSec = (now - lastLocationRef.current.time) / 1000;

        if (dist < MIN_DISTANCE_METERS) return;

        if (calculatedSpeed === null && timeDiffSec > 0) {
          calculatedSpeed = (dist / timeDiffSec) * 3.6;
        }
      }

      const speedKmh = calculatedSpeed ?? 0;
      isMovingRef.current = speedKmh > SPEED_THRESHOLD_KMH;

      lastLocationRef.current = { lat, lng, time: now };

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
          supabase.functions.invoke('check-geofence', {
            body: { user_id: user.id, latitude: lat, longitude: lng },
          }),
        ]);

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
        pendingQueueRef.current.push({ lat, lng, accuracy, speed: calculatedSpeed });
      }
    };

    const startTracking = async () => {
      if (isNative) {
        // Use background geolocation plugin - runs as Android foreground service
        // This keeps tracking even when app is minimized or screen is off
        try {
          const id = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: 'Đang theo dõi vị trí để gia đình bạn luôn biết bạn ở đâu.',
              backgroundTitle: 'Family Tracker đang chạy',
              requestPermissions: true,
              stale: false,
              distanceFilter: MIN_DISTANCE_METERS,
            },
            (position, error) => {
              if (error) {
                if (error.code === 'NOT_AUTHORIZED') {
                  console.warn('[LocationTracking] Background location not authorized');
                  // Could prompt user to open settings
                }
                return;
              }
              if (!position) return;
              sendLocation(
                position.latitude,
                position.longitude,
                position.accuracy,
                position.speed
              );
            }
          );
          watcherIdRef.current = id;
          console.log('[LocationTracking] Background watcher started:', id);
        } catch (err) {
          console.error('[LocationTracking] Failed to start background geolocation:', err);
        }
      } else {
        // Web fallback - polling with adaptive intervals
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

        const scheduleNext = () => {
          if (intervalRef.current) clearTimeout(intervalRef.current);
          intervalRef.current = setTimeout(() => {
            sendCurrentLocation();
            scheduleNext();
          }, getInterval());
        };

        sendCurrentLocation();
        scheduleNext();

        const handleVisibility = () => {
          scheduleNext();
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
      if (isNative && watcherIdRef.current !== null) {
        BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
        watcherIdRef.current = null;
      }
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [user, getInterval]);
}
