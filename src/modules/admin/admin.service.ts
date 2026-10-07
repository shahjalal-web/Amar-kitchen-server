import { Types } from 'mongoose';
import { FoodItem, Package, GlobalConfig, PackageTier, IFoodItem } from './admin.model';
import { User } from '../auth/auth.model';
import { Order, OrderStatus } from '../order/order.model';
import { Withdrawal } from '../kitchen/kitchen.model';
import { notifyAccountReview, notifyWithdrawalReview, notifyOrderStatus } from '../../utils/notify';
import { pushStatus } from '../order/order.service';
import { Area } from '../location/location.model';
import { AREA_POPULATE } from '../location/location.service';
import { DailyMenu } from '../kitchen/kitchen.model';
import { Subscription } from '../subscription/subscription.model';
import { normalizeImages, destroyUnusedImages } from '../../utils/images';

type FoodCategory = IFoodItem['category'];

// ─── Food Library ─────────────────────────────────────────
type FoodDoc = InstanceType<typeof FoodItem>;

// নতুন ছবির তালিকা বসায়; যে ছবিগুলো বাদ পড়ল সেগুলোর publicId ফেরত দেয় (সেভের পর মুছতে)
export const setFoodImages = (food: FoodDoc, input: unknown): string[] => {
  const next = normalizeImages(input);
  if (!next.length) throw new Error('অন্তত একটি ছবি দিন');
  // আগের ছবির credit হারিয়ে না যায় (ক্লায়েন্ট শুধু URL পাঠালেও)
  const oldById = new Map((food.images ?? []).map((i) => [i.publicId, i]));
  food.images = next.map((i) => ({ ...i, credit: i.credit ?? oldById.get(i.publicId)?.credit })) as FoodDoc['images'];
  const keep = new Set(next.map((i) => i.publicId));
  return [...oldById.keys()].filter((id) => !keep.has(id));
};

// স্থায়ীভাবে মুছে ফেলা + Cloudinary থেকে ছবি মুছে ফেলা।
// আগের অর্ডার/প্যাকেজ/সাবস্ক্রিপশনে থাকলে মোছা যাবে না (ইতিহাস ভেঙে যাবে) — তখন বন্ধ করে রাখতে হবে।
export const deleteFoodPermanently = async (food: FoodDoc) => {
  const used = await Promise.all([
    Order.exists({ 'items.foodItem': food._id }),
    Package.exists({ 'items.foodItem': food._id }),
    Subscription.exists({ 'customItems.foodItem': food._id }),
  ]);
  if (used.some(Boolean)) {
    throw new Error('এই খাবার আগের অর্ডার/প্যাকেজে আছে, তাই মোছা যাবে না — "বন্ধ করুন" দিয়ে লুকিয়ে রাখুন');
  }
  await DailyMenu.updateMany({}, { $pull: { items: { foodItem: food._id }, freeItems: food._id } });
  const publicIds = (food.images ?? []).map((i) => i.publicId);
  await food.deleteOne();
  const deleted = await destroyUnusedImages(publicIds);
  return { deletedImages: deleted.length };
};

export const createFoodItem = async (adminId: string, data: {
  name?: string;
  images?: unknown;
  category?: FoodCategory;
}) => {
  const name = data.name?.trim();
  if (!name) throw new Error('খাবারের নাম দিন');
  if (!data.category) throw new Error('ক্যাটাগরি নির্বাচন করুন');
  if (await FoodItem.exists({ name, kitchen: null })) throw new Error('এই নামে খাবার লাইব্রেরিতে আগেই আছে');
  const food = new FoodItem({ name, category: data.category, source: 'admin', createdBy: adminId });
  setFoodImages(food, data.images);
  return food.save();
};

// অ্যাডমিনের লাইব্রেরি আগে, তারপর কিচেনগুলোর নিজের খাবার
export const getAllFoodItems = () =>
  FoodItem.find().populate('kitchen', 'name kitchenName').sort({ source: 1, category: 1, name: 1 });

export const updateFoodItem = async (
  id: string,
  data: Partial<{ name: string; images: unknown; category: FoodCategory; isActive: boolean }>
) => {
  const food = await FoodItem.findById(id);
  if (!food) throw new Error('খাবার পাওয়া যায়নি');
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw new Error('খাবারের নাম দিন');
    if (await FoodItem.exists({ _id: { $ne: food._id }, name, kitchen: food.kitchen ?? null })) throw new Error('এই নামে খাবার আগেই আছে');
    food.name = name;
  }
  if (data.category !== undefined) food.category = data.category;
  if (data.isActive !== undefined) food.isActive = data.isActive;
  const removed = data.images !== undefined ? setFoodImages(food, data.images) : [];
  await food.save();
  await destroyUnusedImages(removed);
  return food;
};

export const deleteFoodItem = async (id: string) => {
  const food = await FoodItem.findById(id);
  if (!food) throw new Error('খাবার পাওয়া যায়নি');
  return deleteFoodPermanently(food);
};

// ─── Package Management ───────────────────────────────────
export const createPackage = (data: {
  name: string;
  tier: PackageTier;
  items: { foodItem: string; quantity: number }[];
  basePrice: number;
}) => Package.create(data);

export const getAllPackages = () =>
  Package.find({ isActive: true }).populate('items.foodItem');

export const updatePackage = (id: string, data: object) =>
  Package.findByIdAndUpdate(id, data, { new: true });

// ─── Global Config ────────────────────────────────────────
export const getGlobalConfig = async () => {
  let config = await GlobalConfig.findOne();
  if (!config) config = await GlobalConfig.create({});
  return config;
};

export const updateGlobalConfig = (adminId: string, data: Record<string, unknown>) => {
  const { _id, createdAt, updatedAt, __v, ...rest } = data; // eslint-disable-line @typescript-eslint/no-unused-vars
  // ডেলিভারির ধাপ: দূরত্ব বাড়লে চার্জ কমতে পারবে না, একই দূরত্ব দুবার নয়
  if (rest.deliverySlabs !== undefined) {
    if (!Array.isArray(rest.deliverySlabs) || rest.deliverySlabs.length === 0) throw new Error('অন্তত একটি ডেলিভারি ধাপ দিন');
    const slabs = rest.deliverySlabs
      .map((x: { upToKm?: unknown; fee?: unknown }) => ({ upToKm: Number(x?.upToKm), fee: Number(x?.fee) }))
      .sort((a, b) => a.upToKm - b.upToKm);
    slabs.forEach((x, i) => {
      if (!(x.upToKm > 0) || !(x.fee >= 0)) throw new Error('ডেলিভারি ধাপের দূরত্ব ও চার্জ সঠিক দিন');
      if (i > 0 && (x.upToKm === slabs[i - 1].upToKm || x.fee < slabs[i - 1].fee)) throw new Error('দূরত্ব বাড়লে চার্জ কমতে পারবে না, আর একই দূরত্ব দুবার দেওয়া যাবে না');
    });
    rest.deliverySlabs = slabs;
  }
  return GlobalConfig.findOneAndUpdate({}, { ...rest, updatedBy: adminId }, { upsert: true, new: true, runValidators: true });
};

// ─── Approvals ────────────────────────────────────────────
export const getPendingApprovals = (status?: string) => {
  const filter: Record<string, unknown> = { role: { $in: ['kitchen', 'delivery'] } };

  if (status === 'pending') Object.assign(filter, { isApproved: false, isActive: true });
  else if (status === 'approved') Object.assign(filter, { isApproved: true, isActive: true });
  else if (status === 'rejected') Object.assign(filter, { isActive: false });
  // status === 'all' (or unspecified): no extra filter

  return User.find(filter).select('-firebaseUid');
};

export const approveUser = async (userId: string) => {
  const user = await User.findByIdAndUpdate(userId, { isApproved: true, isActive: true }, { new: true });
  if (user) notifyAccountReview(userId, true).catch(console.error);
  return user;
};

export const rejectUser = async (userId: string) => {
  const user = await User.findByIdAndUpdate(userId, { isActive: false }, { new: true });
  if (user) notifyAccountReview(userId, false).catch(console.error);
  return user;
};

export const setKitchenOrderLimit = (kitchenId: string, limit: number) =>
  User.findByIdAndUpdate(kitchenId, { orderLimit: limit }, { new: true });

// ─── Financial Overview ───────────────────────────────────
export const getFinancialSummary = async () => {
  const config = await getGlobalConfig();
  const commissionRate = config.commissionRate ?? 10;

  const [revenueAgg] = await Order.aggregate([
    { $match: { status: 'delivered', isPaid: true } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        totalDeliveryCharge: { $sum: '$deliveryCharge' },
        deliveredOrders: { $sum: 1 },
      },
    },
  ]);

  const totalRevenue = revenueAgg?.totalRevenue ?? 0;
  const totalDeliveryCharge = revenueAgg?.totalDeliveryCharge ?? 0;
  const deliveredOrders = revenueAgg?.deliveredOrders ?? 0;
  const deliveryCommissionRate = config.deliveryCommissionRate ?? 8;
  const commissionEarned = Math.round((totalRevenue * commissionRate) / 100);
  const deliveryCommissionEarned = Math.round((totalDeliveryCharge * deliveryCommissionRate) / 100);

  const [walletAgg] = await User.aggregate([
    { $match: { role: 'kitchen' } },
    { $group: { _id: null, totalWalletBalance: { $sum: '$walletBalance' } } },
  ]);

  const [pendingWithdrawAgg] = await Withdrawal.aggregate([
    { $match: { status: 'pending' } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  const [paidWithdrawAgg] = await Withdrawal.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return {
    totalRevenue,
    totalDeliveryCharge,
    deliveredOrders,
    commissionRate,
    commissionEarned,
    deliveryCommissionRate,
    deliveryCommissionEarned,
    totalKitchenWalletBalance: walletAgg?.totalWalletBalance ?? 0,
    pendingWithdrawals: { count: pendingWithdrawAgg?.count ?? 0, amount: pendingWithdrawAgg?.total ?? 0 },
    totalPaidOut: paidWithdrawAgg?.total ?? 0,
  };
};

// ─── Withdrawal Management ────────────────────────────────
export const getAllWithdrawals = () =>
  Withdrawal.find().populate('kitchen', 'kitchenName name').sort({ createdAt: -1 });

export const approveWithdrawal = async (id: string) => {
  const withdrawal = await Withdrawal.findById(id);
  if (!withdrawal) throw new Error('উইথড্র রিকোয়েস্ট পাওয়া যায়নি');
  if (withdrawal.status !== 'pending') throw new Error('এই রিকোয়েস্ট ইতিমধ্যে প্রসেস হয়েছে');

  const kitchen = await User.findById(withdrawal.kitchen);
  if (!kitchen || (kitchen.walletBalance ?? 0) < withdrawal.amount) {
    throw new Error('কিচেনের পর্যাপ্ত ব্যালেন্স নেই');
  }

  kitchen.walletBalance = (kitchen.walletBalance ?? 0) - withdrawal.amount;
  await kitchen.save();

  withdrawal.status = 'approved';
  withdrawal.processedAt = new Date();
  await withdrawal.save();
  notifyWithdrawalReview(withdrawal.kitchen, withdrawal.amount, true).catch(console.error);
  return withdrawal;
};

export const rejectWithdrawal = async (id: string, note?: string) => {
  const withdrawal = await Withdrawal.findById(id);
  if (!withdrawal) throw new Error('উইথড্র রিকোয়েস্ট পাওয়া যায়নি');
  if (withdrawal.status !== 'pending') throw new Error('এই রিকোয়েস্ট ইতিমধ্যে প্রসেস হয়েছে');

  withdrawal.status = 'rejected';
  withdrawal.processedAt = new Date();
  if (note) withdrawal.note = note;
  await withdrawal.save();
  notifyWithdrawalReview(withdrawal.kitchen, withdrawal.amount, false).catch(console.error);
  return withdrawal;
};

// ═══════════════════ অ্যাডমিন ইনসাইট ও ম্যানেজমেন্ট ═══════════════════
const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};
const LIVE_STATUSES: OrderStatus[] = ['pending', 'accepted', 'ready', 'picked_up'];
const COUNTED_STATUSES: OrderStatus[] = ['pending', 'accepted', 'ready', 'picked_up', 'delivered', 'resell', 'resold'];
const escapeRx = (s: string) => new RegExp(s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const dhakaDate = (d: Date) => new Date(d.getTime() + 6 * 3600 * 1000).toISOString().split('T')[0];

// ─── ওভারভিউ ড্যাশবোর্ড ──────────────────────────────────
export const getDashboardStats = async () => {
  const today = daysAgo(0);
  const since14 = daysAgo(13);
  const since30 = daysAgo(29);

  const [roleCounts, pendingApprovals, todayAgg, liveOrders, daily, statusAgg, topKitchens, topAreas, recentOrders, coverage] =
    await Promise.all([
      User.aggregate([{ $match: { isActive: true, isApproved: true } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.countDocuments({ role: { $in: ['kitchen', 'delivery'] }, isApproved: false, isActive: true }),
      Order.aggregate([
        { $match: { createdAt: { $gte: today }, status: { $in: COUNTED_STATUSES } } },
        { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' }, delivery: { $sum: '$deliveryCharge' } } },
      ]),
      Order.countDocuments({ status: { $in: LIVE_STATUSES } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: since14 }, status: { $in: COUNTED_STATUSES } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Dhaka' } },
            orders: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
      ]),
      Order.aggregate([{ $match: { createdAt: { $gte: since30 } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since30 }, status: { $in: COUNTED_STATUSES } } },
        { $group: { _id: '$kitchen', orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
        { $sort: { orders: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'k' } },
        { $unwind: '$k' },
        { $project: { orders: 1, revenue: 1, name: { $ifNull: ['$k.kitchenName', '$k.name'] }, area: '$k.area', rating: '$k.rating' } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since30 }, status: { $in: COUNTED_STATUSES } } },
        { $group: { _id: { area: '$area', thana: '$thana', city: '$city' }, orders: { $sum: 1 } } },
        { $sort: { orders: -1 } },
        { $limit: 5 },
      ]),
      Order.find().sort({ createdAt: -1 }).limit(6)
        .populate('user', 'name').populate('kitchen', 'name kitchenName')
        .select('uniqueCode status totalAmount area createdAt user kitchen'),
      getCoverageGaps(),
    ]);

  // ১৪ দিনের প্রতিটি দিন (অর্ডার না থাকলে ০)
  const byDay = new Map(daily.map((d) => [d._id as string, d]));
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const key = dhakaDate(daysAgo(13 - i));
    return { date: key, orders: byDay.get(key)?.orders ?? 0, revenue: byDay.get(key)?.revenue ?? 0 };
  });

  const roles = Object.fromEntries(roleCounts.map((r) => [r._id, r.count]));
  return {
    counts: {
      users: roles.user ?? 0,
      kitchens: roles.kitchen ?? 0,
      deliveryBoys: roles.delivery ?? 0,
      pendingApprovals,
      liveOrders,
    },
    today: { orders: todayAgg[0]?.orders ?? 0, revenue: todayAgg[0]?.revenue ?? 0, deliveryCharge: todayAgg[0]?.delivery ?? 0 },
    last14,
    statusBreakdown: Object.fromEntries(statusAgg.map((s) => [s._id, s.count])),
    topKitchens,
    topAreas: topAreas.map((a) => ({ ...a._id, orders: a.orders })),
    recentOrders,
    coverage,
  };
};

// ─── কভারেজ গ্যাপ: কোথায় চাহিদা আছে কিন্তু সাপ্লাই নেই ────
export const getCoverageGaps = async () => {
  const [customerAreas, kitchenAreas, deliveryAreas] = await Promise.all([
    User.aggregate([
      { $match: { role: 'user', isActive: true, areaId: { $exists: true } } },
      { $group: { _id: '$areaId', customers: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { role: 'kitchen', isActive: true, isApproved: true, areaId: { $exists: true } } },
      { $group: { _id: '$areaId', kitchens: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { role: 'delivery', isActive: true, isApproved: true } },
      { $unwind: '$deliveryAreaIds' },
      { $group: { _id: '$deliveryAreaIds', boys: { $sum: 1 } } },
    ]),
  ]);
  const kitchenSet = new Set(kitchenAreas.map((k) => String(k._id)));
  const deliverySet = new Set(deliveryAreas.map((d) => String(d._id)));

  const noKitchen = customerAreas.filter((c) => !kitchenSet.has(String(c._id))).sort((a, b) => b.customers - a.customers).slice(0, 8);
  const noDelivery = kitchenAreas.filter((k) => !deliverySet.has(String(k._id))).slice(0, 8);

  const ids = [...noKitchen, ...noDelivery].map((x) => x._id);
  const areas = await Area.find({ _id: { $in: ids } }).populate(AREA_POPULATE).select('name zipCode thana city');
  const label = new Map(areas.map((a) => {
    const t = a.thana as unknown as { name: string } | null;
    const c = a.city as unknown as { name: string } | null;
    return [a.id as string, `${a.name}, ${t?.name ?? ''}, ${c?.name ?? ''}`];
  }));
  return {
    noKitchen: noKitchen.map((c) => ({ areaId: c._id, label: label.get(String(c._id)) ?? '—', customers: c.customers })),
    noDelivery: noDelivery.map((k) => ({ areaId: k._id, label: label.get(String(k._id)) ?? '—', kitchens: k.kitchens })),
  };
};

// ─── সব অর্ডার (ফিল্টার + পেজিনেশন) ──────────────────────
export const listAllOrders = async (f: {
  status?: string; city?: string; q?: string; from?: string; to?: string; page?: number; limit?: number;
}) => {
  const filter: Record<string, unknown> = {};
  if (f.status && f.status !== 'all') filter.status = f.status;
  if (f.city) filter.city = f.city;
  if (f.from || f.to) {
    const range: Record<string, Date> = {};
    if (f.from) range.$gte = new Date(`${f.from}T00:00:00+06:00`);
    if (f.to) range.$lte = new Date(`${f.to}T23:59:59+06:00`);
    filter.createdAt = range;
  }
  if (f.q?.trim()) {
    const rx = escapeRx(f.q);
    filter.$or = [{ uniqueCode: rx }, { customerPhone: rx }, { area: rx }, { thana: rx }, { deliveryAddress: rx }];
  }
  const limit = Math.min(Math.max(Number(f.limit) || 20, 1), 100);
  const page = Math.max(Number(f.page) || 1, 1);
  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name phone email')
      .populate('kitchen', 'name kitchenName phone')
      .populate('deliveryBoy', 'name phone')
      .populate('items.foodItem', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) };
};

// অ্যাডমিন যেকোনো চলমান অর্ডার বাতিল করতে পারে (কারণসহ) — সংশ্লিষ্ট সবাইকে ইমেইল যায়
export const adminCancelOrder = async (adminId: string, orderId: string, reason?: string) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('অর্ডার পাওয়া যায়নি');
  if (!LIVE_STATUSES.includes(order.status)) throw new Error('শুধু চলমান অর্ডার বাতিল করা যায়');
  pushStatus(order, 'cancelled', 'admin', adminId, reason?.trim() || 'অ্যাডমিন বাতিল করেছেন');
  await order.save();
  notifyOrderStatus(order, 'system').catch(console.error);
  return order;
};

// ─── ইউজার ম্যানেজমেন্ট ───────────────────────────────────
export interface UserListFilter {
  role?: string; q?: string; status?: string; page?: number;
  cityId?: string; thanaId?: string; areaId?: string;
  minOrders?: number; maxOrders?: number;
  activity?: string;      // recent30 | inactive30 | never
  joined?: number;        // শেষ কত দিনে যোগ দিয়েছেন
  minRating?: number;     // কিচেন
  pin?: string;           // yes | no — কিচেনের ম্যাপ পিন
  menuToday?: string;     // yes | no — আজ মেনু দিয়েছে কিনা
  available?: string;     // yes | no — ডেলিভারি বয়
  sort?: string;          // newest | oldest | orders | orders_asc | amount | rating | name | last_order
}

const DAY_MS = 86_400_000;

export const listUsers = async (f: UserListFilter) => {
  const and: Record<string, unknown>[] = [{ role: { $ne: 'admin' } }];
  if (f.role && f.role !== 'all') and.push({ role: f.role });
  if (f.status === 'active') and.push({ isActive: true, isApproved: true });
  if (f.status === 'blocked') and.push({ isActive: false });
  if (f.status === 'pending') and.push({ isActive: true, isApproved: false });
  if (f.q?.trim()) {
    const rx = escapeRx(f.q);
    and.push({ $or: [{ name: rx }, { email: rx }, { phone: rx }, { kitchenName: rx }, { area: rx }] });
  }

  // এলাকা: শহর → থানা → এরিয়া, যেটা সবচেয়ে নির্দিষ্ট সেটা ধরে
  if (f.areaId || f.thanaId || f.cityId) {
    const areaIds = f.areaId
      ? [new Types.ObjectId(f.areaId)]
      : (await Area.find(f.thanaId ? { thana: f.thanaId } : { city: f.cityId }).select('_id').lean()).map((a) => a._id);
    and.push({ $or: [{ areaId: { $in: areaIds } }, { 'addresses.areaId': { $in: areaIds } }, { deliveryAreaIds: { $in: areaIds } }] });
  }
  if (f.joined) and.push({ createdAt: { $gte: new Date(Date.now() - f.joined * DAY_MS) } });
  if (f.minRating) and.push({ rating: { $gte: f.minRating } });
  if (f.pin === 'yes') and.push({ 'kitchenLocation.coordinates.1': { $exists: true } });
  if (f.pin === 'no') and.push({ 'kitchenLocation.coordinates.1': { $exists: false } });
  if (f.available === 'yes') and.push({ isAvailable: { $ne: false } });
  if (f.available === 'no') and.push({ isAvailable: false });
  if (f.menuToday === 'yes' || f.menuToday === 'no') {
    const ids = await DailyMenu.distinct('kitchen', { date: new Date().toISOString().split('T')[0] });
    and.push({ _id: f.menuToday === 'yes' ? { $in: ids } : { $nin: ids } });
  }
  const filter = { $and: and };

  // প্রথমে মিলে যাওয়া সবার হালকা তথ্য — অর্ডারের হিসাব দিয়ে ফিল্টার/সাজানোর জন্য
  const matched = await User.find(filter).select('_id name kitchenName rating createdAt').lean();
  const ids = matched.map((u) => u._id);
  const group = { n: { $sum: 1 }, amount: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$totalAmount', 0] } }, last: { $max: '$createdAt' } };
  const [asUser, asKitchen, asBoy] = await Promise.all([
    Order.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', ...group } }]),
    Order.aggregate([{ $match: { kitchen: { $in: ids } } }, { $group: { _id: '$kitchen', ...group } }]),
    Order.aggregate([
      { $match: { deliveryBoy: { $in: ids }, status: 'delivered' } },
      { $group: { _id: '$deliveryBoy', n: { $sum: 1 }, amount: { $sum: '$deliveryCharge' }, last: { $max: '$createdAt' } } },
    ]),
  ]);
  type Stat = { n: number; amount: number; last: Date | null };
  const stats = new Map<string, Stat>([...asUser, ...asKitchen, ...asBoy].map((x) => [String(x._id), { n: x.n, amount: x.amount, last: x.last }]));
  const statOf = (id: unknown): Stat => stats.get(String(id)) ?? { n: 0, amount: 0, last: null };

  const now = Date.now();
  let rows = matched.filter((u) => {
    const st = statOf(u._id);
    if (f.minOrders !== undefined && st.n < f.minOrders) return false;
    if (f.maxOrders !== undefined && st.n > f.maxOrders) return false;
    if (f.activity === 'never' && st.n > 0) return false;
    if (f.activity === 'recent30' && !(st.last && now - new Date(st.last).getTime() <= 30 * DAY_MS)) return false;
    if (f.activity === 'inactive30' && (!st.last || now - new Date(st.last).getTime() <= 30 * DAY_MS)) return false;
    return true;
  });

  type Row = (typeof rows)[number];
  const time = (d?: Date | null) => (d ? new Date(d).getTime() : 0);
  const sorters: Record<string, (a: Row, b: Row) => number> = {
    oldest: (a, b) => time(a.createdAt) - time(b.createdAt),
    orders: (a, b) => statOf(b._id).n - statOf(a._id).n,
    orders_asc: (a, b) => statOf(a._id).n - statOf(b._id).n,
    amount: (a, b) => statOf(b._id).amount - statOf(a._id).amount,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    name: (a, b) => (a.kitchenName || a.name).localeCompare(b.kitchenName || b.name, 'bn'),
    last_order: (a, b) => time(statOf(b._id).last) - time(statOf(a._id).last),
  };
  rows = rows.sort(sorters[f.sort ?? ''] ?? ((a, b) => time(b.createdAt) - time(a.createdAt)));

  const limit = 25;
  const total = rows.length;
  const pages = Math.max(Math.ceil(total / limit), 1);
  const page = Math.min(Math.max(Number(f.page) || 1, 1), pages);
  const pageIds = rows.slice((page - 1) * limit, page * limit).map((u) => String(u._id));
  const docs = await User.find({ _id: { $in: pageIds } })
    .select('name email phone role isActive isApproved isAvailable area kitchenName rating orderLimit walletBalance deliveryAreaIds createdAt');
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  return {
    items: pageIds.flatMap((id) => {
      const d = byId.get(id);
      if (!d) return [];
      const st = statOf(id);
      return [{ ...d.toObject(), orderCount: st.n, orderAmount: st.amount, lastOrderAt: st.last }];
    }),
    total,
    page,
    pages,
  };
};

export const getUserDetail = async (userId: string) => {
  const user = await User.findById(userId)
    .select('-firebaseUid +kitchenLocation') // অ্যাডমিন কিচেনের আসল লোকেশন দেখতে পারেন
    .populate({ path: 'addresses.areaId', populate: AREA_POPULATE })
    .populate({ path: 'deliveryAreaIds', select: 'name zipCode' });
  if (!user) throw new Error('ইউজার পাওয়া যায়নি');
  const key = user.role === 'kitchen' ? 'kitchen' : user.role === 'delivery' ? 'deliveryBoy' : 'user';
  const orders = await Order.find({ [key]: user._id })
    .sort({ createdAt: -1 }).limit(10)
    .select('uniqueCode status totalAmount deliveryCharge area createdAt');
  return { user, orders };
};

export const setUserActive = async (userId: string, isActive: boolean) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('ইউজার পাওয়া যায়নি');
  if (user.role === 'admin') throw new Error('অ্যাডমিন একাউন্ট ব্লক করা যাবে না');
  user.isActive = isActive;
  await user.save();
  return user;
};
