import { Subscription } from './subscription.model';
import { Order } from '../order/order.model';

const todayDate = () => new Date().toISOString().split('T')[0];

const tomorrowDate = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

// ─── Subscribe ────────────────────────────────────────────
export const subscribe = async (
  userId: string,
  data: {
    kitchenId: string;
    packageId?: string;
    customItems?: { foodItem: string; quantity: number; price: number }[];
    totalDailyAmount: number;
  }
) => {
  const existing = await Subscription.findOne({
    user: userId,
    kitchen: data.kitchenId,
    status: { $in: ['active', 'cancel_pending'] },
  });
  if (existing) throw new Error('আপনি এই কিচেনে ইতিমধ্যে সাবস্ক্রাইব করা আছেন');

  return Subscription.create({
    user: userId,
    kitchen: data.kitchenId,
    package: data.packageId,
    customItems: data.customItems || [],
    totalDailyAmount: data.totalDailyAmount,
    startDate: todayDate(),
  });
};

// ─── Request Cancellation ────────────────────────────────
export const requestCancellation = async (userId: string, subscriptionId: string) => {
  const sub = await Subscription.findOne({ _id: subscriptionId, user: userId, status: 'active' });
  if (!sub) throw new Error('সাবস্ক্রিপশন পাওয়া যায়নি');

  sub.status = 'cancel_pending';
  sub.cancelRequestedAt = new Date();
  sub.cancelEffectiveDate = tomorrowDate(); // পরদিন থেকে কার্যকর

  await sub.save();

  // আজকের যে খাবার নেওয়া হয়নি সেটি resell এ পাঠাও
  const todayOrders = await Order.find({
    user: userId,
    status: { $in: ['pending', 'accepted'] },
    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
  });

  for (const order of todayOrders) {
    if (order.status === 'pending') {
      order.status = 'cancelled';
    } else {
      // accepted → resell
      order.status = 'resell';
      order.isResell = true;
      order.originalUser = order.user;
      order.resellPrice = Math.round(order.totalAmount * 0.85);
    }
    await order.save();
  }

  return sub;
};

// ─── Cron Job: রাত ১২টায় pending cancellation activate করো ─
export const processCancelledSubscriptions = async (): Promise<void> => {
  const today = todayDate();
  const subs = await Subscription.find({
    status: 'cancel_pending',
    cancelEffectiveDate: { $lte: today },
  });

  for (const sub of subs) {
    sub.status = 'cancelled';
    sub.endDate = today;
    await sub.save();
  }

  console.log(`Cron: ${subs.length}টি সাবস্ক্রিপশন বাতিল করা হয়েছে`);
};

// ─── Get User Subscriptions ───────────────────────────────
export const getUserSubscriptions = (userId: string) =>
  Subscription.find({ user: userId })
    .populate('kitchen package customItems.foodItem')
    .sort({ createdAt: -1 });
