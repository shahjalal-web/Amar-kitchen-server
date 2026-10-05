import mongoose from 'mongoose';
import { City, Thana, Area, slugify } from './location.model';
import { User } from '../auth/auth.model';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactName = (name: string) => new RegExp(`^${escapeRegex(name)}$`, 'i');
export const AREA_POPULATE = [
  { path: 'thana', select: 'name nameEn slug' },
  { path: 'city', select: 'name nameEn slug' },
];

// বাংলা নাম, ইংরেজি নাম বা slug — যেকোনোটায় মিললেই
const bilingualMatch = (query: string) => {
  const rx = new RegExp(escapeRegex(query), 'i');
  const conds: Record<string, unknown>[] = [{ name: rx }, { nameEn: rx }, { aliases: rx }];
  const slug = slugify(query);
  if (slug) conds.push({ slug: new RegExp(escapeRegex(slug)) });
  return conds;
};

const toPoint = (lat?: unknown, lng?: unknown) => {
  if (lat == null || lng == null || lat === '' || lng === '') return undefined;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
    throw new Error('অক্ষাংশ/দ্রাঘিমাংশ সঠিক নয়');
  }
  return { type: 'Point' as const, coordinates: [ln, la] as [number, number] };
};

// ─── পাবলিক (ড্রপডাউন) ─────────────────────────────────
export const getCities = (includeInactive = false) =>
  City.find(includeInactive ? {} : { isActive: true }).sort({ name: 1 });

export const getThanas = (cityId: string, includeInactive = false) =>
  Thana.find({ city: cityId, ...(includeInactive ? {} : { isActive: true }) }).sort({ name: 1 });

export const getAreas = (thanaId: string, includeInactive = false) =>
  Area.find({ thana: thanaId, ...(includeInactive ? {} : { isActive: true }) }).sort({ name: 1 });

export const getAreaDetail = (areaId: string) => Area.findById(areaId).populate(AREA_POPULATE);

// জিপ কোড বা এলাকা/থানার নাম দিয়ে খোঁজা
export const searchAreas = async (q: string) => {
  const query = q.trim();
  if (!query) return [];
  const filter: Record<string, unknown> = { isActive: true };
  if (/^\d+$/.test(query)) {
    filter.zipCode = new RegExp(`^${query}`);
  } else {
    // এরিয়ার নিজের নাম, অথবা থানা/শহরের নাম (বাংলা বা ইংরেজি) মিললে
    const conds = bilingualMatch(query);
    const [thanas, cities] = await Promise.all([
      Thana.find({ isActive: true, $or: conds }).select('_id'),
      City.find({ isActive: true, $or: conds }).select('_id'),
    ]);
    filter.$or = [
      ...conds,
      { thana: { $in: thanas.map((t) => t._id) } },
      { city: { $in: cities.map((c) => c._id) } },
    ];
  }
  return Area.find(filter).populate(AREA_POPULATE).sort({ zipCode: 1, name: 1 }).limit(30);
};

// ─── আশেপাশের এলাকা (এলাকার center point থেকে $geoNear) ─
export const findNearbyAreas = async (areaId: string, radiusKm = 3, limit = 10) => {
  const area = await Area.findById(areaId);
  if (!area?.location?.coordinates?.length) return [];
  const results = await Area.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: area.location.coordinates },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        query: { isActive: true, _id: { $ne: area._id } },
        spherical: true,
      },
    },
    { $limit: limit },
    { $project: { name: 1, nameEn: 1, slug: 1, zipCode: 1, thana: 1, city: 1, distanceMeters: 1 } },
  ]);
  await Area.populate(results, AREA_POPULATE);
  return results.map((r) => ({ ...r, distanceKm: Math.round((r.distanceMeters / 1000) * 10) / 10 }));
};

// ─── যাচাই ───────────────────────────────────────────────
export interface PopulatedArea {
  _id: mongoose.Types.ObjectId;
  id: string;
  name: string;
  zipCode: string;
  thana: { _id: unknown; name: string };
  city: { _id: unknown; name: string };
}

export const getActiveAreaOrThrow = async (areaId?: string): Promise<PopulatedArea> => {
  if (!areaId) throw new Error('এলাকা নির্বাচন করুন');
  const area = await Area.findOne({ _id: areaId, isActive: true }).populate(AREA_POPULATE);
  if (!area) throw new Error('নির্বাচিত এলাকা পাওয়া যায়নি');
  return area as unknown as PopulatedArea;
};

// ─── Admin: City ─────────────────────────────────────────
export const createCity = async (data: { name?: string; nameEn?: string }) => {
  const n = data.name?.trim();
  if (!n) throw new Error('শহরের নাম দিন');
  if (await City.exists({ name: exactName(n) })) throw new Error('এই নামে শহর আগেই আছে');
  return City.create({ name: n, nameEn: data.nameEn?.trim() ?? '' });
};

export const updateCity = async (id: string, data: { name?: string; nameEn?: string; isActive?: boolean }) => {
  const city = await City.findById(id);
  if (!city) throw new Error('শহর পাওয়া যায়নি');
  if (data.name !== undefined) {
    const n = data.name.trim();
    if (!n) throw new Error('শহরের নাম দিন');
    if (await City.exists({ _id: { $ne: city._id }, name: exactName(n) })) throw new Error('এই নামে শহর আগেই আছে');
    city.name = n;
  }
  if (data.nameEn !== undefined) city.nameEn = data.nameEn.trim();
  if (data.isActive !== undefined) city.isActive = data.isActive;
  return city.save();
};

// ─── Admin: Thana ────────────────────────────────────────
export const createThana = async (data: { name?: string; nameEn?: string; cityId?: string }) => {
  const n = data.name?.trim();
  if (!n) throw new Error('থানার নাম দিন');
  if (!data.cityId || !(await City.exists({ _id: data.cityId }))) throw new Error('শহর পাওয়া যায়নি');
  if (await Thana.exists({ city: data.cityId, name: exactName(n) })) throw new Error('এই শহরে এই নামে থানা আগেই আছে');
  return Thana.create({ name: n, nameEn: data.nameEn?.trim() ?? '', city: data.cityId });
};

export const updateThana = async (id: string, data: { name?: string; nameEn?: string; isActive?: boolean }) => {
  const thana = await Thana.findById(id);
  if (!thana) throw new Error('থানা পাওয়া যায়নি');
  if (data.name !== undefined) {
    const n = data.name.trim();
    if (!n) throw new Error('থানার নাম দিন');
    if (await Thana.exists({ _id: { $ne: thana._id }, city: thana.city, name: exactName(n) })) {
      throw new Error('এই শহরে এই নামে থানা আগেই আছে');
    }
    thana.name = n;
  }
  if (data.nameEn !== undefined) thana.nameEn = data.nameEn.trim();
  if (data.isActive !== undefined) thana.isActive = data.isActive;
  return thana.save();
};

// ─── Admin: Area ─────────────────────────────────────────
export interface AreaInput {
  name?: string;
  nameEn?: string;
  thanaId?: string;
  zipCode?: string;
  lat?: number | string | null;
  lng?: number | string | null;
  isActive?: boolean;
}

export const createArea = async (data: AreaInput) => {
  const n = data.name?.trim();
  const zip = data.zipCode?.trim();
  if (!n) throw new Error('এরিয়ার নাম দিন');
  if (!zip || !/^\d{4}$/.test(zip)) throw new Error('৪ সংখ্যার জিপ কোড দিন');
  const thana = data.thanaId ? await Thana.findById(data.thanaId) : null;
  if (!thana) throw new Error('থানা পাওয়া যায়নি');
  if (await Area.exists({ thana: thana._id, name: exactName(n) })) throw new Error('এই থানায় এই নামে এরিয়া আগেই আছে');
  return Area.create({
    name: n, nameEn: data.nameEn?.trim() ?? '', thana: thana._id, city: thana.city,
    zipCode: zip, location: toPoint(data.lat, data.lng),
  });
};

export const updateArea = async (id: string, data: AreaInput) => {
  const area = await Area.findById(id);
  if (!area) throw new Error('এরিয়া পাওয়া যায়নি');

  if (data.name !== undefined) {
    const n = data.name.trim();
    if (!n) throw new Error('এরিয়ার নাম দিন');
    if (await Area.exists({ _id: { $ne: area._id }, thana: area.thana, name: exactName(n) })) {
      throw new Error('এই থানায় এই নামে এরিয়া আগেই আছে');
    }
    area.name = n;
  }
  if (data.nameEn !== undefined) area.nameEn = data.nameEn.trim();
  if (data.zipCode !== undefined) {
    const zip = data.zipCode.trim();
    if (!/^\d{4}$/.test(zip)) throw new Error('৪ সংখ্যার জিপ কোড দিন');
    area.zipCode = zip;
  }
  if (data.lat !== undefined || data.lng !== undefined) {
    area.set('location', toPoint(data.lat, data.lng));
  }
  if (data.isActive !== undefined) area.isActive = data.isActive;

  await area.save();
  // ইউজার/কিচেন প্রোফাইলে এলাকার নাম denormalized — মিলিয়ে দাও
  await User.updateMany({ areaId: area._id }, { area: area.name });
  return area;
};

// ম্যাপের একটা বিন্দুর কাছের সক্রিয় এরিয়াগুলো (কেন্দ্র maxKm-এর মধ্যে, কাছেরটা আগে)।
// এরিয়ার কেন্দ্র আনুমানিক, তাই ফ্রন্টএন্ড candidates দেখে ঠিক করে আগের বাছাই রাখবে নাকি বদলাবে।
export const findNearestArea = async (lng: number, lat: number, maxKm = 4) => {
  const hits = await Area.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance: maxKm * 1000,
        query: { isActive: true },
        spherical: true,
      },
    },
    { $limit: 5 },
    { $project: { _id: 1, name: 1, distanceMeters: 1 } },
  ]);
  if (!hits.length) return null;
  const area = await Area.findById(hits[0]._id).populate(AREA_POPULATE);
  if (!area) return null;
  const km = (m: number) => Math.round((m / 1000) * 100) / 100;
  return {
    area,
    distanceKm: km(hits[0].distanceMeters),
    candidates: hits.map((h) => ({ _id: String(h._id), name: h.name as string, distanceKm: km(h.distanceMeters) })),
  };
};
