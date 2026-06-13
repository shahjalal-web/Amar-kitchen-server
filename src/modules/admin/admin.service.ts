import { FoodItem, Package, GlobalConfig, PackageTier, IFoodItem } from './admin.model';
import { User } from '../auth/auth.model';
import { Order } from '../order/order.model';
import { Withdrawal } from '../kitchen/kitchen.model';

type FoodCategory = IFoodItem['category'];

// ─── Food Library ─────────────────────────────────────────
export const createFoodItem = (data: {
  name: string;
  image: string;
  category: FoodCategory;
}) => FoodItem.create(data);

export const getAllFoodItems = () => FoodItem.find().sort({ category: 1, name: 1 });

export const updateFoodItem = (
  id: string,
  data: Partial<{ name: string; image: string; category: FoodCategory; isActive: boolean }>
) => FoodItem.findByIdAndUpdate(id, data, { new: true });

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
export const getPendingApprovals = () =>
  User.find({ isApproved: false, isActive: true, role: { $in: ['kitchen', 'delivery'] } }).select('-firebaseUid');

export const approveUser = (userId: string) =>
  User.findByIdAndUpdate(userId, { isApproved: true }, { new: true });

export const rejectUser = (userId: string) =>
  User.findByIdAndUpdate(userId, { isActive: false }, { new: true });

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
  return withdrawal;
};
