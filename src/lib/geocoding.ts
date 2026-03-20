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
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=vi`,
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
      if (addr.road) parts.push(addr.road);
      if (addr.suburb || addr.quarter || addr.neighbourhood)
        parts.push(addr.suburb ?? addr.quarter ?? addr.neighbourhood);
      if (addr.city_district || addr.town || addr.village)
        parts.push(addr.city_district ?? addr.town ?? addr.village);

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
