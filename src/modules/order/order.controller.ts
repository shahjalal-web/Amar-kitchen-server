import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as orderService from './order.service';

export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await orderService.placeOrder(req.user!.userId, req.body);
    sendSuccess(res, order, 'অর্ডার দেওয়া হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const handleOrderResponse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { action } = req.body;
    const order = await orderService.respondToOrder(req.user!.userId, String(req.params.id), action);
    const msg = action === 'accept' ? 'অর্ডার গ্রহণ করা হয়েছে' : 'অর্ডার প্রত্যাখ্যান করা হয়েছে';
    sendSuccess(res, order, msg);
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
    const orders = await orderService.getResellOrders(req.query.area as string);
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
