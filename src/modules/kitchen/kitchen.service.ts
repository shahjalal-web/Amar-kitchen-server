import mongoose from 'mongoose';
import { DailyMenu, Withdrawal } from './kitchen.model';
import { User } from '../auth/auth.model';
import { emit } from '../../utils/realtime';
import { GlobalConfig, FoodItem, IFoodItem } from '../admin/admin.model';
import { Area } from '../location/location.model';
import { findNearbyAreas, AREA_POPULATE } from '../location/location.service';
import { Order } from '../order/order.model';
import { transitionOrder } from '../order/order.service';

const todayDate = () => new Date().toISOString().split('T')[0];

// ─── Food: অ্যাডমিন লাইব্রেরি + কিচেনের নিজের খাবার ─────
const FOOD_CATEGORIES = ['ভাত', 'রুটি', 'মাছ', 'মাংস', 'সবজি', 'ডাল', 'সালাদ', 'পানীয়', 'অন্যান্য'];

// কিচেন মেনু বানানোর সময় যা দেখে: সক্রিয় অ্যাডমিন খাবার আগে, তারপর নিজের তৈরি খাবার
export const getActiveFoodItems = (kitchenId: string) =>
  FoodItem.find({ isActive: true, $or: [{ source: 'admin' }, { source: { $exists: false } }, { kitchen: kitchenId }] })
    .sort({ source: 1, category: 1, name: 1 });

export const getMyFoodItems = (kitchenId: string) =>
  FoodItem.find({ kitchen: kitchenId }).sort({ isActive: -1, name: 1 });

export const createKitchenFood = async (kitchenId: string, data: { name?: string; category?: string; image?: string }) => {
  const name = data.name?.trim();
  if (!name) throw new Error('খাবারের নাম দিন');
  if (!data.category || !FOOD_CATEGORIES.includes(data.category)) throw new Error('ক্যাটাগরি নির্বাচন করুন');
  if (!data.image) throw new Error('খাবারের ছবি দিন');
  if (await FoodItem.exists({ name, kitchen: kitchenId })) throw new Error('এই নামে আপনার খাবার আগেই আছে');
  return FoodItem.create({
    name, category: data.category as IFoodItem['category'], image: data.image,
    source: 'kitchen', kitchen: kitchenId, createdBy: kitchenId,
  });
};

export const updateKitchenFood = async (
  kitchenId: string, foodId: string, data: { name?: string; category?: string; image?: string; isActive?: boolean }
) => {
  const food = await FoodItem.findOne({ _id: foodId, kitchen: kitchenId });
  if (!food) throw new Error('খাবার পাওয়া যায়নি (শুধু নিজের তৈরি খাবার সম্পাদনা করা যায়)');
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
  if (data.image) food.image = data.image;
  if (data.isActive !== undefined) food.isActive = data.isActive;
  return food.save();
};

// ─── ইউজারের খাবার সার্চ: নির্বাচিত ও আশেপাশের এলাকার আজকের মেনুতে ───
// ফলাফলে অ্যাডমিন লাইব্রেরির খাবার আগে, তারপর কিচেন মালিকদের নিজের খাবার; একই উৎসের মধ্যে কিচেনের রেটিং অনুযায়ী
export const searchFoodInArea = async (areaId: string, q: string) => {
  const query = q.trim();
  if (query.length < 1) return [];
  const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  // নাম বা ক্যাটাগরি (যেমন "মাংস", "মাছ") — দুটোতেই মেলে
  const foods = await FoodItem.find({ isActive: true, $or: [{ name: rx }, { category: rx }] }).select('_id');
  if (foods.length === 0) return [];

  const config = await GlobalConfig.findOne();
  const nearby = await findNearbyAreas(areaId, config?.nearbyRadiusKm ?? 3, 15);
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
        const food = it.foodItem as unknown as { _id: string; name: string; image: string; imageCredit?: string; category: string; source?: string };
        return {
          menuId: m.id as string,
          price: it.price,
          food: { _id: food._id, name: food.name, image: food.image, imageCredit: food.imageCredit, category: food.category, source: food.source ?? 'admin' },
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
// ধাপ: একই এরিয়া → sameAreaDeliveryFee (৳২০), একই থানা → sameThanaDeliveryFee, অন্যথায় deliveryBaseFee।
// তারপর একই বিল্ডিংয়ের অন্য অর্ডার থাকলে cluster discount।
export const calcDeliveryCharge = async (
  kitchenAreaId: string | undefined,
  customerAreaId: string | undefined,
  activeOrdersInBuilding = 1
): Promise<number> => {
  const config = await GlobalConfig.findOne();
  const baseFee = config?.deliveryBaseFee ?? 50;
  const sameAreaFee = config?.sameAreaDeliveryFee ?? 20;
  const sameThanaFee = config?.sameThanaDeliveryFee ?? 35;
  const discountPerOrder = config?.deliveryDiscountPercentPerOrder ?? 10;
  const maxDiscount = config?.maxDeliveryDiscount ?? 70;

  let fee = baseFee;
  if (kitchenAreaId && customerAreaId) {
    if (kitchenAreaId === customerAreaId) {
      fee = sameAreaFee;
    } else {
      const [a, b] = await Promise.all([
        Area.findById(kitchenAreaId).select('thana'),
        Area.findById(customerAreaId).select('thana'),
      ]);
      if (a && b && a.thana.equals(b.thana)) fee = sameThanaFee;
    }
  }

  const discountPct = Math.min(Math.max(activeOrdersInBuilding - 1, 0) * discountPerOrder, maxDiscount);
  return Math.round(fee * (1 - discountPct / 100));
};
