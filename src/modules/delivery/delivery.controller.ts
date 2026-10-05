import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as deliveryService from './delivery.service';

export const availablePickups = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orders = await deliveryService.getAvailablePickups(req.user!.userId);
    sendSuccess(res, orders);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const updateDeliveryAreas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await deliveryService.setDeliveryAreas(req.user!.userId, req.body.areaIds || []);
    sendSuccess(res, user, 'ডেলিভারি এরিয়া আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const myDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orders = await deliveryService.getMyActiveDeliveries(req.user!.userId);
    sendSuccess(res, orders);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const scan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await deliveryService.scanCode(req.user!.userId, req.body.uniqueCode, req.body.otp);
    sendSuccess(res, result, result.message);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const earnings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await deliveryService.getDailyEarnings(req.user!.userId);
    sendSuccess(res, data);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const claim = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await deliveryService.claimOrder(req.user!.userId, String(req.params.id));
    sendSuccess(res, order, 'ডেলিভারির দায়িত্ব নেওয়া হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const updateAvailability = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await deliveryService.setAvailability(req.user!.userId, !!req.body.isAvailable);
    sendSuccess(res, user, user?.isAvailable ? 'আপনি এখন অ্যাক্টিভ — নতুন ডেলিভারি পাবেন' : 'আপনি এখন অফ — নতুন ডেলিভারি আসবে না');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};
