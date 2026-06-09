import { FoodItem, Package, GlobalConfig, PackageTier, IFoodItem } from './admin.model';
import { User } from '../auth/auth.model';

type FoodCategory = IFoodItem['category'];

// ─── Food Library ─────────────────────────────────────────
export const createFoodItem = (data: {
  name: string;
  image: string;
  category: FoodCategory;
}) => FoodItem.create(data);

export const getAllFoodItems = () => FoodItem.find({ isActive: true });

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
  User.find({ isApproved: false, role: { $in: ['kitchen', 'delivery'] } }).select('-firebaseUid');

export const approveUser = (userId: string) =>
  User.findByIdAndUpdate(userId, { isApproved: true }, { new: true });

export const rejectUser = (userId: string) =>
  User.findByIdAndUpdate(userId, { isActive: false }, { new: true });

export const setKitchenOrderLimit = (kitchenId: string, limit: number) =>
  User.findByIdAndUpdate(kitchenId, { orderLimit: limit }, { new: true });

// ─── Financial Overview ───────────────────────────────────
export const getFinancialSummary = async () => {
  return { message: 'অর্ডার মডিউল তৈরির পর সম্পূর্ণ হবে' };
};
