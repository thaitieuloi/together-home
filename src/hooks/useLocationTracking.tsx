import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import {
  flushQueuedLocationsNative,
  persistLocationNative,
  type NativeQueuedLocation,
} from '@/lib/locationTrackingTransport';
import { trackingLog, toErrorMessage } from '@/lib/locationTrackingLogger';

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

type QueuedLocation = NativeQueuedLocation & {
  speed: number | null;
};

const MAX_ACCURACY_METERS = 120;
const MIN_DISTANCE_METERS = 5;
const INTERVAL_MOVING_MS = 7000;
const INTERVAL_IDLE_MS = 20000;
const SPEED_THRESHOLD_KMH = 3;
const MAX_PENDING_QUEUE = 300;
const BATTERY_ALERT_THRESHOLD = 20;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getBatteryLevel(): Promise<number | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const info = await Device.getBatteryInfo();
      return typeof info.batteryLevel === 'number' ? Math.round(info.batteryLevel * 100) : null;
    }
    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();
      return typeof battery.level === 'number' ? Math.round(battery.level * 100) : null;
    }
  } catch {
    trackingLog('debug', 'Battery info unavailable');
  }
  return null;
}

async function ensureAndroidBackgroundPermission(): Promise<boolean> {
  try {
    const fgStatus = await Geolocation.requestPermissions({ permissions: ['location'] });

    if (fgStatus.location !== 'granted') {
      trackingLog('warn', 'Foreground location permission denied', { status: fgStatus.location });
      return false;
    }

    const checkStatus = await Geolocation.checkPermissions();

    if (checkStatus.location === 'granted') {
      trackingLog('info', 'Location permission granted', { status: checkStatus.location });
      return true;
    }

    trackingLog('warn', 'Background location may be missing, opening settings', {
      status: checkStatus.location,
    });

    try {
      await BackgroundGeolocation.openSettings?.();
    } catch {
      trackingLog('warn', 'openSettings not available');
    }

    return false;
  } catch (err) {
    trackingLog('error', 'Permission check failed', { error: toErrorMessage(err) });
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
  const isFlushingQueueRef = useRef(false);
  const lastBatteryRef = useRef<number | null>(null);

  const getInterval = useCallback(() => {
    return isMovingRef.current ? INTERVAL_MOVING_MS : INTERVAL_IDLE_MS;
  }, []);

  const enqueuePending = useCallback((location: QueuedLocation) => {
    pendingQueueRef.current.push(location);
    if (pendingQueueRef.current.length > MAX_PENDING_QUEUE) {
      pendingQueueRef.current = pendingQueueRef.current.slice(-MAX_PENDING_QUEUE);
    }

    trackingLog('warn', 'Queued location for retry', {
      queueSize: pendingQueueRef.current.length,
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
      speed: location.speed,
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const isNative = Capacitor.isNativePlatform();
    let stopped = false;

    trackingLog('info', 'Tracking started', {
      userId: user.id,
      platform: isNative ? 'native' : 'web',
    });

    const flushQueue = async () => {
      if (pendingQueueRef.current.length === 0 || stopped || isFlushingQueueRef.current) return;

      const batch = [...pendingQueueRef.current];
      isFlushingQueueRef.current = true;

      trackingLog('debug', 'Flushing queued locations', {
        count: batch.length,
        platform: isNative ? 'native' : 'web',
      });

      try {
        if (isNative) {
          await flushQueuedLocationsNative(
            user.id,
            batch.map((item) => ({ lat: item.lat, lng: item.lng, accuracy: item.accuracy }))
          );
        } else {
          const { error } = await supabase.from('user_locations').insert(
            batch.map((item) => ({
              user_id: user.id,
              latitude: item.lat,
              longitude: item.lng,
              accuracy: item.accuracy,
            }))
          );

          if (error) throw error;
        }

        pendingQueueRef.current = [];
        trackingLog('info', 'Queued locations flushed successfully', { count: batch.length });
      } catch (err) {
        trackingLog('warn', 'Queue flush failed', {
          count: batch.length,
          error: toErrorMessage(err),
        });
      } finally {
        isFlushingQueueRef.current = false;
      }
    };

    const persistLocation = async (
      lat: number,
      lng: number,
      accuracy: number | null,
      speed: number | null,
      batteryLevel: number | null
    ) => {
      const updatedAt = new Date().toISOString();

      if (isNative) {
        const { geofenceError } = await persistLocationNative({
          userId: user.id,
          lat,
          lng,
          accuracy,
          speed,
          isMoving: isMovingRef.current,
          batteryLevel,
          updatedAt,
        });

        if (geofenceError) {
          trackingLog('warn', 'Geofence check failed (non-blocking)', { geofenceError });
        }

        return;
      }

      const [latestRes, historyRes] = await Promise.all([
        supabase.from('latest_locations').upsert(
          {
            user_id: user.id,
            latitude: lat,
            longitude: lng,
            accuracy,
            speed,
            is_moving: isMovingRef.current,
            battery_level: batteryLevel,
            updated_at: updatedAt,
          },
          { onConflict: 'user_id' }
        ),
        supabase.from('user_locations').insert({
          user_id: user.id,
          latitude: lat,
          longitude: lng,
          accuracy,
        }),
      ]);

      if (latestRes.error) throw latestRes.error;
      if (historyRes.error) throw historyRes.error;

      supabase.functions
        .invoke('check-geofence', {
          body: { user_id: user.id, latitude: lat, longitude: lng },
        })
        .then(({ error }) => {
          if (error) {
            trackingLog('warn', 'Geofence check failed (non-blocking)', {
              error: toErrorMessage(error),
            });
          }
        })
        .catch((err) => {
          trackingLog('warn', 'Geofence invoke failed (non-blocking)', {
            error: toErrorMessage(err),
          });
        });
    };

    const sendLocation = async (lat: number, lng: number, accuracy: number | null, speed: number | null) => {
      if (stopped) return;

      if (accuracy !== null && accuracy > MAX_ACCURACY_METERS && lastLocationRef.current !== null) {
        trackingLog('debug', 'Skipped inaccurate location', { accuracy, max: MAX_ACCURACY_METERS });
        return;
      }

      const now = Date.now();
      let calculatedSpeed = speed;

      if (lastLocationRef.current) {
        const dist = haversine(lastLocationRef.current.lat, lastLocationRef.current.lng, lat, lng);
        const timeDiffSec = (now - lastLocationRef.current.time) / 1000;

        if (dist < MIN_DISTANCE_METERS) {
          trackingLog('debug', 'Skipped tiny movement', { dist, min: MIN_DISTANCE_METERS });
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
        const batteryLevel = await getBatteryLevel();

        if (
          batteryLevel !== null &&
          batteryLevel < BATTERY_ALERT_THRESHOLD &&
          (lastBatteryRef.current === null || lastBatteryRef.current >= BATTERY_ALERT_THRESHOLD)
        ) {
          supabase.functions
            .invoke('send-battery-alert', { body: { battery_level: batteryLevel } })
            .catch((err) => {
              trackingLog('warn', 'Battery alert invoke failed (non-blocking)', {
                error: toErrorMessage(err),
              });
            });
        }
        lastBatteryRef.current = batteryLevel;

        await persistLocation(lat, lng, accuracy, calculatedSpeed, batteryLevel);

        trackingLog('info', 'Location sent to server', {
          lat,
          lng,
          accuracy,
          speed: calculatedSpeed,
          moving: isMovingRef.current,
          batteryLevel,
          queueSize: pendingQueueRef.current.length,
          platform: isNative ? 'native' : 'web',
        });

        await flushQueue();
      } catch (err) {
        enqueuePending({ lat, lng, accuracy, speed: calculatedSpeed });
        trackingLog('error', 'Failed sending location, queued for retry', {
          error: toErrorMessage(err),
          queueSize: pendingQueueRef.current.length,
          lat,
          lng,
          accuracy,
          speed: calculatedSpeed,
        });
      }
    };

    const scheduleTick = (tick: () => Promise<void> | void) => {
      if (intervalRef.current) clearTimeout(intervalRef.current);

      const delay = getInterval();
      intervalRef.current = setTimeout(() => {
        Promise.resolve(tick())
          .catch((err) => {
            trackingLog('warn', 'Heartbeat tick failed', { error: toErrorMessage(err) });
          })
          .finally(() => {
            if (!stopped) scheduleTick(tick);
          });
      }, delay);

      trackingLog('debug', 'Heartbeat scheduled', { delay });
    };

    const startTracking = async () => {
      if (isNative) {
        try {
          const permissionGranted = await ensureAndroidBackgroundPermission();
          if (!permissionGranted) {
            trackingLog('warn', 'Background permission not fully granted yet');
          }

          try {
            const firstFix = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 20000,
              maximumAge: 10000,
            });

            trackingLog('info', 'First GPS fix acquired', {
              lat: firstFix.coords.latitude,
              lng: firstFix.coords.longitude,
              accuracy: firstFix.coords.accuracy,
              speed: firstFix.coords.speed,
            });

            await sendLocation(
              firstFix.coords.latitude,
              firstFix.coords.longitude,
              firstFix.coords.accuracy,
              firstFix.coords.speed
            );
          } catch (err) {
            trackingLog('warn', 'Initial GPS fix failed', { error: toErrorMessage(err) });
          }

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
                  trackingLog('warn', 'Background watcher not authorized, opening settings', {
                    code: error.code,
                    message: error.message,
                  });
                  try {
                    await BackgroundGeolocation.openSettings?.();
                  } catch (openErr) {
                    trackingLog('warn', 'Cannot open settings from watcher', {
                      error: toErrorMessage(openErr),
                    });
                  }
                } else {
                  trackingLog('error', 'Background watcher error', {
                    code: error.code,
                    message: error.message,
                  });
                }
                return;
              }

              if (!position) {
                trackingLog('debug', 'Watcher emitted empty position');
                return;
              }

              trackingLog('debug', 'Watcher emitted location', {
                lat: position.latitude,
                lng: position.longitude,
                accuracy: position.accuracy,
                speed: position.speed,
              });

              void sendLocation(position.latitude, position.longitude, position.accuracy, position.speed);
            }
          );

          watcherIdRef.current = watcherId;
          trackingLog('info', 'Background watcher registered', { watcherId });

          scheduleTick(async () => {
            try {
              const pos = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 10000,
              });

              trackingLog('debug', 'Foreground heartbeat location captured', {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
              });

              await sendLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.coords.speed);
            } catch (err) {
              trackingLog('warn', 'Foreground heartbeat getCurrentPosition failed', {
                error: toErrorMessage(err),
              });
            }
          });
        } catch (error) {
          trackingLog('error', 'Failed to start native tracking', {
            error: toErrorMessage(error),
          });
        }

        return;
      }

      if (!navigator.geolocation) {
        trackingLog('warn', 'Navigator geolocation not available on web');
        return;
      }

      const sendCurrentLocation = async () => {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              trackingLog('debug', 'Web geolocation acquired', {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
              });

              await sendLocation(
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy,
                pos.coords.speed
              );
              resolve();
            },
            (err) => {
              trackingLog('warn', 'Web geolocation failed', {
                code: err.code,
                message: err.message,
              });
              resolve();
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
          );
        });
      };

      void sendCurrentLocation();
      scheduleTick(sendCurrentLocation);
    };

    const handleVisibility = () => {
      trackingLog('debug', 'Visibility changed', { state: document.visibilityState });
      if (document.visibilityState === 'visible') {
        void flushQueue();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    const cleanupPromise = startTracking();

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      cleanupPromise?.then((cleanup) => cleanup?.());

      if (watcherIdRef.current !== null) {
        const watcherId = watcherIdRef.current;
        void BackgroundGeolocation.removeWatcher({ id: watcherId })
          .then(() => {
            trackingLog('info', 'Background watcher removed', { watcherId });
          })
          .catch((err) => {
            trackingLog('warn', 'Failed removing background watcher', {
              watcherId,
              error: toErrorMessage(err),
            });
          });
        watcherIdRef.current = null;
      }

      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }

      trackingLog('info', 'Tracking stopped', {
        pendingQueue: pendingQueueRef.current.length,
      });
    };
  }, [user, getInterval, enqueuePending]);
}
