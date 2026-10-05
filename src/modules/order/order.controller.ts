import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as orderService from './order.service';
import { User } from '../auth/auth.model';

export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await orderService.placeOrder(req.user!.userId, req.body);
    sendSuccess(res, order, 'অর্ডার দেওয়া হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const handleOrderResponse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { action } = req.body;
    const next = action === 'accept' ? 'accepted' : 'rejected';
    const order = await orderService.transitionOrder({ userId: req.user!.userId, role: 'kitchen' }, String(req.params.id), next);
    const msg = action === 'accept' ? 'অর্ডার গ্রহণ করা হয়েছে' : 'অর্ডার প্রত্যাখ্যান করা হয়েছে';
    sendSuccess(res, order, msg);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

// কিচেন বা নির্ধারিত ডেলিভারি বয় স্ট্যাটাস আপডেট করে
export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user!.role as 'kitchen' | 'delivery';
    const order = await orderService.transitionOrder(
      { userId: req.user!.userId, role }, String(req.params.id), req.body.status, req.body.note, req.body.otp
    );
    sendSuccess(res, order, 'স্ট্যাটাস আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const assignDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { mode, deliveryBoyId } = req.body;
    if (mode !== 'self' && mode !== 'delivery_boy') { sendError(res, 'ডেলিভারি পদ্ধতি নির্বাচন করুন', 400); return; }
    const order = await orderService.assignDelivery(req.user!.userId, String(req.params.id), mode, deliveryBoyId);
    sendSuccess(res, order, mode === 'self' ? 'আপনি নিজে ডেলিভারি দেবেন' : 'ডেলিভারি বয় নির্ধারণ করা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const cancelUserOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await orderService.cancelOrder(req.user!.userId, String(req.params.id));
    sendSuccess(res, result, result.refunded ? 'ক্যান্সেল ও রিফান্ড হয়েছে' : result.message);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const purchaseResell = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await orderService.buyResellOrder(req.user!.userId, String(req.params.id));
    sendSuccess(res, order, 'রিসেল অর্ডার কেনা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const listResellOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let areaId = req.query.areaId as string | undefined;
    if (!areaId) {
      const me = await User.findById(req.user!.userId).select('areaId');
      areaId = me?.areaId?.toString();
    }
    if (!areaId) { sendSuccess(res, []); return; }
    const orders = await orderService.getResellOrders(areaId);
    sendSuccess(res, orders);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const myOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orders = await orderService.getUserOrders(req.user!.userId);
    sendSuccess(res, orders);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const kitchenOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orders = await orderService.getKitchenOrders(req.user!.userId, req.query.status as string);
    sendSuccess(res, orders);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

// গ্রাহক: "খাবার পেয়েছি"
export const confirmDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await orderService.confirmDeliveryByCustomer(req.user!.userId, String(req.params.id));
    sendSuccess(res, order, 'ধন্যবাদ! ডেলিভারি নিশ্চিত হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

// ডেলিভারিকারী: গ্রাহককে কোড আবার পাঠাও
export const resendOtp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user!.role as 'kitchen' | 'delivery';
    sendSuccess(res, await orderService.resendDeliveryOtp({ userId: req.user!.userId, role }, String(req.params.id)), 'গ্রাহককে নতুন কোড পাঠানো হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};
