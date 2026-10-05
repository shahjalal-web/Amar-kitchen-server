import { RouteDistance } from '../modules/location/location.model';

export type LngLat = [number, number];
export interface GeoPoint { type: 'Point'; coordinates: LngLat }

// বাংলাদেশের মোটামুটি সীমানা — এর বাইরের পিন ভুল ধরা হয়
const BD = { minLat: 20.5, maxLat: 26.8, minLng: 88.0, maxLng: 92.8 };

// ক্লায়েন্ট পাঠায় { lat, lng } (বা null = পিন মুছে ফেলা)। undefined = বদলাবে না।
export const parsePoint = (input: unknown): GeoPoint | null | undefined => {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const { lat, lng } = (input ?? {}) as { lat?: unknown; lng?: unknown };
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) throw new Error('ম্যাপের লোকেশন সঠিক নয়');
  if (la < BD.minLat || la > BD.maxLat || ln < BD.minLng || ln > BD.maxLng) throw new Error('লোকেশন বাংলাদেশের মধ্যে হতে হবে');
  return { type: 'Point', coordinates: [Math.round(ln * 1e6) / 1e6, Math.round(la * 1e6) / 1e6] };
};

export const hasPoint = (p?: { coordinates?: number[] } | null): p is GeoPoint =>
  Array.isArray(p?.coordinates) && p!.coordinates.length === 2;

export const haversineKm = ([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

const roundKm = (km: number) => Math.round(km * 10) / 10;
const fmt = ([lng, lat]: LngLat) => `${lng.toFixed(5)},${lat.toFixed(5)}`;
const pairKey = (a: LngLat, b: LngLat) => [fmt(a), fmt(b)].sort().join('|');

export interface RoadDistance { km: number; source: 'road' | 'estimate' }

// OpenRouteService Matrix API: এক উৎস → অনেক গন্তব্য, এক রিকোয়েস্টে। ORS_API_KEY না থাকলে null।
// শুধু স্থানাঙ্ক যায় (নাম/ঠিকানা নয়)।
const fetchOrsMatrix = async (origin: LngLat, dests: LngLat[]): Promise<(number | null)[] | null> => {
  const key = process.env.ORS_API_KEY;
  if (!key || dests.length === 0) return null;
  try {
    const res = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        locations: [origin, ...dests],
        sources: [0],
        destinations: dests.map((_, i) => i + 1),
        metrics: ['distance'],
        units: 'km',
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`ORS matrix: HTTP ${res.status}`, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { distances?: (number | null)[][] };
    return json.distances?.[0] ?? null;
  } catch (err) {
    console.error('ORS matrix ব্যর্থ:', (err as Error).message);
    return null;
  }
};

// origin থেকে প্রতিটি গন্তব্যের রাস্তার দূরত্ব।
// ক্রম: ক্যাশ → OpenRouteService (পেলে ক্যাশে রাখা) → আনুমানিক (সোজা দূরত্ব × factor, ক্যাশ হয় না)
export const roadDistancesKm = async (origin: LngLat, dests: LngLat[], factor = 1.4): Promise<RoadDistance[]> => {
  const out: (RoadDistance | null)[] = dests.map((d) => (fmt(d) === fmt(origin) ? { km: 0, source: 'road' } : null));
  const keys = dests.map((d) => pairKey(origin, d));

  const pending = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (pending.length) {
    const cached = await RouteDistance.find({ key: { $in: pending.map((i) => keys[i]) } }).lean();
    const byKey = new Map(cached.map((c) => [c.key, c.km]));
    pending.forEach((i) => { if (byKey.has(keys[i])) out[i] = { km: byKey.get(keys[i])!, source: 'road' }; });
  }

  const missing = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (missing.length) {
    // ORS এক রিকোয়েস্টে সর্বোচ্চ ৩৫০০ এলিমেন্ট — নিরাপদে ১০০ করে
    for (let start = 0; start < missing.length; start += 100) {
      const chunk = missing.slice(start, start + 100);
      const km = await fetchOrsMatrix(origin, chunk.map((i) => dests[i]));
      if (!km) break;
      const docs: { key: string; km: number }[] = [];
      chunk.forEach((i, j) => {
        const v = km[j];
        if (typeof v === 'number' && Number.isFinite(v)) {
          out[i] = { km: roundKm(v), source: 'road' };
          docs.push({ key: keys[i], km: roundKm(v) });
        }
      });
      if (docs.length) {
        await RouteDistance.bulkWrite(
          docs.map((d) => ({ updateOne: { filter: { key: d.key }, update: { $set: { km: d.km } }, upsert: true } })),
          { ordered: false }
        ).catch(() => undefined);
      }
    }
  }

  return out.map((v, i) => v ?? { km: roundKm(haversineKm(origin, dests[i]) * factor), source: 'estimate' });
};
