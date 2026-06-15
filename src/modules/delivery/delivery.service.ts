import { DeliveryTask } from './delivery.model';
import { Order } from '../order/order.model';
import { GlobalConfig } from '../admin/admin.model';
import { User } from '../auth/auth.model';
import { io } from '../../index';

const EARTH_RADIUS_KM = 6371;
const DELIVERY_RADIUS_KM = 5;

// ─── ডেলিভারি বয়ের সিলেক্ট করা এরিয়া সেট করো ────────────
export const setDeliveryAreas = (deliveryBoyId: string, areaIds: string[]) =>
  User.findByIdAndUpdate(deliveryBoyId, { deliveryAreaIds: areaIds }, { new: true }).select('-firebaseUid');

// ─── Available Pickups (ready orders in delivery boy's area/location) ─
export const getAvailablePickups = async (deliveryBoyId: string) => {
  const deliveryBoy = await User.findById(deliveryBoyId);
  if (!deliveryBoy) throw new Error('ব্যবহারকারী পাওয়া যায়নি');

  const orConditions: Record<string, unknown>[] = [];

  if (deliveryBoy.deliveryAreaIds?.length) {
    orConditions.push({ areaId: { $in: deliveryBoy.deliveryAreaIds } });
  }

  if (deliveryBoy.location?.coordinates) {
    orConditions.push({
      deliveryLocation: {
        $geoWithin: { $centerSphere: [deliveryBoy.location.coordinates, DELIVERY_RADIUS_KM / EARTH_RADIUS_KM] },
      },
    });
  }

  if (deliveryBoy.area) {
    orConditions.push({ area: deliveryBoy.area });
  }

  if (orConditions.length === 0) return [];

  return Order.find({ status: 'ready', $or: orConditions })
    .populate('kitchen user items.foodItem')
    .sort({ createdAt: 1 });
};

// ─── My Active Deliveries (picked up, not yet delivered) ────
export const getMyActiveDeliveries = async (deliveryBoyId: string) =>
  Order.find({ deliveryBoy: deliveryBoyId, status: 'picked_up' })
    .populate('kitchen user items.foodItem')
    .sort({ updatedAt: -1 });

// ─── Scan Unique Code → Ownership Transfer ───────────────
export const scanCode = async (deliveryBoyId: string, uniqueCode: string) => {
  const order = await Order.findOne({ uniqueCode });
  if (!order) throw new Error('কোড টি সঠিক নয়');

  const config = await GlobalConfig.findOne();
  const earning = Math.round((order.deliveryCharge * (100 - (config?.commissionRate ?? 10))) / 100);

  if (order.status === 'ready') {
    // Kitchen → Delivery Boy
    order.status = 'picked_up';
    order.deliveryBoy = new (require('mongoose').Types.ObjectId)(deliveryBoyId);
    await order.save();

    await DeliveryTask.create({
      deliveryBoy: deliveryBoyId,
      order: order._id,
      earning,
    });

    io.emit(`user:order-update:${order.user}`, { orderId: order._id, status: 'picked_up' });
    return { order, message: 'পিকআপ নিশ্চিত হয়েছে (Kitchen → Delivery Boy)' };
  }

  if (order.status === 'picked_up' && order.deliveryBoy?.toString() === deliveryBoyId) {
    // Delivery Boy → User
    order.status = 'delivered';
    order.deliveryBoy = new (require('mongoose').Types.ObjectId)(deliveryBoyId);
    await order.save();

    await DeliveryTask.findOneAndUpdate(
      { deliveryBoy: deliveryBoyId, order: order._id },
      { deliveredAt: new Date() }
    );

    io.emit(`user:order-update:${order.user}`, { orderId: order._id, status: 'delivered' });
    return { order, message: 'ডেলিভারি সম্পন্ন হয়েছে (Delivery Boy → User)' };
  }

  throw new Error('এই কোড এখন স্ক্যান করা যাচ্ছে না');
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
