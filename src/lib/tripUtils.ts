import { Tables } from '@/integrations/supabase/types';

export interface TripSegment {
  type: 'trip' | 'stay';
  startTime: string;
  endTime: string;
  durationMinutes: number;
  points: Tables<'user_locations'>[];
  distance?: number;   // metres
  avgSpeed?: number;   // m/s
  maxSpeed?: number;   // m/s
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
}

// ─── Activity classification ──────────────────────────────────────────────────

export type ActivityType = 'driving' | 'cycling' | 'walking' | 'stationary';

export function getActivityType(avgSpeedMs: number): ActivityType {
  const kmh = avgSpeedMs * 3.6;
  if (kmh > 25) return 'driving';
  if (kmh > 8)  return 'cycling';
  if (kmh > 0.5) return 'walking';
  return 'stationary';
}

const ACTIVITY_LABELS: Record<ActivityType, { vi: string; en: string }> = {
  driving:     { vi: 'Đi xe',       en: 'Driving'    },
  cycling:     { vi: 'Đi xe đạp',   en: 'Cycling'    },
  walking:     { vi: 'Đi bộ',       en: 'Walking'    },
  stationary:  { vi: 'Nghỉ tại chỗ', en: 'Stationary' },
};

export function getActivityLabel(avgSpeedMs: number, lang: 'vi' | 'en' = 'vi'): string {
  return ACTIVITY_LABELS[getActivityType(avgSpeedMs)][lang];
}

// ─── Distance helper ──────────────────────────────────────────────────────────

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Trip detection ───────────────────────────────────────────────────────────

const STATIONARY_SPEED_THRESHOLD = 0.8; // m/s ≈ 3 km/h
const LARGE_GAP_MINUTES = 30;
const MIN_SEGMENT_DURATION = 1; // minutes — filter GPS noise below this

/**
 * Detects trips and stays from a list of location points.
 * Input may be in any order; function sorts internally.
 */
export function detectTrips(points: Tables<'user_locations'>[]): TripSegment[] {
  if (points.length === 0) return [];

  // Sort chronologically
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // ── Pass 1: split on large time gaps ────────────────────────────────────────
  const coarseSegments: Tables<'user_locations'>[][] = [];
  let current: Tables<'user_locations'>[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const timeDiff =
      (new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime()) /
      60000;
    if (timeDiff > LARGE_GAP_MINUTES) {
      coarseSegments.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  if (current.length > 0) coarseSegments.push(current);

  // ── Pass 2: split each coarse segment by movement state ─────────────────────
  const refined: TripSegment[] = [];

  for (const seg of coarseSegments) {
    if (seg.length < 3) {
      refined.push(finalizeSegment(seg));
      continue;
    }

    const base = finalizeSegment(seg);
    let isMoving = (base.avgSpeed ?? 0) > STATIONARY_SPEED_THRESHOLD;
    let subPoints: Tables<'user_locations'>[] = [seg[0]];

    for (let i = 1; i < seg.length; i++) {
      const p = seg[i];
      const pPrev = seg[i - 1];
      const d = getDistance(pPrev.latitude, pPrev.longitude, p.latitude, p.longitude);
      const t = (new Date(p.timestamp).getTime() - new Date(pPrev.timestamp).getTime()) / 1000;
      const s = t > 0 ? d / t : 0;
      const pMoving = s > STATIONARY_SPEED_THRESHOLD;

      if (pMoving !== isMoving) {
        if (subPoints.length > 0) refined.push(finalizeSegment(subPoints));
        subPoints = [p];
        isMoving = pMoving;
      } else {
        subPoints.push(p);
      }
    }
    if (subPoints.length > 0) refined.push(finalizeSegment(subPoints));
  }

  // ── Pass 3: classify, filter noise, sort ────────────────────────────────────
  return refined
    .map((s) => {
      const isStay = (s.avgSpeed ?? 0) < STATIONARY_SPEED_THRESHOLD || (s.distance ?? 0) < 50;
      return { ...s, type: isStay ? 'stay' : 'trip' } as TripSegment;
    })
    .filter((s) => s.points.length > 0)
    .filter((s) => s.durationMinutes >= MIN_SEGMENT_DURATION) // ← remove GPS noise
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function finalizeSegment(points: Tables<'user_locations'>[]): TripSegment {
  const start = points[0];
  const end = points[points.length - 1];
  const durationMin =
    (new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()) / 60000;

  let totalDist = 0;
  let maxS = 0;
  for (let i = 1; i < points.length; i++) {
    const d = getDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
    totalDist += d;
    const t = (new Date(points[i].timestamp).getTime() - new Date(points[i - 1].timestamp).getTime()) / 1000;
    const s = t > 0 ? d / t : 0;
    if (s > maxS) maxS = s;
  }

  return {
    type: 'trip',
    startTime: start.timestamp,
    endTime: end.timestamp,
    durationMinutes: Math.round(durationMin),
    points,
    distance: Math.round(totalDist),
    avgSpeed: durationMin > 0 ? totalDist / (durationMin * 60) : 0,
    maxSpeed: maxS,
    startLocation: { lat: start.latitude, lng: start.longitude },
    endLocation:   { lat: end.latitude,   lng: end.longitude   },
  };
}
