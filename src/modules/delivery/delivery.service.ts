import { DeliveryTask } from './delivery.model';
import { Order } from '../order/order.model';
import { GlobalConfig } from '../admin/admin.model';
import { io } from '../../index';

// ─── Available Pickups (ready orders in delivery boy's area) ─
export const getAvailablePickups = async (area: string) =>
  Order.find({ status: 'ready', area })
    .populate('kitchen user items.foodItem')
    .sort({ createdAt: 1 });

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
