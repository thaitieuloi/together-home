import { Tables } from '@/integrations/supabase/types';

export type TripSegment = {
  type: 'trip' | 'stay';
  startTime: string;
  endTime: string;
  durationMinutes: number;
  points: Tables<'user_locations'>[];
  distance?: number; // meters
  avgSpeed?: number; // km/h (calculated from distance/time)
  maxSpeed?: number; // km/h
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
};

// ─── Tuning constants ─────────────────────────────────────────────────
const STAY_RADIUS_METERS = 60;       // Tighter radius for urban accuracy
const STAY_DURATION_MINUTES = 5;     // Minimum dwell time to count as a "stay"
const GAP_THRESHOLD_MINUTES = 10;    // Time gap to split into separate segments
const MIN_TRIP_DISTANCE_METERS = 200; // Trips shorter than this get absorbed
const MIN_TRIP_POINTS = 3;           // Need at least 3 GPS fixes to be a real trip

/**
 * Improved trip detection using rolling centroid approach.
 * 1. Split by time gaps
 * 2. Use centroid-based dwell detection (not just first-point radius)
 * 3. Merge adjacent stays at same location
 * 4. Clean up insignificant micro-trips
 */
export function detectTrips(points: Tables<'user_locations'>[]): TripSegment[] {
  if (points.length === 0) return [];

  // Sort chronologically
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // 1. Split by time gaps
  const rawChunks: Tables<'user_locations'>[][] = [];
  let chunk: Tables<'user_locations'>[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime()) / 60000;
    if (gap > GAP_THRESHOLD_MINUTES) {
      if (chunk.length > 0) rawChunks.push(chunk);
      chunk = [sorted[i]];
    } else {
      chunk.push(sorted[i]);
    }
  }
  if (chunk.length > 0) rawChunks.push(chunk);

  // 2. Detect stays vs trips within each chunk using rolling centroid
  const segments: TripSegment[] = [];
  for (const c of rawChunks) {
    segments.push(...detectStaysAndTrips(c));
  }

  // 3. Merge adjacent stays at same location
  const merged = mergeAdjacentStays(segments);

  // 4. Clean micro-trips
  return cleanMicroTrips(merged);
}

/**
 * Rolling centroid algorithm:
 * - Maintain a running centroid of "dwelling" points
 * - When a point moves outside STAY_RADIUS from centroid, check if accumulated
 *   dwell time >= STAY_DURATION_MINUTES → emit a stay, start new segment
 * - Otherwise keep accumulating as potential trip
 */
function detectStaysAndTrips(points: Tables<'user_locations'>[]): TripSegment[] {
  if (points.length < 2) {
    return [buildSegment(points, 'stay')];
  }

  const results: TripSegment[] = [];

  let dwellPoints: Tables<'user_locations'>[] = [points[0]];
  let centroidLat = points[0].latitude;
  let centroidLng = points[0].longitude;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const distFromCentroid = haversine(centroidLat, centroidLng, p.latitude, p.longitude);

    if (distFromCentroid <= STAY_RADIUS_METERS) {
      // Still within dwell zone → update centroid
      dwellPoints.push(p);
      centroidLat = avg(dwellPoints.map(dp => dp.latitude));
      centroidLng = avg(dwellPoints.map(dp => dp.longitude));
    } else {
      // Moved outside dwell zone
      const dwellDuration = timeDiffMinutes(dwellPoints[0], dwellPoints[dwellPoints.length - 1]);

      if (dwellDuration >= STAY_DURATION_MINUTES && dwellPoints.length >= 2) {
        // Previous dwell was a valid stay
        results.push(buildSegment(dwellPoints, 'stay'));
        // Start fresh with this point
        dwellPoints = [p];
        centroidLat = p.latitude;
        centroidLng = p.longitude;
      } else {
        // Not a valid stay — it's part of a trip. Just add point.
        dwellPoints.push(p);
        // Don't update centroid (we're moving, let distance grow)
      }
    }
  }

  // Flush remaining points
  if (dwellPoints.length > 0) {
    const dwellDuration = timeDiffMinutes(dwellPoints[0], dwellPoints[dwellPoints.length - 1]);
    const totalDist = calculateTotalDistance(dwellPoints);

    if (dwellDuration >= STAY_DURATION_MINUTES && totalDist < STAY_RADIUS_METERS * 3) {
      results.push(buildSegment(dwellPoints, 'stay'));
    } else if (totalDist >= MIN_TRIP_DISTANCE_METERS) {
      results.push(buildSegment(dwellPoints, 'trip'));
    } else {
      results.push(buildSegment(dwellPoints, 'stay'));
    }
  }

  // Post-process: classify segments that aren't explicitly set
  return results.map(seg => {
    if (seg.type === 'trip') return seg;
    // Re-check if a "stay" is actually a trip based on total distance
    const dist = seg.distance ?? 0;
    if (dist >= MIN_TRIP_DISTANCE_METERS && seg.points.length >= MIN_TRIP_POINTS) {
      return { ...seg, type: 'trip' as const };
    }
    return seg;
  });
}

function buildSegment(points: Tables<'user_locations'>[], type: 'trip' | 'stay'): TripSegment {
  const start = points[0];
  const end = points[points.length - 1];
  const duration = timeDiffMinutes(start, end);
  const distance = calculateTotalDistance(points);

  // Calculate speed from distance/time (no speed column in DB)
  const avgSpeed = duration > 0 ? (distance / 1000) / (duration / 60) : 0;

  let maxSpeed = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude);
    const t = (new Date(points[i].timestamp).getTime() - new Date(points[i - 1].timestamp).getTime()) / 3600000;
    if (t > 0.001) { // at least ~3.6 seconds between points
      const s = (d / 1000) / t;
      // Filter GPS spikes: max 200km/h for driving, ignore impossible values
      if (s < 200 && s > maxSpeed) maxSpeed = s;
    }
  }

  return {
    type,
    startTime: start.timestamp,
    endTime: end.timestamp,
    durationMinutes: Math.max(1, Math.round(duration)),
    points,
    distance: Math.round(distance),
    avgSpeed: Number(avgSpeed.toFixed(1)),
    maxSpeed: Number(maxSpeed.toFixed(1)),
    startLocation: { lat: start.latitude, lng: start.longitude },
    endLocation: { lat: end.latitude, lng: end.longitude },
  };
}

function mergeAdjacentStays(segments: TripSegment[]): TripSegment[] {
  if (segments.length < 2) return segments;

  const merged: TripSegment[] = [];
  let current = segments[0];

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];

    if (current.type === 'stay' && next.type === 'stay') {
      const dist = haversine(
        current.endLocation.lat, current.endLocation.lng,
        next.startLocation.lat, next.startLocation.lng
      );
      if (dist < STAY_RADIUS_METERS * 2) {
        current = {
          ...current,
          endTime: next.endTime,
          durationMinutes: current.durationMinutes + next.durationMinutes,
          points: [...current.points, ...next.points],
          endLocation: next.endLocation,
        };
        continue;
      }
    }

    merged.push(current);
    current = next;
  }

  merged.push(current);
  return merged;
}

function cleanMicroTrips(segments: TripSegment[]): TripSegment[] {
  if (segments.length === 0) return [];

  const results: TripSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.type === 'trip') {
      const isMicro = (seg.distance ?? 0) < MIN_TRIP_DISTANCE_METERS || seg.points.length < MIN_TRIP_POINTS;

      if (isMicro && results.length > 0 && results[results.length - 1].type === 'stay') {
        // Absorb into previous stay
        const prev = results[results.length - 1];
        results[results.length - 1] = {
          ...prev,
          endTime: seg.endTime,
          durationMinutes: prev.durationMinutes + seg.durationMinutes,
          points: [...prev.points, ...seg.points],
          endLocation: seg.endLocation,
        };
        continue;
      }
    }

    results.push(seg);
  }

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function timeDiffMinutes(a: Tables<'user_locations'>, b: Tables<'user_locations'>): number {
  return Math.abs(new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) / 60000;
}

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function calculateTotalDistance(points: Tables<'user_locations'>[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(
      points[i - 1].latitude, points[i - 1].longitude,
      points[i].latitude, points[i].longitude
    );
  }
  return total;
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate instantaneous speed (km/h) between two consecutive location points.
 */
export function calcSpeedKmh(
  p1: Tables<'user_locations'>,
  p2: Tables<'user_locations'>
): number {
  const dist = haversine(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
  const timeSec = Math.abs(new Date(p2.timestamp).getTime() - new Date(p1.timestamp).getTime()) / 1000;
  if (timeSec < 1) return 0;
  const kmh = (dist / 1000) / (timeSec / 3600);
  return kmh > 200 ? 0 : kmh; // filter GPS spikes
}

export function getActivityType(avgSpeedKmh: number): 'walking' | 'cycling' | 'driving' {
  if (avgSpeedKmh < 6) return 'walking';
  if (avgSpeedKmh < 25) return 'cycling';
  return 'driving';
}

export function getActivityLabel(type: 'walking' | 'cycling' | 'driving', language: 'vi' | 'en'): string {
  const labels = {
    walking: { vi: 'Đi bộ', en: 'Walking' },
    cycling: { vi: 'Đạp xe', en: 'Cycling' },
    driving: { vi: 'Ô tô/Xe máy', en: 'Driving' },
  };
  return labels[type][language];
}
