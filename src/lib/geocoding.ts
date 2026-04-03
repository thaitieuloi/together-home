/**
 * Reverse geocoding using Nominatim (OpenStreetMap) — free, no API key required.
 * Rate limit: 1 req/sec. We use module-level cache + in-flight dedup to stay safe.
 */

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function getCacheKey(lat: number, lng: number): string {
  // Round to ~11m precision to maximize cache hits for nearby points
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** Convert lat/lng to human-readable address (Vietnamese preferred). */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = getCacheKey(lat, lng);

  if (cache.has(key)) return cache.get(key)!;
  if (inFlight.has(key)) return inFlight.get(key)!;

  const promise = (async (): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=vi&addressdetails=1&extratags=1&namedetails=1&zoom=18`,
        {
          headers: { 'User-Agent': 'FamilyTracker/1.0 (family-tracker-app)' },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const addr = data.address ?? {};

      // Build a concise, human-readable Vietnamese address
      const parts: string[] = [];

      // 1. Specific point — priority: house number > POI name > named OSM feature (landmark)
      const extratags = data.extratags ?? {};
      const houseNum = addr.house_number || extratags['addr:housenumber'] || addr.building;
      const poiName = addr.amenity || addr.shop || addr.office || addr.tourism || addr.leisure || addr.industrial;
      // data.name is the name of the matched OSM object (e.g. "Trường THPT Hóc Môn")
      const osmName = data.name && data.name !== addr.road ? data.name : null;

      let point: string | null = null;
      if (houseNum && poiName) point = `${houseNum}, ${poiName}`;
      else if (houseNum) point = houseNum;
      else if (poiName) point = poiName;
      else if (osmName) point = `Gần ${osmName}`;
      if (point) parts.push(point);

      // 2. Road
      if (addr.road) parts.push(addr.road);

      // 3. Area (Suburb, Ward, etc.)
      const area = addr.suburb || addr.quarter || addr.neighbourhood || addr.hamlet || addr.village;
      if (area) parts.push(area);

      // 4. District/Town
      const district = addr.city_district || addr.town || addr.district;
      if (district) parts.push(district);

      const result =
        parts.length > 0
          ? parts.join(', ')
          : (data.display_name ?? '').split(',').slice(0, 2).join(',').trim() ||
            `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      cache.set(key, result);
      return result;
    } catch {
      const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      cache.set(key, fallback);
      return fallback;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** Batch geocode multiple points, spacing requests 300 ms apart to respect Nominatim rate limit. */
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
    if (!cache.has(key)) {
      await new Promise((r) => setTimeout(r, i === 0 ? 0 : 350)); // rate-limit gap
    }
    const address = await reverseGeocode(lat, lng);
    onResult(key, address);
  }
}

export { getCacheKey };
