import { DailyMenu, Withdrawal } from './kitchen.model';
import { User } from '../auth/auth.model';
import { io } from '../../index';
import { GlobalConfig } from '../admin/admin.model';

const todayDate = () => new Date().toISOString().split('T')[0];

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

// কাছের কিচেনের আজকের মেনু (ব্যবহারকারীর এলাকা অনুযায়ী)
export const getNearbyKitchenMenus = async (area: string) => {
  const kitchens = await User.find({ role: 'kitchen', isApproved: true, area });
  const kitchenIds = kitchens.map((k) => k._id);
  return DailyMenu.find({
    kitchen: { $in: kitchenIds },
    date: todayDate(),
    isPublished: true,
  }).populate('kitchen items.foodItem freeItems');
};

// ─── Ready for Pickup ────────────────────────────────────
export const markReadyForPickup = async (kitchenId: string) => {
  const menu = await DailyMenu.findOneAndUpdate(
    { kitchen: kitchenId, date: todayDate() },
    { isReadyForPickup: true },
    { new: true }
  );
  // delivery boy কে রিয়েল-টাইম নোটিফিকেশন
  io.emit('kitchen:ready', { kitchenId, date: todayDate() });
  return menu;
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
export const calcDeliveryCharge = async (activeOrdersInBuilding: number): Promise<number> => {
  const config = await GlobalConfig.findOne();
  const baseFee = config?.deliveryBaseFee ?? 50;
  const discountPerOrder = config?.deliveryDiscountPercentPerOrder ?? 10;
  const maxDiscount = config?.maxDeliveryDiscount ?? 70;

  const discountPct = Math.min(
    (activeOrdersInBuilding - 1) * discountPerOrder,
    maxDiscount
  );
  return Math.round(baseFee * (1 - discountPct / 100));
};
