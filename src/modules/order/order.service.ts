import crypto from 'crypto';
import mongoose from 'mongoose';
import { Order, IOrder, OrderStatus, DeliveryMode, IStatusEvent } from './order.model';
import { User } from '../auth/auth.model';
import { getActiveAreaOrThrow } from '../location/location.service';
import { DailyMenu } from '../kitchen/kitchen.model';
import { DeliveryTask } from '../delivery/delivery.model';
import { GlobalConfig } from '../admin/admin.model';
import { quoteDelivery } from '../kitchen/kitchen.service';
import { GeoPoint, hasPoint, parsePoint } from '../../utils/geo';
import { notifyNewOrder, notifyOrderStatus, notifyDeliveryAssigned, notifyDeliveryOtp } from '../../utils/notify';
import { emit } from '../../utils/realtime';

type ActorRole = IStatusEvent['role'];

const generateUniqueCode = (): string =>
  crypto.randomBytes(4).toString('hex').toUpperCase();

// unique: true স্কিমা থাকলেও collision হলে insert ফেইল করবে — তাই আগে চেক করে নাও
const generateFreeUniqueCode = async (): Promise<string> => {
  for (let i = 0; i < 5; i++) {
    const code = generateUniqueCode();
    if (!(await Order.exists({ uniqueCode: code }))) return code;
  }
  throw new Error('অর্ডার কোড তৈরি করা যায়নি, আবার চেষ্টা করুন');
};

const todayDate = () => new Date().toISOString().split('T')[0];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'accepted', 'ready', 'picked_up'];

// স্ট্যাটাস বদলাও + ইতিহাসে যোগ করো (save কলারের দায়িত্ব)
export const pushStatus = (order: IOrder, status: OrderStatus, role: ActorRole, by?: string, note?: string) => {
  order.status = status;
  order.statusHistory.push({
    status,
    at: new Date(),
    role,
    by: by ? new mongoose.Types.ObjectId(by) : undefined,
    note,
  });
};

const emitUpdate = (order: IOrder) => {
  const payload = { orderId: order._id, status: order.status };
  emit(`user:order-update:${order.user}`, payload);
  emit(`kitchen:order-update:${order.kitchen}`, payload);
  if (order.deliveryBoy) emit(`delivery:order-update:${order.deliveryBoy}`, payload);
};

// ─── Place Order ─────────────────────────────────────────
export interface PlaceOrderDTO {
  kitchenId: string;
  items: { foodItem: string; quantity: number }[];
  paymentMethod?: 'sslcommerz' | 'cash';
  addressId?: string;              // সেভ করা ঠিকানা
  address?: {                      // অথবা নতুন ঠিকানা: শহর → থানা → এরিয়া + বিস্তারিত
    areaId: string;
    buildingName: string;
    addressLine: string;
    phone?: string;
    label?: string;
    location?: { lat: number; lng: number } | null; // ম্যাপের পিন (ঐচ্ছিক)
  };
  saveAddress?: boolean;           // নতুন ঠিকানাটা ঠিকানা বইয়ে সেভ করো
}

export const placeOrder = async (userId: string, data: PlaceOrderDTO) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('ব্যবহারকারী পাওয়া যায়নি');

  // ─ ঠিকানা
  let addr: { areaId?: string; buildingName?: string; addressLine?: string; phone?: string; location?: GeoPoint | null };
  if (data.addressId) {
    const saved = user.addresses.id(data.addressId);
    if (!saved) throw new Error('সেভ করা ঠিকানা পাওয়া যায়নি');
    addr = {
      areaId: saved.areaId.toString(), buildingName: saved.buildingName, addressLine: saved.addressLine, phone: saved.phone,
      location: hasPoint(saved.location) ? (saved.location as GeoPoint) : null,
    };
  } else if (data.address) {
    addr = { ...data.address, location: parsePoint(data.address.location ?? null) ?? null };
  } else {
    throw new Error('ডেলিভারি ঠিকানা দিন');
  }
  const buildingName = addr.buildingName?.trim();
  const addressLine = addr.addressLine?.trim();
  if (!buildingName || !addressLine) throw new Error('বিল্ডিংয়ের নাম ও বিস্তারিত ঠিকানা দিন');
  const area = await getActiveAreaOrThrow(addr.areaId);

  // ─ কিচেন ও মেনু
  const kitchen = await User.findOne({ _id: data.kitchenId, role: 'kitchen', isApproved: true, isActive: true }).select('+kitchenLocation');
  if (!kitchen) throw new Error('কিচেন পাওয়া যায়নি');

  // দাম ক্লায়েন্ট থেকে নয় — কিচেনের আজকের মেনু থেকে নেওয়া হয়
  const menu = await DailyMenu.findOne({ kitchen: kitchen._id, date: todayDate(), isPublished: true });
  if (!menu) throw new Error('এই কিচেনের আজকের মেনু নেই');

  const priceByFood = new Map(menu.items.map((it) => [it.foodItem.toString(), it.price]));
  const items = (data.items || [])
    .filter((it) => Number(it.quantity) > 0)
    .map((it) => {
      const price = priceByFood.get(String(it.foodItem));
      if (price === undefined) throw new Error('মেনুতে নেই এমন খাবার অর্ডার করা যাবে না');
      return { foodItem: it.foodItem, quantity: Math.floor(Number(it.quantity)), price };
    });
  if (items.length === 0) throw new Error('অন্তত একটি খাবার নির্বাচন করুন');
  const totalAmount = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  // কিচেনের দৈনিক অর্ডার লিমিট (admin-নিয়ন্ত্রিত)
  const todayKitchenOrders = await Order.countDocuments({
    kitchen: kitchen._id,
    status: { $nin: ['cancelled', 'rejected'] },
    createdAt: { $gte: startOfToday() },
  });
  if (todayKitchenOrders >= (kitchen.orderLimit ?? 5)) {
    throw new Error('এই কিচেন আজকের অর্ডার লিমিটে পৌঁছে গেছে');
  }

  // একই বিল্ডিংয়ে আজকের active অর্ডার (cluster discount)
  const activeCount = await Order.countDocuments({
    buildingName,
    areaId: area._id,
    status: { $in: ACTIVE_STATUSES },
    createdAt: { $gte: startOfToday() },
  });
  const quote = await quoteDelivery(
    { areaId: kitchen.areaId?.toString(), location: kitchen.kitchenLocation },
    { areaId: area.id, location: addr.location },
    activeCount + 1
  );
  if (!quote.allowed) {
    throw new Error(`এই কিচেন আপনার ঠিকানা থেকে প্রায় ${quote.distanceKm} কিমি দূরে — সর্বোচ্চ ${quote.maxKm} কিমির মধ্যে অর্ডার করা যায়`);
  }
  const deliveryCharge = quote.charge;

  const order = new Order({
    user: userId,
    kitchen: kitchen._id,
    items,
    totalAmount,
    deliveryCharge,
    uniqueCode: await generateFreeUniqueCode(),
    buildingName,
    deliveryAddress: `${buildingName}, ${addressLine}, ${area.name}, ${area.thana.name}, ${area.city.name}-${area.zipCode}`,
    customerPhone: addr.phone?.trim() || user.phone,
    area: area.name,
    thana: area.thana.name,
    city: area.city.name,
    zipCode: area.zipCode,
    areaId: area._id,
    kitchenAreaId: kitchen.areaId,
    deliveryLocation: addr.location ?? undefined,
    distanceKm: quote.distanceKm ?? undefined,
    distanceSource: quote.distanceSource ?? undefined,
    paymentMethod: data.paymentMethod === 'sslcommerz' ? 'sslcommerz' : 'cash',
    statusHistory: [],
  });
  pushStatus(order, 'pending', 'user', userId);
  await order.save();

  // নতুন ঠিকানা সেভ করতে চাইলে
  if (!data.addressId && data.saveAddress && user.addresses.length < 10) {
    user.addresses.push({
      label: data.address?.label?.trim() || 'বাসা',
      areaId: area._id as mongoose.Types.ObjectId,
      buildingName,
      addressLine,
      phone: addr.phone?.trim() || user.phone,
      isDefault: user.addresses.length === 0,
      location: addr.location ?? undefined,
    });
    if (user.addresses.length === 1) { user.areaId = area._id as mongoose.Types.ObjectId; user.area = area.name; }
    await user.save();
  }

  emit(`kitchen:new-order:${kitchen._id}`, order);
  notifyNewOrder(order).catch(console.error);
  return order;
};

// ─── স্ট্যাটাস আপডেট (কিচেন / ডেলিভারি বয়) ───────────────
// কে কোন স্ট্যাটাস থেকে কোনটাতে নিতে পারবে
const KITCHEN_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['accepted', 'rejected'],
  accepted: ['ready'],
};
const SELF_DELIVERY_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  ready: ['picked_up'],
  picked_up: ['delivered'],
};
const DELIVERY_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  ready: ['picked_up'],
  picked_up: ['delivered'],
};

const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_GAP_MS = 60 * 1000;

// ৪ অঙ্কের ডেলিভারি কোড তৈরি করে সেভ ও গ্রাহককে ইমেইল (save কলারের দায়িত্ব নয় — এখানেই হয়)
const issueDeliveryOtp = async (orderId: unknown) => {
  const otp = String(crypto.randomInt(1000, 10000));
  const order = await Order.findByIdAndUpdate(
    orderId,
    { deliveryOtp: otp, deliveryOtpSentAt: new Date(), deliveryOtpAttempts: 0 },
    { new: true }
  );
  if (order) notifyDeliveryOtp(order, otp).catch(console.error);
};

// ডেলিভারি চার্জ থেকে কমিশন — ডেলিভারি বয় বা কিচেন যে-ই দিক, সবসময় একই হার
const deliveryEarning = async (deliveryCharge: number) => {
  const config = await GlobalConfig.findOne();
  return Math.round((deliveryCharge * (100 - (config?.deliveryCommissionRate ?? 8))) / 100);
};

// ডেলিভার্ড হলে টাকার ভাগ হিসাব করে অর্ডারে রেখে দেওয়া (পরে কমিশন রেট বদলালেও পুরনো হিসাব বদলায় না)
export const computeSettlement = async (order: { totalAmount: number; deliveryCharge: number; deliveryMode?: string }) => {
  const config = await GlobalConfig.findOne();
  const foodCommission = Math.round((order.totalAmount * (config?.commissionRate ?? 10)) / 100);
  const deliveryCommission = Math.round((order.deliveryCharge * (config?.deliveryCommissionRate ?? 8)) / 100);
  const delivererEarning = order.deliveryCharge - deliveryCommission;
  const selfDelivery = order.deliveryMode === 'self';
  return {
    foodCommission,
    deliveryCommission,
    kitchenEarning: order.totalAmount - foodCommission + (selfDelivery ? delivererEarning : 0),
    delivererEarning: selfDelivery ? 0 : delivererEarning,
    platformEarning: foodCommission + deliveryCommission,
  };
};

export const transitionOrder = async (
  actor: { userId: string; role: 'kitchen' | 'delivery' },
  orderId: string,
  next: OrderStatus,
  note?: string,
  otp?: string
) => {
  const order = await Order.findById(orderId).select('+deliveryOtp +deliveryOtpAttempts');
  if (!order) throw new Error('অর্ডার পাওয়া যায়নি');

  let allowed: OrderStatus[] = [];
  if (actor.role === 'kitchen') {
    if (order.kitchen.toString() !== actor.userId) throw new Error('অর্ডার পাওয়া যায়নি');
    allowed = [
      ...(KITCHEN_TRANSITIONS[order.status] ?? []),
      ...(order.deliveryMode === 'self' ? SELF_DELIVERY_TRANSITIONS[order.status] ?? [] : []),
    ];
  } else {
    if (order.deliveryBoy?.toString() !== actor.userId) throw new Error('এই অর্ডারটি আপনাকে দেওয়া হয়নি');
    allowed = DELIVERY_TRANSITIONS[order.status] ?? [];
  }
  if (!allowed.includes(next)) throw new Error('এই অবস্থায় এই স্ট্যাটাস দেওয়া যাবে না');
  if (next === 'picked_up' && !order.deliveryMode) throw new Error('আগে ডেলিভারি পদ্ধতি নির্ধারণ করুন');

  // ডেলিভার্ড করতে গ্রাহকের ডেলিভারি কোড লাগবে
  if (next === 'delivered') {
    if ((order.deliveryOtpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      throw new Error('অনেকবার ভুল কোড দেওয়া হয়েছে — নতুন কোড পাঠান অথবা গ্রাহককে অ্যাপ থেকে নিশ্চিত করতে বলুন');
    }
    if (!otp?.trim()) throw new Error('গ্রাহকের কাছ থেকে ৪ অঙ্কের ডেলিভারি কোড নিয়ে দিন');
    if (!order.deliveryOtp || otp.trim() !== order.deliveryOtp) {
      order.deliveryOtpAttempts = (order.deliveryOtpAttempts ?? 0) + 1;
      await order.save();
      const left = MAX_OTP_ATTEMPTS - order.deliveryOtpAttempts;
      throw new Error(`ডেলিভারি কোড ভুল${left > 0 ? ` — আর ${left} বার চেষ্টা করা যাবে` : ''}`);
    }
    order.deliveryOtp = undefined;
    order.deliveredConfirmedBy = 'otp';
    order.settlement = await computeSettlement(order);
  }

  pushStatus(order, next, actor.role, actor.userId, next === 'delivered' ? note ?? 'গ্রাহকের ডেলিভারি কোড দিয়ে নিশ্চিত' : note);
  await order.save();
  if (next === 'picked_up') await issueDeliveryOtp(order._id);

  // ডেলিভারি বয়ের আয়ের হিসাব — পিকআপের সময় ফ্রিজ করা
  if (order.deliveryMode === 'delivery_boy' && order.deliveryBoy) {
    if (next === 'picked_up') {
      await DeliveryTask.findOneAndUpdate(
        { deliveryBoy: order.deliveryBoy, order: order._id },
        { $setOnInsert: { earning: await deliveryEarning(order.deliveryCharge) }, pickedUpAt: new Date() },
        { upsert: true }
      );
    } else if (next === 'delivered') {
      await DeliveryTask.findOneAndUpdate({ deliveryBoy: order.deliveryBoy, order: order._id }, { deliveredAt: new Date() });
    }
  }

  emitUpdate(order);
  notifyOrderStatus(order, actor.role).catch(console.error);
  return order;
};

// ─── গ্রাহক নিজে "খাবার পেয়েছি" নিশ্চিত করলে ───────────────
export const confirmDeliveryByCustomer = async (userId: string, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new Error('অর্ডার পাওয়া যায়নি');
  if (order.status !== 'picked_up') throw new Error('অর্ডারটি এখনো ডেলিভারির পথে নয়');
  order.deliveryOtp = undefined;
  order.deliveredConfirmedBy = 'customer';
  order.settlement = await computeSettlement(order);
  pushStatus(order, 'delivered', 'user', userId, 'গ্রাহক নিজে খাবার পাওয়া নিশ্চিত করেছেন');
  await order.save();
  if (order.deliveryMode === 'delivery_boy' && order.deliveryBoy) {
    await DeliveryTask.findOneAndUpdate({ deliveryBoy: order.deliveryBoy, order: order._id }, { deliveredAt: new Date() });
  }
  emitUpdate(order);
  notifyOrderStatus(order, 'user').catch(console.error);
  return order;
};

// ─── ডেলিভারি কোড আবার পাঠানো (ডেলিভারিকারী) ─────────────
export const resendDeliveryOtp = async (actor: { userId: string; role: 'kitchen' | 'delivery' }, orderId: string) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('অর্ডার পাওয়া যায়নি');
  const isDeliverer = actor.role === 'delivery'
    ? order.deliveryBoy?.toString() === actor.userId
    : order.kitchen.toString() === actor.userId && order.deliveryMode === 'self';
  if (!isDeliverer) throw new Error('শুধু ডেলিভারিকারী কোড পাঠাতে পারেন');
  if (order.status !== 'picked_up') throw new Error('অর্ডারটি ডেলিভারির পথে নয়');
  if (order.deliveryOtpSentAt && Date.now() - order.deliveryOtpSentAt.getTime() < OTP_RESEND_GAP_MS) {
    throw new Error('এক মিনিট পর আবার চেষ্টা করুন');
  }
  await issueDeliveryOtp(order._id);
  return { sent: true };
};

// ─── ডেলিভারি নির্ধারণ: কিচেন নিজে, অথবা নির্দিষ্ট ডেলিভারি বয় ─
export const assignDelivery = async (
  kitchenId: string,
  orderId: string,
  mode: DeliveryMode,
  deliveryBoyId?: string
) => {
  const order = await Order.findOne({ _id: orderId, kitchen: kitchenId });
  if (!order) throw new Error('অর্ডার পাওয়া যায়নি');
  if (!['accepted', 'ready'].includes(order.status)) throw new Error('শুধু গ্রহণকৃত/প্রস্তুত অর্ডারে ডেলিভারি নির্ধারণ করা যায়');

  if (mode === 'self') {
    order.deliveryMode = 'self';
    order.deliveryBoy = undefined;
    order.statusHistory.push({ status: order.status, at: new Date(), role: 'kitchen', by: new mongoose.Types.ObjectId(kitchenId), note: 'কিচেন নিজে ডেলিভারি দেবে' });
    await order.save();
    emitUpdate(order);
    return order;
  }

  const deliveryBoy = await User.findOne({ _id: deliveryBoyId, role: 'delivery', isApproved: true, isActive: true });
  if (!deliveryBoy) throw new Error('ডেলিভারি বয় পাওয়া যায়নি');
  if (deliveryBoy.isAvailable === false) throw new Error(`${deliveryBoy.name} এখন অফ আছেন — অন্য কাউকে বেছে নিন`);

  order.deliveryMode = 'delivery_boy';
  order.deliveryBoy = deliveryBoy._id as mongoose.Types.ObjectId;
  order.statusHistory.push({
    status: order.status,
    at: new Date(),
    role: 'kitchen',
    by: new mongoose.Types.ObjectId(kitchenId),
    note: `ডেলিভারি বয় নির্ধারণ: ${deliveryBoy.name}`,
  });
  await order.save();

  emitUpdate(order);
  notifyDeliveryAssigned(order).catch(console.error);
  return order;
};

// ─── Cancel Order ────────────────────────────────────────
export const cancelOrder = async (userId: string, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new Error('অর্ডার পাওয়া যায়নি');

  if (!['pending', 'accepted'].includes(order.status)) {
    throw new Error('এই অবস্থায় ক্যান্সেল করা সম্ভব নয়');
  }

  if (order.status === 'pending') {
    // কিচেন accept করার আগে → সাথে সাথে refund
    pushStatus(order, 'cancelled', 'user', userId);
    await order.save();
    emitUpdate(order);
    notifyOrderStatus(order, 'user').catch(console.error);
    // refund logic → পরে SSLCommerz refund API যোগ করা হবে
    return { order, refunded: true };
  }

  // কিচেন accept করার পরে → resell এ যাবে
  pushStatus(order, 'resell', 'user', userId);
  order.isResell = true;
  order.originalUser = order.user;
  order.resellPrice = Math.round(order.totalAmount * 0.85); // ১৫% ছাড়ে resell
  await order.save();

  emit('resell:new', order); // সবাইকে নোটিফাই করো
  notifyOrderStatus(order, 'user').catch(console.error);
  return { order, refunded: false, message: 'অর্ডারটি রিসেল তালিকায় গেছে। কেউ কিনলে রিফান্ড পাবেন।' };
};

// ─── Buy Resell Order ────────────────────────────────────
export const buyResellOrder = async (buyerId: string, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, status: 'resell' });
  if (!order) throw new Error('রিসেল অর্ডার পাওয়া যায়নি');
  if (order.originalUser?.toString() === buyerId) throw new Error('নিজের অর্ডার নিজে কেনা যাবে না');

  pushStatus(order, 'resold', 'user', buyerId);
  order.resellBuyer = new mongoose.Types.ObjectId(buyerId);
  await order.save();

  // মূল ব্যবহারকারীকে refund দাও
  // (SSLCommerz refund বা wallet credit — পরে যোগ হবে)
  emit(`user:refund:${order.originalUser}`, { orderId: order._id, amount: order.totalAmount });
  return order;
};

// ─── Get Resell Orders (Random Kitchen Section) ──────────
export const getResellOrders = (areaId: string) =>
  Order.find({ status: 'resell', areaId })
    .populate('kitchen', 'name kitchenName')
    .populate('items.foodItem')
    .sort({ createdAt: -1 });

// ─── Order History ────────────────────────────────────────
export const getUserOrders = (userId: string) =>
  Order.find({ user: userId })
    .select('+deliveryOtp')
    .populate('kitchen', 'name kitchenName phone area')
    .populate('deliveryBoy', 'name phone isAvailable')
    .populate('items.foodItem')
    .sort({ createdAt: -1 });

export const getKitchenOrders = (kitchenId: string, status?: string) => {
  const query: Record<string, unknown> = { kitchen: kitchenId };
  if (status) query.status = status;
  return Order.find(query)
    .populate('user', 'name phone email')
    .populate('deliveryBoy', 'name phone isAvailable')
    .populate('items.foodItem')
    .sort({ createdAt: -1 });
};
