import { FoodItem, Package, GlobalConfig, PackageTier, IFoodItem } from './admin.model';
import { User } from '../auth/auth.model';
import { Order, OrderStatus } from '../order/order.model';
import { Withdrawal } from '../kitchen/kitchen.model';
import { notifyAccountReview, notifyWithdrawalReview, notifyOrderStatus } from '../../utils/notify';
import { pushStatus } from '../order/order.service';
import { Area } from '../location/location.model';
import { AREA_POPULATE } from '../location/location.service';

type FoodCategory = IFoodItem['category'];

// ─── Food Library ─────────────────────────────────────────
export const createFoodItem = async (adminId: string, data: {
  name: string;
  image: string;
  category: FoodCategory;
  imageCredit?: string;
}) => {
  const name = data.name?.trim();
  if (!name) throw new Error('খাবারের নাম দিন');
  if (await FoodItem.exists({ name, kitchen: null })) throw new Error('এই নামে খাবার লাইব্রেরিতে আগেই আছে');
  return FoodItem.create({ ...data, name, source: 'admin', createdBy: adminId });
};

// অ্যাডমিনের লাইব্রেরি আগে, তারপর কিচেনগুলোর নিজের খাবার
export const getAllFoodItems = () =>
  FoodItem.find().populate('kitchen', 'name kitchenName').sort({ source: 1, category: 1, name: 1 });

export const updateFoodItem = (
  id: string,
  data: Partial<{ name: string; image: string; imageCredit: string; category: FoodCategory; isActive: boolean }>
) => {
  // শুধু এই ফিল্ডগুলো বদলানো যায় (source/kitchen নয়); না পাঠানো ফিল্ড অপরিবর্তিত থাকে
  const allowed = ['name', 'image', 'imageCredit', 'category', 'isActive'] as const;
  const update = Object.fromEntries(allowed.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
  return FoodItem.findByIdAndUpdate(id, update, { new: true });
};

export const deleteFoodItem = (id: string) =>
  FoodItem.findByIdAndUpdate(id, { isActive: false }, { new: true });

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

export const updateGlobalConfig = (adminId: string, data: object) =>
  GlobalConfig.findOneAndUpdate(
    {},
    { ...data, updatedBy: adminId },
    { upsert: true, new: true }
  );

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
  const commissionEarned = Math.round((totalRevenue * commissionRate) / 100);

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
export const listUsers = async (f: { role?: string; q?: string; status?: string; page?: number }) => {
  const filter: Record<string, unknown> = { role: { $ne: 'admin' } };
  if (f.role && f.role !== 'all') filter.role = f.role;
  if (f.status === 'active') Object.assign(filter, { isActive: true });
  if (f.status === 'blocked') Object.assign(filter, { isActive: false });
  if (f.status === 'pending') Object.assign(filter, { isActive: true, isApproved: false });
  if (f.q?.trim()) {
    const rx = escapeRx(f.q);
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { kitchenName: rx }, { area: rx }];
  }
  const limit = 25;
  const page = Math.max(Number(f.page) || 1, 1);
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('name email phone role isActive isApproved area kitchenName rating orderLimit walletBalance deliveryAreaIds createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  // প্রতিটি ইউজারের অর্ডার সংখ্যা (রোল অনুযায়ী: গ্রাহক/কিচেন/ডেলিভারি বয়)
  const ids = users.map((u) => u._id);
  const [asUser, asKitchen, asBoy] = await Promise.all([
    Order.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { kitchen: { $in: ids } } }, { $group: { _id: '$kitchen', n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { deliveryBoy: { $in: ids }, status: 'delivered' } }, { $group: { _id: '$deliveryBoy', n: { $sum: 1 } } }]),
  ]);
  const count = new Map([...asUser, ...asKitchen, ...asBoy].map((x) => [String(x._id), x.n as number]));
  return {
    items: users.map((u) => ({ ...u.toObject(), orderCount: count.get(u.id) ?? 0 })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};

export const getUserDetail = async (userId: string) => {
  const user = await User.findById(userId)
    .select('-firebaseUid')
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
