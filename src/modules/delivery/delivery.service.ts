import mongoose from 'mongoose';
import { DeliveryTask } from './delivery.model';
import { Order } from '../order/order.model';
import { User } from '../auth/auth.model';
import { Area } from '../location/location.model';
import { transitionOrder } from '../order/order.service';
import { notifyDeliveryAssigned } from '../../utils/notify';

const ORDER_POPULATE = [
  { path: 'kitchen', select: 'name kitchenName phone area buildingAddress' },
  { path: 'user', select: 'name phone' },
  { path: 'items.foodItem', select: 'name' },
];
// নিজের অ্যাসাইন করা ডেলিভারিতে পিকআপের জন্য কিচেনের ম্যাপ পিনও (খোলা পিকআপ তালিকায় নয়)
const MY_ORDER_POPULATE = [{ ...ORDER_POPULATE[0], select: `${ORDER_POPULATE[0].select} +kitchenLocation` }, ...ORDER_POPULATE.slice(1)];

// ─── ডেলিভারি বয়ের সিলেক্ট করা এরিয়া সেট করো ────────────
export const setDeliveryAreas = async (deliveryBoyId: string, areaIds: string[]) => {
  const valid = await Area.find({ _id: { $in: areaIds }, isActive: true }).select('_id');
  return User.findByIdAndUpdate(
    deliveryBoyId,
    { deliveryAreaIds: valid.map((a) => a._id) },
    { new: true }
  ).select('-firebaseUid');
};

// ─── অ্যাক্টিভ/অফ ─────────────────────────────────────────
export const setAvailability = (deliveryBoyId: string, isAvailable: boolean) =>
  User.findByIdAndUpdate(deliveryBoyId, { isAvailable }, { new: true }).select('-firebaseUid');

// ─── নিজের এলাকার এখনো-নির্ধারিত-না-হওয়া অর্ডার (কিচেন বা গ্রাহকের এলাকা মিললে) ─
// অফ থাকলে নতুন অর্ডার দেখানো হয় না
export const getAvailablePickups = async (deliveryBoyId: string) => {
  const deliveryBoy = await User.findById(deliveryBoyId);
  if (!deliveryBoy) throw new Error('ব্যবহারকারী পাওয়া যায়নি');
  if (deliveryBoy.isAvailable === false || !deliveryBoy.deliveryAreaIds?.length) return [];

  return Order.find({
    status: { $in: ['accepted', 'ready'] },
    deliveryBoy: { $exists: false },
    deliveryMode: { $ne: 'self' },
    $or: [
      { kitchenAreaId: { $in: deliveryBoy.deliveryAreaIds } },
      { areaId: { $in: deliveryBoy.deliveryAreaIds } },
    ],
  }).populate(ORDER_POPULATE).sort({ createdAt: 1 });
};

// ─── নিজে অর্ডার নেওয়া (claim) ─────────────────────────────
export const claimOrder = async (deliveryBoyId: string, orderId: string) => {
  const deliveryBoy = await User.findById(deliveryBoyId);
  if (deliveryBoy?.isAvailable === false) throw new Error('আপনি এখন অফ আছেন — অ্যাক্টিভ করে তারপর ডেলিভারি নিন');
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: ['accepted', 'ready'] },
      deliveryBoy: { $exists: false },
      deliveryMode: { $ne: 'self' },
      $or: [
        { kitchenAreaId: { $in: deliveryBoy?.deliveryAreaIds ?? [] } },
        { areaId: { $in: deliveryBoy?.deliveryAreaIds ?? [] } },
      ],
    },
    {
      deliveryBoy: new mongoose.Types.ObjectId(deliveryBoyId),
      deliveryMode: 'delivery_boy',
      $push: { statusHistory: { status: 'accepted', at: new Date(), role: 'delivery', by: deliveryBoyId, note: `ডেলিভারি বয় দায়িত্ব নিয়েছেন: ${deliveryBoy?.name ?? ''}` } },
    },
    { new: true }
  );
  if (!order) throw new Error('অর্ডারটি আর পাওয়া যাচ্ছে না — হয়তো অন্য কেউ নিয়েছেন');
  // statusHistory-তে ভুল status এড়াতে বর্তমান status বসাও
  order.statusHistory[order.statusHistory.length - 1].status = order.status;
  await order.save();
  notifyDeliveryAssigned(order).catch(console.error);
  return order;
};

// ─── আমার নির্ধারিত ডেলিভারি (শেষ হয়নি এমন) ───────────────
export const getMyActiveDeliveries = async (deliveryBoyId: string) =>
  Order.find({ deliveryBoy: deliveryBoyId, status: { $in: ['accepted', 'ready', 'picked_up'] } })
    .populate(MY_ORDER_POPULATE)
    .sort({ updatedAt: -1 });

// ─── কোড স্ক্যান: ready → picked_up → delivered ──────────
export const scanCode = async (deliveryBoyId: string, uniqueCode: string, otp?: string) => {
  const order = await Order.findOne({ uniqueCode: String(uniqueCode || '').trim().toUpperCase() });
  if (!order) throw new Error('কোড টি সঠিক নয়');
  if (order.deliveryBoy?.toString() !== deliveryBoyId) throw new Error('এই অর্ডারটি আপনাকে দেওয়া হয়নি');

  if (order.status === 'ready') {
    const updated = await transitionOrder({ userId: deliveryBoyId, role: 'delivery' }, order.id, 'picked_up');
    return { order: updated, message: 'পিকআপ নিশ্চিত হয়েছে (Kitchen → Delivery Boy)' };
  }
  if (order.status === 'picked_up') {
    const updated = await transitionOrder({ userId: deliveryBoyId, role: 'delivery' }, order.id, 'delivered', undefined, otp);
    return { order: updated, message: 'ডেলিভারি সম্পন্ন হয়েছে (Delivery Boy → User)' };
  }
  throw new Error('এই কোড এখন স্ক্যান করা যাচ্ছে না (কিচেন এখনো রান্না শেষ করেনি)');
};

// ─── Earnings ─────────────────────────────────────────────
export const getDailyEarnings = async (deliveryBoyId: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tasks = await DeliveryTask.find({
    deliveryBoy: deliveryBoyId,
    createdAt: { $gte: today },
  }).populate('order');

  const totalEarning = tasks.reduce((sum, t) => sum + t.earning, 0);
  return { tasks, totalEarning, deliveryCount: tasks.length };
};
