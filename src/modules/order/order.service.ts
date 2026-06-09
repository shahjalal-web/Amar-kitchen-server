import crypto from 'crypto';
import { Order } from './order.model';
import { User } from '../auth/auth.model';
import { calcDeliveryCharge } from '../kitchen/kitchen.service';
import { io } from '../../index';

const generateUniqueCode = (): string =>
  crypto.randomBytes(4).toString('hex').toUpperCase();

// ─── Place Order ─────────────────────────────────────────
export const placeOrder = async (userId: string, data: {
  kitchenId: string;
  items: { foodItem: string; quantity: number; price: number }[];
  totalAmount: number;
  paymentMethod: 'sslcommerz' | 'cash';
}) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('ব্যবহারকারী পাওয়া যায়নি');

  // একই বিল্ডিংয়ে আজকের active অর্ডার গণনা করো (cluster discount)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeCount = await Order.countDocuments({
    buildingName: user.buildingName,
    area: user.area,
    status: { $in: ['pending', 'accepted', 'ready', 'picked_up'] },
    createdAt: { $gte: today },
  });

  const deliveryCharge = await calcDeliveryCharge(activeCount + 1);
  const uniqueCode = generateUniqueCode();

  const order = await Order.create({
    user: userId,
    kitchen: data.kitchenId,
    items: data.items,
    totalAmount: data.totalAmount,
    deliveryCharge,
    uniqueCode,
    buildingName: user.buildingName || '',
    deliveryAddress: `${user.buildingName}, ${user.buildingAddress}`,
    area: user.area || '',
    paymentMethod: data.paymentMethod,
  });

  // কিচেনকে রিয়েল-টাইম নোটিফাই করো
  io.emit(`kitchen:new-order:${data.kitchenId}`, order);
  return order;
};

// ─── Kitchen Accept / Reject ─────────────────────────────
export const respondToOrder = async (
  kitchenId: string,
  orderId: string,
  action: 'accept' | 'reject'
) => {
  const order = await Order.findOne({ _id: orderId, kitchen: kitchenId, status: 'pending' });
  if (!order) throw new Error('অর্ডার পাওয়া যায়নি');

  order.status = action === 'accept' ? 'accepted' : 'rejected';
  await order.save();

  io.emit(`user:order-update:${order.user}`, { orderId: order._id, status: order.status });
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
    order.status = 'cancelled';
    await order.save();
    // refund logic → পরে SSLCommerz refund API যোগ করা হবে
    return { order, refunded: true };
  }

  // কিচেন accept করার পরে → resell এ যাবে
  order.status = 'resell';
  order.isResell = true;
  order.originalUser = order.user;
  order.resellPrice = Math.round(order.totalAmount * 0.85); // ১৫% ছাড়ে resell
  await order.save();

  io.emit('resell:new', order); // সবাইকে নোটিফাই করো
  return { order, refunded: false, message: 'অর্ডারটি রিসেল তালিকায় গেছে। কেউ কিনলে রিফান্ড পাবেন।' };
};

// ─── Buy Resell Order ────────────────────────────────────
export const buyResellOrder = async (buyerId: string, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, status: 'resell' });
  if (!order) throw new Error('রিসেল অর্ডার পাওয়া যায়নি');

  order.status = 'resold';
  order.resellBuyer = new (require('mongoose').Types.ObjectId)(buyerId);
  await order.save();

  // মূল ব্যবহারকারীকে refund দাও
  // (SSLCommerz refund বা wallet credit — পরে যোগ হবে)
  io.emit(`user:refund:${order.originalUser}`, { orderId: order._id, amount: order.totalAmount });
  return order;
};

// ─── Get Resell Orders (Random Kitchen Section) ──────────
export const getResellOrders = (area: string) =>
  Order.find({ status: 'resell', area })
    .populate('kitchen items.foodItem')
    .sort({ createdAt: -1 });

// ─── Order History ────────────────────────────────────────
export const getUserOrders = (userId: string) =>
  Order.find({ user: userId }).populate('kitchen items.foodItem').sort({ createdAt: -1 });

export const getKitchenOrders = (kitchenId: string, status?: string) => {
  const query: Record<string, unknown> = { kitchen: kitchenId };
  if (status) query.status = status;
  return Order.find(query).populate('user items.foodItem').sort({ createdAt: -1 });
};
