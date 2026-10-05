import mongoose from 'mongoose';
import { DailyMenu, Withdrawal } from './kitchen.model';
import { User } from '../auth/auth.model';
import { emit } from '../../utils/realtime';
import { GlobalConfig, FoodItem, IFoodItem } from '../admin/admin.model';
import { Area } from '../location/location.model';
import { findNearbyAreas, AREA_POPULATE } from '../location/location.service';
import { Order } from '../order/order.model';
import { transitionOrder } from '../order/order.service';
import { setFoodImages, deleteFoodPermanently } from '../admin/admin.service';
import { destroyUnusedImages } from '../../utils/images';
import { LngLat, hasPoint, roadDistancesKm } from '../../utils/geo';

const todayDate = () => new Date().toISOString().split('T')[0];

// ─── Food: অ্যাডমিন লাইব্রেরি + কিচেনের নিজের খাবার ─────
const FOOD_CATEGORIES = ['ভাত', 'রুটি', 'মাছ', 'মাংস', 'সবজি', 'ডাল', 'সালাদ', 'পানীয়', 'অন্যান্য'];

// কিচেন মেনু বানানোর সময় যা দেখে: সক্রিয় অ্যাডমিন খাবার আগে, তারপর নিজের তৈরি খাবার
export const getActiveFoodItems = (kitchenId: string) =>
  FoodItem.find({ isActive: true, $or: [{ source: 'admin' }, { source: { $exists: false } }, { kitchen: kitchenId }] })
    .sort({ source: 1, category: 1, name: 1 });

export const getMyFoodItems = (kitchenId: string) =>
  FoodItem.find({ kitchen: kitchenId }).sort({ isActive: -1, name: 1 });

export const createKitchenFood = async (kitchenId: string, data: { name?: string; category?: string; images?: unknown }) => {
  const name = data.name?.trim();
  if (!name) throw new Error('খাবারের নাম দিন');
  if (!data.category || !FOOD_CATEGORIES.includes(data.category)) throw new Error('ক্যাটাগরি নির্বাচন করুন');
  if (await FoodItem.exists({ name, kitchen: kitchenId })) throw new Error('এই নামে আপনার খাবার আগেই আছে');
  const food = new FoodItem({
    name, category: data.category as IFoodItem['category'],
    source: 'kitchen', kitchen: kitchenId, createdBy: kitchenId,
  });
  setFoodImages(food, data.images);
  return food.save();
};

const findOwnFood = async (kitchenId: string, foodId: string) => {
  const food = await FoodItem.findOne({ _id: foodId, kitchen: kitchenId });
  if (!food) throw new Error('খাবার পাওয়া যায়নি (শুধু নিজের তৈরি খাবার সম্পাদনা করা যায়)');
  return food;
};

export const updateKitchenFood = async (
  kitchenId: string, foodId: string, data: { name?: string; category?: string; images?: unknown; isActive?: boolean }
) => {
  const food = await findOwnFood(kitchenId, foodId);
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw new Error('খাবারের নাম দিন');
    if (await FoodItem.exists({ _id: { $ne: food._id }, name, kitchen: kitchenId })) throw new Error('এই নামে আপনার খাবার আগেই আছে');
    food.name = name;
  }
  if (data.category !== undefined) {
    if (!FOOD_CATEGORIES.includes(data.category)) throw new Error('ক্যাটাগরি সঠিক নয়');
    food.category = data.category as typeof food.category;
  }
  if (data.isActive !== undefined) food.isActive = data.isActive;
  const removed = data.images !== undefined ? setFoodImages(food, data.images) : [];
  await food.save();
  await destroyUnusedImages(removed);
  return food;
};

export const deleteKitchenFood = async (kitchenId: string, foodId: string) =>
  deleteFoodPermanently(await findOwnFood(kitchenId, foodId));

// ─── ইউজারের খাবার সার্চ: নির্বাচিত ও আশেপাশের এলাকার আজকের মেনুতে ───
// ফলাফলে অ্যাডমিন লাইব্রেরির খাবার আগে, তারপর কিচেন মালিকদের নিজের খাবার; একই উৎসের মধ্যে কিচেনের রেটিং অনুযায়ী
export const searchFoodInArea = async (areaId: string, q: string, radiusKm?: number) => {
  const query = q.trim();
  if (query.length < 1) return [];
  const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  // নাম বা ক্যাটাগরি (যেমন "মাংস", "মাছ") — দুটোতেই মেলে
  const foods = await FoodItem.find({ isActive: true, $or: [{ name: rx }, { category: rx }] }).select('_id');
  if (foods.length === 0) return [];

  const config = await GlobalConfig.findOne();
  const maxKm = deliverySettings(config).maxKm;
  const radius = Math.min(Math.max(Number.isFinite(radiusKm) ? Number(radiusKm) : config?.nearbyRadiusKm ?? 3, 0), maxKm);
  const nearby = radius > 0 ? await findNearbyAreas(areaId, radius, 300) : [];
  const distanceByArea = new Map<string, number>([[areaId, 0], ...nearby.map((a) => [String(a._id), a.distanceKm] as [string, number])]);
  const kitchens = await User.find({
    role: 'kitchen', isApproved: true, isActive: true, areaId: { $in: [...distanceByArea.keys()] },
  }).select(KITCHEN_PUBLIC_FIELDS);
  const kitchenById = new Map(kitchens.map((k) => [k.id as string, k]));

  const foodIds = foods.map((f) => f._id);
  const menus = await DailyMenu.find({
    kitchen: { $in: kitchens.map((k) => k._id) },
    date: todayDate(),
    isPublished: true,
    'items.foodItem': { $in: foodIds },
  }).populate('items.foodItem');

  const wanted = new Set(foodIds.map(String));
  const results = menus.flatMap((m) => {
    const kitchen = kitchenById.get(m.kitchen.toString())!;
    return m.items
      .filter((it) => wanted.has(String((it.foodItem as unknown as { _id: unknown })._id)))
      .map((it) => {
        const food = it.foodItem as unknown as { _id: string; name: string; image: string; images?: unknown[]; imageCredit?: string; category: string; source?: string };
        return {
          menuId: m.id as string,
          price: it.price,
          food: { _id: food._id, name: food.name, image: food.image, images: food.images, imageCredit: food.imageCredit, category: food.category, source: food.source ?? 'admin' },
          kitchen: { _id: kitchen._id, name: kitchen.name, kitchenName: kitchen.kitchenName, rating: kitchen.rating, area: kitchen.area },
          distanceKm: distanceByArea.get(String(kitchen.areaId)) ?? null,
        };
      });
  });

  return results.sort((a, b) =>
    (a.food.source === 'admin' ? 0 : 1) - (b.food.source === 'admin' ? 0 : 1)
    || (b.kitchen.rating ?? 0) - (a.kitchen.rating ?? 0)
    || (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
};

// ─── Menu ─────────────────────────────────────────────────
export const setTodayMenu = async (
  kitchenId: string,
  data: { items: { foodItem: string; price: number }[]; freeItems: string[] }
) => {
  const date = todayDate();
  return DailyMenu.findOneAndUpdate(
    { kitchen: kitchenId, date },
    {
      kitchen: kitchenId,
      date,
      items: data.items,
      freeItems: data.freeItems,
      isPublished: true,
    },
    { upsert: true, new: true }
  ).populate('items.foodItem freeItems');
};

export const getTodayMenu = (kitchenId: string) =>
  DailyMenu.findOne({ kitchen: kitchenId, date: todayDate() }).populate(
    'items.foodItem freeItems'
  );

const KITCHEN_PUBLIC_FIELDS = 'name kitchenName kitchenDescription rating totalRatings area areaId avatar';

// কিচেন তালিকার সাথে আজকের মেনু জুড়ে দাও
const withTodayMenus = async <K extends { _id: mongoose.Types.ObjectId; id: string }>(kitchens: K[]) => {
  const menus = await DailyMenu.find({
    kitchen: { $in: kitchens.map((k) => k._id) },
    date: todayDate(),
    isPublished: true,
  }).populate('items.foodItem freeItems');
  const menuByKitchen = new Map(menus.map((m) => [m.kitchen.toString(), m]));
  return kitchens.map((kitchen) => ({ kitchen, menu: menuByKitchen.get(kitchen.id) ?? null }));
};

// নির্বাচিত এলাকার কিচেন সাজেশন — আজকের মেনুসহ, রেটিং অনুযায়ী সাজানো
export const getKitchenSuggestionsByArea = async (areaId: string) => {
  const kitchens = await User.find({ role: 'kitchen', isApproved: true, isActive: true, areaId })
    .select(KITCHEN_PUBLIC_FIELDS)
    .sort({ rating: -1, totalRatings: -1 });
  return withTodayMenus(kitchens);
};

// জিপ কোড দিয়ে কিচেন খোঁজা (ওই জিপের সব এরিয়া)
export const getKitchensByZip = async (zipCode: string) => {
  const areas = await Area.find({ zipCode: zipCode.trim(), isActive: true }).select('_id');
  const kitchens = await User.find({
    role: 'kitchen', isApproved: true, isActive: true, areaId: { $in: areas.map((a) => a._id) },
  }).select(KITCHEN_PUBLIC_FIELDS).sort({ rating: -1, totalRatings: -1 });
  return withTodayMenus(kitchens);
};

// আশেপাশের এলাকার টপ কিচেন — নির্বাচিত এলাকার center point থেকে radiusKm-এর মধ্যের এলাকাগুলো
export const getTopNearbyKitchens = async (areaId: string, limit = 10) => {
  const config = await GlobalConfig.findOne();
  const nearby = await findNearbyAreas(areaId, config?.nearbyRadiusKm ?? 3, 15);
  if (nearby.length === 0) return { areas: [], kitchens: [] };

  const distanceByArea = new Map(nearby.map((a) => [String(a._id), a.distanceKm]));
  const kitchens = await User.find({
    role: 'kitchen', isApproved: true, isActive: true, areaId: { $in: nearby.map((a) => a._id) },
  }).select(KITCHEN_PUBLIC_FIELDS).sort({ rating: -1, totalRatings: -1 }).limit(limit);

  const withMenus = await withTodayMenus(kitchens);
  return {
    areas: nearby,
    kitchens: withMenus.map((k) => ({ ...k, distanceKm: distanceByArea.get(String(k.kitchen.areaId)) ?? null })),
  };
};

// ─── ডেলিভারি বয় খোঁজা (কিচেনের জন্য) ───────────────────
// ডিফল্ট: কিচেনের নিজের এলাকায় ডেলিভারি দেয় এমন approved ডেলিভারি বয়
export const findDeliveryBoys = async (kitchenId: string, opts: { areaId?: string; q?: string }) => {
  const kitchen = await User.findById(kitchenId).select('areaId');
  const areaId = opts.areaId || kitchen?.areaId?.toString();
  const filter: Record<string, unknown> = { role: 'delivery', isApproved: true, isActive: true, isAvailable: { $ne: false } };
  if (areaId) filter.deliveryAreaIds = areaId;
  if (opts.q?.trim()) {
    const rx = new RegExp(opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { phone: rx }];
  }
  const boys = await User.find(filter)
    .select('name phone deliveryAreaIds isAvailable')
    .populate({ path: 'deliveryAreaIds', select: 'name zipCode', populate: AREA_POPULATE })
    .limit(30);

  // আজকে কতগুলো চলমান ডেলিভারি আছে — কিচেন যেন ফাঁকা কাউকে বাছতে পারে
  const busy = await Order.aggregate([
    { $match: { deliveryBoy: { $in: boys.map((b) => b._id) }, status: { $in: ['accepted', 'ready', 'picked_up'] } } },
    { $group: { _id: '$deliveryBoy', count: { $sum: 1 } } },
  ]);
  const busyById = new Map(busy.map((b) => [String(b._id), b.count as number]));
  return boys.map((b) => ({ ...b.toObject(), activeDeliveries: busyById.get(b.id) ?? 0 }));
};

// ─── Ready for Pickup ────────────────────────────────────
export const markReadyForPickup = async (kitchenId: string) => {
  const menu = await DailyMenu.findOneAndUpdate(
    { kitchen: kitchenId, date: todayDate() },
    { isReadyForPickup: true },
    { new: true }
  );
  if (!menu) throw new Error('আজকের মেনু সেট করা হয়নি');

  // আজকের সব accepted অর্ডার → ready (প্রতিটির ইতিহাস ও ইমেইল সহ)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const accepted = await Order.find({ kitchen: kitchenId, status: 'accepted', createdAt: { $gte: startOfToday } }).select('_id');
  for (const o of accepted) {
    await transitionOrder({ userId: kitchenId, role: 'kitchen' }, o.id, 'ready');
  }

  emit('kitchen:ready', { kitchenId, date: todayDate() });
  return { menu, readyOrders: accepted.length };
};

// ─── Wallet ──────────────────────────────────────────────
export const getWalletBalance = (kitchenId: string) =>
  User.findById(kitchenId).select('walletBalance name');

export const requestWithdrawal = async (kitchenId: string, amount: number, bkashNumber: string) => {
  const kitchen = await User.findById(kitchenId);
  if (!kitchen || (kitchen.walletBalance ?? 0) < amount) {
    throw new Error('পর্যাপ্ত ব্যালেন্স নেই');
  }
  return Withdrawal.create({ kitchen: kitchenId, amount, bkashNumber });
};

export const getWithdrawalHistory = (kitchenId: string) =>
  Withdrawal.find({ kitchen: kitchenId }).sort({ createdAt: -1 });

// ─── Delivery Charge Calculator (shared utility) ─────────
// একই এরিয়া → sameAreaDeliveryFee (৳২০)।
// অন্য এরিয়া → রাস্তার দূরত্বের ধাপ (deliverySlabs, যেমন ২ কিমি ৳২৫ · ৩.৫ কিমি ৳৩০ · ৫ কিমি ৳৪০); শেষ ধাপের বেশি দূরে অর্ডার নয়।
// দূরত্ব মাপা হয় দুই বিন্দুর মধ্যে: ম্যাপে বসানো পিন থাকলে সেটা, নইলে এরিয়ার কেন্দ্র।
// রাস্তার দূরত্ব utils/geo.ts থেকে (ক্যাশ → OpenRouteService → আনুমানিক)।
// এরিয়ার লোকেশনই না থাকলে পুরনো থানাভিত্তিক চার্জ। শেষে একই বিল্ডিংয়ের অন্য অর্ডার থাকলে cluster discount।
type Config = InstanceType<typeof GlobalConfig> | null;

const DEFAULT_SLABS = [{ upToKm: 2, fee: 25 }, { upToKm: 3.5, fee: 30 }, { upToKm: 5, fee: 40 }];

export const deliverySettings = (config: Config) => {
  const slabs = (config?.deliverySlabs?.length ? config.deliverySlabs : DEFAULT_SLABS)
    .map((x) => ({ upToKm: Number(x.upToKm), fee: Number(x.fee) }))
    .filter((x) => x.upToKm > 0 && x.fee >= 0)
    .sort((a, b) => a.upToKm - b.upToKm);
  return {
    sameAreaFee: config?.sameAreaDeliveryFee ?? 20,
    slabs,
    maxKm: slabs.length ? slabs[slabs.length - 1].upToKm : 5,
    roadFactor: config?.roadDistanceFactor ?? 1.4,
    sameThanaFee: config?.sameThanaDeliveryFee ?? 35,
    baseFee: config?.deliveryBaseFee ?? 50,
    discountPerOrder: config?.deliveryDiscountPercentPerOrder ?? 10,
    maxDiscount: config?.maxDeliveryDiscount ?? 70,
  };
};
type Settings = ReturnType<typeof deliverySettings>;

const withClusterDiscount = (s: Settings, fee: number, activeOrdersInBuilding: number) => {
  const pct = Math.min(Math.max(activeOrdersInBuilding - 1, 0) * s.discountPerOrder, s.maxDiscount);
  return Math.round(fee * (1 - pct / 100));
};

// null = দূরত্ব সর্বোচ্চ সীমার বাইরে
export const feeFor = (s: Settings, km: number, sameArea: boolean, activeOrdersInBuilding = 1): number | null => {
  if (sameArea) return withClusterDiscount(s, s.sameAreaFee, activeOrdersInBuilding);
  const slab = s.slabs.find((x) => km <= x.upToKm);
  return slab ? withClusterDiscount(s, Math.max(slab.fee, s.sameAreaFee), activeOrdersInBuilding) : null;
};

export interface DeliveryParty { areaId?: string; location?: { coordinates?: number[] } | null }

export interface DeliveryQuote {
  charge: number;
  distanceKm: number | null;            // null = লোকেশন নেই, দূরত্ব জানা যায়নি
  distanceSource: 'road' | 'estimate' | null;
  sameArea: boolean;
  allowed: boolean;
  maxKm: number;
}

// পিন থাকলে পিন, নইলে এরিয়ার কেন্দ্র
const pointsFor = async (parties: DeliveryParty[]): Promise<(LngLat | null)[]> => {
  const needArea = parties.filter((p) => !hasPoint(p.location) && p.areaId).map((p) => p.areaId!);
  const areas = needArea.length ? await Area.find({ _id: { $in: needArea } }).select('location').lean() : [];
  const centers = new Map(areas.map((a) => [String(a._id), a.location?.coordinates as LngLat | undefined]));
  return parties.map((p) => {
    if (hasPoint(p.location)) return p.location.coordinates as LngLat;
    const c = p.areaId ? centers.get(String(p.areaId)) : undefined;
    return c?.length === 2 ? c : null;
  });
};

export const quoteDelivery = async (kitchen: DeliveryParty, customer: DeliveryParty, activeOrdersInBuilding = 1): Promise<DeliveryQuote> => {
  const s = deliverySettings(await GlobalConfig.findOne());
  const sameArea = !!kitchen.areaId && String(kitchen.areaId) === String(customer.areaId);
  if (sameArea) {
    return { charge: feeFor(s, 0, true, activeOrdersInBuilding)!, distanceKm: 0, distanceSource: null, sameArea, allowed: true, maxKm: s.maxKm };
  }
  const [kp, cp] = await pointsFor([kitchen, customer]);
  if (kp && cp) {
    const [{ km, source }] = await roadDistancesKm(cp, [kp], s.roadFactor);
    const fee = feeFor(s, km, false, activeOrdersInBuilding);
    return { charge: fee ?? 0, distanceKm: km, distanceSource: source, sameArea, allowed: fee !== null, maxKm: s.maxKm };
  }
  // লোকেশন নেই → পুরনো থানাভিত্তিক নিয়ম
  const [a, b] = await Promise.all([
    kitchen.areaId ? Area.findById(kitchen.areaId).select('thana') : null,
    customer.areaId ? Area.findById(customer.areaId).select('thana') : null,
  ]);
  const fee = a && b && a.thana.equals(b.thana) ? s.sameThanaFee : s.baseFee;
  return { charge: withClusterDiscount(s, fee, activeOrdersInBuilding), distanceKm: null, distanceSource: null, sameArea, allowed: true, maxKm: s.maxKm };
};

// ─── গ্রাহকের ব্রাউজ পেজ: নিজের এরিয়া + radiusKm-এর (রাস্তার দূরত্বে) মধ্যের কিচেন, চার্জসহ ───
// point = গ্রাহকের ঠিকানার পিন (না থাকলে এরিয়ার কেন্দ্র)। কিচেনের আসল লোকেশন রেসপন্সে কখনো যায় না।
export const browseKitchens = async (areaId: string, radiusKm?: number, point?: LngLat | null) => {
  const config = await GlobalConfig.findOne();
  const s = deliverySettings(config);
  const wanted = Number.isFinite(radiusKm) ? Number(radiusKm) : config?.nearbyRadiusKm ?? 3;
  const radius = Math.min(Math.max(wanted, 0), s.maxKm);

  // প্রথমে সোজা দূরত্বে এরিয়া বাছাই (পিন এরিয়ার কেন্দ্র থেকে একটু সরে থাকতে পারে, তাই +১.৫ কিমি)
  const nearby = radius > 0 ? await findNearbyAreas(areaId, radius + 1.5, 300) : [];
  const areaIds = [areaId, ...nearby.map((a) => String(a._id))];

  const kitchens = await User.find({
    role: 'kitchen', isApproved: true, isActive: true, areaId: { $in: areaIds },
  }).select(KITCHEN_PUBLIC_FIELDS).sort({ rating: -1, totalRatings: -1 });

  const others = kitchens.filter((k) => String(k.areaId) !== areaId);
  const distanceById = new Map<string, { km: number; source: 'road' | 'estimate' }>();
  if (others.length) {
    const pins = await User.find({ _id: { $in: others.map((k) => k._id) } }).select('+kitchenLocation areaId').lean();
    const pinById = new Map(pins.map((p) => [String(p._id), p.kitchenLocation]));
    const [origin, ...kPoints] = await pointsFor([
      { areaId, location: point ? { coordinates: point } : null },
      ...others.map((k) => ({ areaId: String(k.areaId), location: pinById.get(k.id) })),
    ]);
    if (origin) {
      const valid = others.map((k, i) => ({ k, p: kPoints[i] })).filter((x): x is { k: typeof x.k; p: LngLat } => !!x.p);
      const dists = await roadDistancesKm(origin, valid.map((x) => x.p), s.roadFactor);
      valid.forEach((x, i) => distanceById.set(x.k.id, dists[i]));
    }
  }

  const inRange = kitchens.filter((k) => String(k.areaId) === areaId || (distanceById.get(k.id)?.km ?? Infinity) <= radius);
  const withMenus = await withTodayMenus(inRange);
  return {
    radiusKm: radius,
    defaultRadiusKm: Math.min(config?.nearbyRadiusKm ?? 3, s.maxKm),
    pricing: { sameAreaFee: s.sameAreaFee, slabs: s.slabs, maxKm: s.maxKm },
    areas: nearby.map((a) => ({ _id: a._id, name: a.name, distanceKm: a.distanceKm })),
    kitchens: withMenus.map((k) => {
      const sameArea = String(k.kitchen.areaId) === areaId;
      const d = distanceById.get(String(k.kitchen._id));
      const distanceKm = sameArea ? 0 : d?.km ?? 0;
      return { ...k, distanceKm, distanceSource: sameArea ? null : d?.source ?? null, sameArea, deliveryCharge: feeFor(s, distanceKm, sameArea) ?? 0 };
    }),
  };
};

// ─── হোম পেজের পাবলিক তথ্য (ফ্রন্টএন্ড ISR দিয়ে ১০ মিনিট পরপর নেয়) ───
// জনপ্রিয় খাবার = গত ৩০ দিনে সবচেয়ে বেশি অর্ডার হওয়া অ্যাডমিন লাইব্রেরির খাবার
export const getPublicHighlights = async () => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [popular, kitchens, areas, delivered, cities] = await Promise.all([
    Order.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { createdAt: { $gte: since }, status: { $nin: ['rejected', 'cancelled'] } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.foodItem', n: { $sum: '$items.quantity' } } },
      { $sort: { n: -1 } },
      { $limit: 24 },
    ]),
    User.countDocuments({ role: 'kitchen', isApproved: true, isActive: true }),
    Area.countDocuments({ isActive: true }),
    Order.countDocuments({ status: 'delivered' }),
    Area.distinct('city', { isActive: true }),
  ]);
  const rank = new Map(popular.map((p, i) => [String(p._id), i]));
  const foods = await FoodItem.find({ isActive: true, source: { $ne: 'kitchen' } })
    .select('name category image images imageCredit source').lean();
  foods.sort((a, b) => (rank.get(String(a._id)) ?? 999) - (rank.get(String(b._id)) ?? 999));
  return {
    foods: foods.slice(0, 8),
    stats: { kitchens, areas, cities: cities.length, delivered },
  };
};
