import { CapacitorHttp } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

export type NativeLocationPayload = {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  isMoving: boolean;
  batteryLevel: number | null;
  updatedAt: string;
};

export type NativeQueuedLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PUBLIC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function is2xx(status: number) {
  return status >= 200 && status < 300;
}

function responseText(data: unknown) {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return 'Unknown response';
  }
}

async function getAuthHeaders() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session?.access_token) throw new Error('Missing auth session for native location transport');

  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: PUBLIC_KEY,
    'Content-Type': 'application/json',
  };
}

function assertSuccess(status: number, data: unknown, label: string) {
  if (!is2xx(status)) {
    throw new Error(`${label} failed (${status}): ${responseText(data)}`);
  }
}

export async function persistLocationNative(payload: NativeLocationPayload) {
  const headers = await getAuthHeaders();

  const [latestRes, historyRes] = await Promise.all([
    CapacitorHttp.request({
      method: 'POST',
      url: `${BASE_URL}/rest/v1/latest_locations?on_conflict=user_id`,
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      data: {
        user_id: payload.userId,
        latitude: payload.lat,
        longitude: payload.lng,
        accuracy: payload.accuracy,
        speed: payload.speed,
        is_moving: payload.isMoving,
        battery_level: payload.batteryLevel,
        updated_at: payload.updatedAt,
      },
    }),
    CapacitorHttp.request({
      method: 'POST',
      url: `${BASE_URL}/rest/v1/user_locations`,
      headers: {
        ...headers,
        Prefer: 'return=minimal',
      },
      data: {
        user_id: payload.userId,
        latitude: payload.lat,
        longitude: payload.lng,
        accuracy: payload.accuracy,
      },
    }),
  ]);

  assertSuccess(latestRes.status, latestRes.data, 'latest_locations upsert');
  assertSuccess(historyRes.status, historyRes.data, 'user_locations insert');

  const geofenceRes = await CapacitorHttp.request({
    method: 'POST',
    url: `${BASE_URL}/functions/v1/check-geofence`,
    headers,
    data: {
      user_id: payload.userId,
      latitude: payload.lat,
      longitude: payload.lng,
    },
  });

  if (!is2xx(geofenceRes.status)) {
    return {
      geofenceError: `check-geofence failed (${geofenceRes.status}): ${responseText(geofenceRes.data)}`,
    };
  }

  return { geofenceError: null as string | null };
}

export async function flushQueuedLocationsNative(userId: string, queue: NativeQueuedLocation[]) {
  if (queue.length === 0) return;

  const headers = await getAuthHeaders();
  const insertRes = await CapacitorHttp.request({
    method: 'POST',
    url: `${BASE_URL}/rest/v1/user_locations`,
    headers: {
      ...headers,
      Prefer: 'return=minimal',
    },
    data: queue.map((item) => ({
      user_id: userId,
      latitude: item.lat,
      longitude: item.lng,
      accuracy: item.accuracy,
    })),
  });

  assertSuccess(insertRes.status, insertRes.data, 'queued user_locations insert');
}
