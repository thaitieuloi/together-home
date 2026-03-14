import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (
      position:
        | {
            latitude: number;
            longitude: number;
            accuracy: number;
            speed: number | null;
          }
        | undefined,
      error: { code?: string; message?: string } | undefined
    ) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings?: () => Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

type TimeoutHandle = ReturnType<typeof setTimeout>;

type QueuedLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
};

const MAX_ACCURACY_METERS = 120;
const MIN_DISTANCE_METERS = 5;
const INTERVAL_MOVING_MS = 7000;
const INTERVAL_IDLE_MS = 20000;
const SPEED_THRESHOLD_KMH = 3;
const MAX_PENDING_QUEUE = 300;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Requests foreground location permission then guides the user to grant
 * "Allow all the time" (ACCESS_BACKGROUND_LOCATION) in Android Settings.
 * On Android 11+ the OS does not allow apps to prompt for background
 * location directly — the user must do it manually in Settings.
 */
async function ensureAndroidBackgroundPermission(): Promise<boolean> {
  try {
    const fgStatus = await Geolocation.requestPermissions({ permissions: ['location'] });

    if (fgStatus.location !== 'granted') {
      console.warn('[LocationTracking] Foreground location permission denied.');
      return false;
    }

    const checkStatus = await Geolocation.checkPermissions();

    if (checkStatus.location === 'granted') {
      return true;
    }

    console.warn(
      '[LocationTracking] Background location not yet granted. ' +
        'Guiding user to Settings so they can choose "Allow all the time".'
    );

    try {
      await BackgroundGeolocation.openSettings?.();
    } catch {
      console.warn('[LocationTracking] openSettings not available on this platform/version.');
    }

    return false;
  } catch (err) {
    console.error('[LocationTracking] Permission check failed:', err);
    return false;
  }
}

export function useLocationTracking() {
  const { user } = useAuth();
  const intervalRef = useRef<TimeoutHandle | null>(null);
  const watcherIdRef = useRef<string | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const isMovingRef = useRef(false);
  const pendingQueueRef = useRef<QueuedLocation[]>([]);

  const getInterval = useCallback(() => {
    return isMovingRef.current ? INTERVAL_MOVING_MS : INTERVAL_IDLE_MS;
  }, []);

  const enqueuePending = useCallback((location: QueuedLocation) => {
    pendingQueueRef.current.push(location);
    if (pendingQueueRef.current.length > MAX_PENDING_QUEUE) {
      pendingQueueRef.current = pendingQueueRef.current.slice(-MAX_PENDING_QUEUE);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const isNative = Capacitor.isNativePlatform();
    let stopped = false;

    const flushQueue = async () => {
      if (pendingQueueRef.current.length === 0 || stopped) return;

      const batch = [...pendingQueueRef.current];
      const { error } = await supabase.from('user_locations').insert(
        batch.map((item) => ({
          user_id: user.id,
          latitude: item.lat,
          longitude: item.lng,
          accuracy: item.accuracy,
        }))
      );

      if (error) {
        throw error;
      }

      pendingQueueRef.current = [];
    };

    const sendLocation = async (lat: number, lng: number, accuracy: number | null, speed: number | null) => {
      if (stopped) return;

      if (accuracy !== null && accuracy > MAX_ACCURACY_METERS && lastLocationRef.current !== null) {
        return;
      }

      const now = Date.now();
      let calculatedSpeed = speed;

      if (lastLocationRef.current) {
        const dist = haversine(lastLocationRef.current.lat, lastLocationRef.current.lng, lat, lng);
        const timeDiffSec = (now - lastLocationRef.current.time) / 1000;

        if (dist < MIN_DISTANCE_METERS) {
          return;
        }

        if ((calculatedSpeed === null || Number.isNaN(calculatedSpeed)) && timeDiffSec > 0) {
          calculatedSpeed = (dist / timeDiffSec) * 3.6;
        }
      }

      const speedKmh = calculatedSpeed ?? 0;
      isMovingRef.current = speedKmh > SPEED_THRESHOLD_KMH;
      lastLocationRef.current = { lat, lng, time: now };

      try {
        const [latestRes, historyRes, geofenceRes] = await Promise.all([
          supabase.from('latest_locations').upsert(
            {
              user_id: user.id,
              latitude: lat,
              longitude: lng,
              accuracy,
              speed: calculatedSpeed,
              is_moving: isMovingRef.current,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          ),
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

        if (latestRes.error) throw latestRes.error;
        if (historyRes.error) throw historyRes.error;
        if (geofenceRes.error) throw geofenceRes.error;

        await flushQueue();
      } catch {
        enqueuePending({ lat, lng, accuracy, speed: calculatedSpeed });
      }
    };

    const scheduleTick = (tick: () => Promise<void> | void) => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
      intervalRef.current = setTimeout(async () => {
        await tick();
        if (!stopped) scheduleTick(tick);
      }, getInterval());
    };

    const startTracking = async () => {
      if (isNative) {
        try {
          await ensureAndroidBackgroundPermission();

          try {
            const firstFix = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 20000,
              maximumAge: 10000,
            });
            await sendLocation(
              firstFix.coords.latitude,
              firstFix.coords.longitude,
              firstFix.coords.accuracy,
              firstFix.coords.speed
            );
          } catch {
            // Ignore first-fix failures — the watcher below will keep delivering positions.
          }

          /*
           * BackgroundGeolocation.addWatcher() starts an Android Foreground Service
           * (declared in AndroidManifest.xml) that continues delivering GPS positions
           * even when the app is minimised or the screen is off.
           *
           * NOTE: setTimeout / setInterval (scheduleTick) do NOT run when the Android
           * WebView is paused. On native we rely solely on this native watcher callback
           * for background updates. The heartbeat tick below is intentionally only used
           * while the app is in the foreground as an extra safety net.
           */
          const watcherId = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: 'Đang theo dõi vị trí để gia đình bạn luôn biết bạn ở đâu.',
              backgroundTitle: 'Family Tracker đang chạy nền',
              requestPermissions: true,
              stale: false,
              distanceFilter: MIN_DISTANCE_METERS,
            },
            async (position, error) => {
              if (error) {
                if (error.code === 'NOT_AUTHORIZED') {
                  console.warn(
                    '[LocationTracking] Background location not authorised. ' +
                      'Opening Settings so the user can grant "Allow all the time".'
                  );
                  try {
                    await BackgroundGeolocation.openSettings?.();
                  } catch {
                    // openSettings may not be available on all OS versions — ignore.
                  }
                } else {
                  console.error('[LocationTracking] Watcher error:', error);
                }
                return;
              }
              if (!position) return;
              void sendLocation(position.latitude, position.longitude, position.accuracy, position.speed);
            }
          );

          watcherIdRef.current = watcherId;

          /*
           * Foreground heartbeat: when the app IS visible, poll at a regular interval
           * as a safety net in case the native watcher misses a fix.
           * This tick stops automatically when the WebView is paused by Android.
           */
          scheduleTick(async () => {
            try {
              const pos = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 10000,
              });
              await sendLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.coords.speed);
            } catch {
              // Ignore individual heartbeat failures.
            }
          });
        } catch (error) {
          console.error('[LocationTracking] Failed to start native background tracking:', error);
        }

        return;
      }

      if (!navigator.geolocation) return;

      const sendCurrentLocation = async () => {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              await sendLocation(
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy,
                pos.coords.speed
              );
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
          );
        });
      };

      void sendCurrentLocation();
      scheduleTick(sendCurrentLocation);

      const handleVisibility = () => scheduleTick(sendCurrentLocation);
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    };

    const cleanupPromise = startTracking();

    return () => {
      stopped = true;
      cleanupPromise?.then((cleanup) => cleanup?.());

      if (watcherIdRef.current !== null) {
        void BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current }).catch(() => undefined);
        watcherIdRef.current = null;
      }

      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user, getInterval, enqueuePending]);
}
