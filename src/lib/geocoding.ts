/**
 * Enhanced Reverse geocoding using Nominatim (OpenStreetMap)
 * - Optimized for Vietnamese addresses with house numbers
 * - Persistent cache via localStorage to reduce API calls
 * - Rate limit: 1 req/sec with in-flight dedup
 * - Multi-level address formatting (full, short, place category)
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface GeocodedAddress {
  full: string;          // Full formatted address
  short: string;         // First 2 parts for compact display
  houseNumber?: string;  // Street number if available
  road?: string;         // Street name
  area?: string;         // Ward/Suburb
  district?: string;     // District/Town
  city?: string;         // City/Province
  category?: PlaceCategory; // Auto-detected place type
  poiName?: string;      // Point of interest name (e.g. "Trường THPT Hóc Môn")
}

export type PlaceCategory =
  | 'home' | 'work' | 'school' | 'hospital' | 'restaurant'
  | 'cafe' | 'shop' | 'park' | 'gym' | 'gas_station'
  | 'parking' | 'worship' | 'hotel' | 'entertainment' | 'other';

// ─── Category Detection ─────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<PlaceCategory, string[]> = {
  home: ['residential', 'apartments', 'house', 'nhà', 'chung cư', 'căn hộ'],
  work: ['office', 'company', 'commercial', 'industrial', 'công ty', 'văn phòng'],
  school: ['school', 'university', 'college', 'kindergarten', 'trường', 'đại học', 'mầm non'],
  hospital: ['hospital', 'clinic', 'pharmacy', 'bệnh viện', 'phòng khám', 'nhà thuốc'],
  restaurant: ['restaurant', 'food', 'fast_food', 'nhà hàng', 'quán ăn'],
  cafe: ['cafe', 'coffee', 'cà phê', 'trà sữa'],
  shop: ['shop', 'supermarket', 'mall', 'market', 'siêu thị', 'chợ', 'cửa hàng'],
  park: ['park', 'garden', 'recreation', 'công viên', 'vườn'],
  gym: ['gym', 'fitness', 'swimming', 'sports', 'phòng tập'],
  gas_station: ['fuel', 'gas', 'petrol', 'xăng'],
  parking: ['parking', 'bãi đỗ', 'bãi xe'],
  worship: ['church', 'temple', 'mosque', 'pagoda', 'chùa', 'nhà thờ', 'đình'],
  hotel: ['hotel', 'motel', 'hostel', 'khách sạn', 'nhà nghỉ'],
  entertainment: ['cinema', 'karaoke', 'bar', 'club', 'rạp'],
  other: [],
};

function detectCategory(data: any): PlaceCategory {
  const addr = data.address ?? {};
  const tags = data.extratags ?? {};
  const type = data.type ?? '';
  const category = data.category ?? '';

  // Combine all searchable text
  const searchText = [
    type, category, addr.amenity, addr.shop, addr.office, addr.tourism,
    addr.leisure, addr.building, addr.landuse, data.name, tags.building,
  ].filter(Boolean).join(' ').toLowerCase();

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (cat === 'other') continue;
    if (keywords.some(kw => searchText.includes(kw))) {
      return cat as PlaceCategory;
    }
  }

  return 'other';
}

// ─── Category Labels & Icons ────────────────────────────────────────

export const CATEGORY_CONFIG: Record<PlaceCategory, { emoji: string; label: { vi: string; en: string }; color: string }> = {
  home: { emoji: '🏠', label: { vi: 'Nhà', en: 'Home' }, color: '#3B82F6' },
  work: { emoji: '🏢', label: { vi: 'Công ty', en: 'Work' }, color: '#8B5CF6' },
  school: { emoji: '🏫', label: { vi: 'Trường học', en: 'School' }, color: '#F59E0B' },
  hospital: { emoji: '🏥', label: { vi: 'Bệnh viện', en: 'Hospital' }, color: '#EF4444' },
  restaurant: { emoji: '🍽️', label: { vi: 'Nhà hàng', en: 'Restaurant' }, color: '#F97316' },
  cafe: { emoji: '☕', label: { vi: 'Cà phê', en: 'Café' }, color: '#92400E' },
  shop: { emoji: '🛒', label: { vi: 'Cửa hàng', en: 'Shop' }, color: '#EC4899' },
  park: { emoji: '🌳', label: { vi: 'Công viên', en: 'Park' }, color: '#10B981' },
  gym: { emoji: '🏋️', label: { vi: 'Phòng tập', en: 'Gym' }, color: '#6366F1' },
  gas_station: { emoji: '⛽', label: { vi: 'Trạm xăng', en: 'Gas Station' }, color: '#CA8A04' },
  parking: { emoji: '🅿️', label: { vi: 'Bãi đỗ xe', en: 'Parking' }, color: '#64748B' },
  worship: { emoji: '⛪', label: { vi: 'Nhà thờ/Chùa', en: 'Worship' }, color: '#D97706' },
  hotel: { emoji: '🏨', label: { vi: 'Khách sạn', en: 'Hotel' }, color: '#7C3AED' },
  entertainment: { emoji: '🎬', label: { vi: 'Giải trí', en: 'Entertainment' }, color: '#DB2777' },
  other: { emoji: '📍', label: { vi: 'Khác', en: 'Other' }, color: '#64748B' },
};

// ─── Cache ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'geocode_cache_v2';
const MAX_CACHE_SIZE = 500;

// In-memory cache (fast)
const memCache = new Map<string, GeocodedAddress>();
const inFlight = new Map<string, Promise<GeocodedAddress>>();

// Load from localStorage on init
function loadPersistentCache(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const entries: [string, GeocodedAddress][] = JSON.parse(stored);
      for (const [key, val] of entries) {
        memCache.set(key, val);
      }
    }
  } catch {
    // ignore parse errors
  }
}

function savePersistentCache(): void {
  try {
    const entries = [...memCache.entries()].slice(-MAX_CACHE_SIZE);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

// Initialize on load
loadPersistentCache();

// ─── Core API ───────────────────────────────────────────────────────

export function getCacheKey(lat: number, lng: number): string {
  // Round to ~1m precision for house-level accuracy
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Get cached address or null */
export function getCachedAddress(lat: number, lng: number): GeocodedAddress | null {
  return memCache.get(getCacheKey(lat, lng)) ?? null;
}

/** Convert lat/lng to structured address (Vietnamese preferred). */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedAddress> {
  const key = getCacheKey(lat, lng);

  if (memCache.has(key)) return memCache.get(key)!;
  if (inFlight.has(key)) return inFlight.get(key)!;

  const promise = (async (): Promise<GeocodedAddress> => {
    try {
      // zoom=19 for house-level detail, addressdetails=1 for structured data
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=vi&addressdetails=1&extratags=1&namedetails=1&zoom=19`,
        {
          headers: { 'User-Agent': 'FamilyTracker/2.0 (family-tracker-app)' },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const addr = data.address ?? {};
      const extratags = data.extratags ?? {};
      const namedetails = data.namedetails ?? {};

      // ── Build structured address parts ──

      // 1. House number from multiple sources
      const houseNumber =
        addr.house_number
        || extratags['addr:housenumber']
        || namedetails['addr:housenumber']
        || addr.building
        || null;

      // 2. Road/Street
      const road = addr.road || addr.pedestrian || addr.path || null;

      // 3. POI name
      const poiName =
        addr.amenity || addr.shop || addr.office || addr.tourism
        || addr.leisure || addr.industrial
        || (data.name && data.name !== road ? data.name : null)
        || null;

      // 4. Area (Ward, Suburb, etc.)
      const area =
        addr.suburb || addr.quarter || addr.neighbourhood
        || addr.hamlet || addr.village || addr.town || null;

      // 5. District
      const district = addr.city_district || addr.county || addr.district || null;

      // 6. City
      const city = addr.city || addr.state || null;

      // ── Build full address string ──
      const parts: string[] = [];

      // Leading with house number if available
      if (houseNumber && road) {
        parts.push(`${houseNumber} ${road}`);
      } else if (houseNumber) {
        parts.push(houseNumber);
        if (road) parts.push(road);
      } else if (poiName) {
        parts.push(poiName);
        if (road) parts.push(road);
      } else if (road) {
        parts.push(road);
      }

      if (area && area !== road) parts.push(area);
      if (district && district !== area) parts.push(district);
      if (city && city !== district && city !== area) parts.push(city);

      const full =
        parts.length > 0
          ? parts.join(', ')
          : (data.display_name ?? '').split(',').slice(0, 3).join(',').trim()
          || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      // Short version: first 2 meaningful parts
      const shortParts = parts.slice(0, 2);
      const short = shortParts.length > 0 ? shortParts.join(', ') : full.split(',').slice(0, 2).join(',').trim();

      // Detect place category
      const category = detectCategory(data);

      const result: GeocodedAddress = {
        full,
        short,
        houseNumber: houseNumber || undefined,
        road: road || undefined,
        area: area || undefined,
        district: district || undefined,
        city: city || undefined,
        category,
        poiName: poiName || undefined,
      };

      memCache.set(key, result);
      savePersistentCache();
      return result;
    } catch {
      const fallback: GeocodedAddress = {
        full: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        short: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        category: 'other',
      };
      memCache.set(key, fallback);
      return fallback;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

// ─── Legacy compatible wrapper ──────────────────────────────────────

/** Get full address string (legacy compatible) */
export async function reverseGeocodeString(lat: number, lng: number): Promise<string> {
  const result = await reverseGeocode(lat, lng);
  return result.full;
}

/** Batch geocode multiple points, spacing requests 300 ms apart for Nominatim rate limit. */
export async function batchReverseGeocode(
  points: { lat: number; lng: number }[],
  onResult: (key: string, address: string) => void
): Promise<void> {
  const unique = points.filter(
    (p, i, arr) =>
      arr.findIndex((q) => getCacheKey(q.lat, q.lng) === getCacheKey(p.lat, p.lng)) === i
  );

  for (let i = 0; i < unique.length; i++) {
    const { lat, lng } = unique[i];
    const key = getCacheKey(lat, lng);
    if (!memCache.has(key)) {
      await new Promise((r) => setTimeout(r, i === 0 ? 0 : 350)); // rate-limit gap
    }
    const result = await reverseGeocode(lat, lng);
    onResult(key, result.full);
  }
}

/** Batch geocode returning structured addresses */
export async function batchReverseGeocodeStructured(
  points: { lat: number; lng: number }[],
  onResult: (key: string, address: GeocodedAddress) => void
): Promise<void> {
  const unique = points.filter(
    (p, i, arr) =>
      arr.findIndex((q) => getCacheKey(q.lat, q.lng) === getCacheKey(p.lat, p.lng)) === i
  );

  for (let i = 0; i < unique.length; i++) {
    const { lat, lng } = unique[i];
    const key = getCacheKey(lat, lng);
    if (!memCache.has(key)) {
      await new Promise((r) => setTimeout(r, i === 0 ? 0 : 350));
    }
    const result = await reverseGeocode(lat, lng);
    onResult(key, result);
  }
}
