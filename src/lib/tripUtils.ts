import { Tables } from '@/integrations/supabase/types';

export type TripSegment = {
  type: 'trip' | 'stay';
  startTime: string;
  endTime: string;
  durationMinutes: number;
  points: Tables<'user_locations'>[];
  distance?: number; // meters
  avgSpeed?: number; // km/h
  maxSpeed?: number; // km/h
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
};

const STAY_RADIUS_METERS = 100;    // Increased to absorb small movements
const STAY_DURATION_MINUTES = 10;  // Minimum time to be considered a stay
const GAP_THRESHOLD_MINUTES = 15;
const MIN_TRIP_DISTANCE_METERS = 500; // Ignore trips shorter than this unless duration is long
const MIN_TRIP_DURATION_MINUTES = 4;

/**
 * Senior-level logic for detecting trips and stays (iSharing style)
 * Uses a state-machine approach with radius-based dwell detection.
 */
export function detectTrips(points: Tables<'user_locations'>[]): TripSegment[] {
  if (points.length === 0) return [];

  // 1. Sort chronologically
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const segments: TripSegment[] = [];
  let currentSegment: Tables<'user_locations'>[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    const timeDiff = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 60000;
    
    // Large time gap suggests a break in tracking
    if (timeDiff > GAP_THRESHOLD_MINUTES) {
      if (currentSegment.length > 0) {
        segments.push(processRawSegment(currentSegment));
      }
      currentSegment = [curr];
      continue;
    }
    
    currentSegment.push(curr);
  }
  
  if (currentSegment.length > 0) {
    segments.push(processRawSegment(currentSegment));
  }

  // 2. Refine segments: Split into stays and trips based on movement
  const refinedSegments: TripSegment[] = [];
  for (const seg of segments) {
    const subSegments = splitByMovement(seg.points);
    refinedSegments.push(...subSegments);
  }

  // 3. Merge adjacent stays if they are at the same location
  const mergedStays = mergeAdjacentStays(refinedSegments);

  // 4. Final cleaning: Merge tiny/insignificant trips into adjacent stays
  return cleanTinyTrips(mergedStays);
}

function cleanTinyTrips(segments: TripSegment[]): TripSegment[] {
  if (segments.length === 0) return [];
  
  const results: TripSegment[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    
    // If it's a trip but it's very tiny, we skip it or merge it
    if (seg.type === 'trip') {
      const isTiny = (seg.distance ?? 0) < MIN_TRIP_DISTANCE_METERS && seg.durationMinutes < 10;
      
      if (isTiny && results.length > 0) {
        // Merge into the previous stay
        const prev = results[results.length - 1];
        if (prev.type === 'stay') {
          results[results.length - 1] = {
            ...prev,
            endTime: seg.endTime,
            durationMinutes: prev.durationMinutes + seg.durationMinutes,
            points: [...prev.points, ...seg.points],
            endLocation: seg.endLocation
          };
          continue;
        }
      }
    }
    
    results.push(seg);
  }
  
  return results;
}

function processRawSegment(points: Tables<'user_locations'>[]): TripSegment {
  const start = points[0];
  const end = points[points.length - 1];
  const duration = (new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()) / 60000;
  
  const distance = calculateTotalDistance(points);
  const avgSpeed = duration > 0 ? (distance / 1000) / (duration / 60) : 0;
  
  // Calculate max speed between points
  let maxSpeed = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i-1].latitude, points[i-1].longitude, points[i].latitude, points[i].longitude);
    const t = (new Date(points[i].timestamp).getTime() - new Date(points[i-1].timestamp).getTime()) / 3600000; // hours
    if (t > 0) {
      const s = (d / 1000) / t;
      if (s < 150 && s > maxSpeed) maxSpeed = s; // Filter outlier spikes > 150km/h
    }
  }

  return {
    type: distance > STAY_RADIUS_METERS ? 'trip' : 'stay',
    startTime: start.timestamp,
    endTime: end.timestamp,
    durationMinutes: Math.round(duration),
    points,
    distance: Math.round(distance),
    avgSpeed: Number(avgSpeed.toFixed(1)),
    maxSpeed: Number(maxSpeed.toFixed(1)),
    startLocation: { lat: start.latitude, lng: start.longitude },
    endLocation: { lat: end.latitude, lng: end.longitude },
  };
}

/**
 * Splits a sequence of points into Trips and Stays.
 * If points stay within a radius for a certain time, it's a Stay.
 */
function splitByMovement(points: Tables<'user_locations'>[]): TripSegment[] {
  if (points.length < 2) return [processRawSegment(points)];

  const results: TripSegment[] = [];
  let currentGroup: Tables<'user_locations'>[] = [points[0]];
  let isPotentialStay = true;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const startP = currentGroup[0];
    
    const distFromStart = haversine(startP.latitude, startP.longitude, p.latitude, p.longitude);
    
    if (distFromStart > STAY_RADIUS_METERS) {
      // We moved out of the radius. 
      // Check if the current group was a valid stay
      const duration = (new Date(p.timestamp).getTime() - new Date(startP.timestamp).getTime()) / 60000;
      
      if (duration >= STAY_DURATION_MINUTES) {
        // Yes, the previous group was a stay
        results.push(processRawSegment(currentGroup));
        currentGroup = [p];
      } else {
        // No, we are just moving. Continue adding to group
        currentGroup.push(p);
      }
    } else {
      currentGroup.push(p);
    }
  }
  
  if (currentGroup.length > 0) {
    results.push(processRawSegment(currentGroup));
  }
  
  return results;
}

function mergeAdjacentStays(segments: TripSegment[]): TripSegment[] {
  if (segments.length < 2) return segments;
  
  const merged: TripSegment[] = [];
  let current = segments[0];
  
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    
    // If both are stays and very close to each other, merge them
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
          endLocation: next.endLocation
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

function calculateTotalDistance(points: Tables<'user_locations'>[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return total;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
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
