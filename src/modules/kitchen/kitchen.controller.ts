import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as kitchenService from './kitchen.service';

export const setMenu = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const menu = await kitchenService.setTodayMenu(req.user!.userId, req.body);
    sendSuccess(res, menu, 'আজকের মেনু সেট করা হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const getMyMenu = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const menu = await kitchenService.getTodayMenu(req.user!.userId);
    sendSuccess(res, menu);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const getNearbyMenus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const menus = await kitchenService.getNearbyKitchenMenus(req.query.area as string);
    sendSuccess(res, menus);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const readyForPickup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const menu = await kitchenService.markReadyForPickup(req.user!.userId);
    sendSuccess(res, menu, 'ডেলিভারি বয়কে সিগন্যাল পাঠানো হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const getWallet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wallet = await kitchenService.getWalletBalance(req.user!.userId);
    sendSuccess(res, wallet);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const withdrawRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount, bkashNumber } = req.body;
    const result = await kitchenService.requestWithdrawal(req.user!.userId, amount, bkashNumber);
    sendSuccess(res, result, 'উইথড্র রিকোয়েস্ট পাঠানো হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const getWithdrawals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const history = await kitchenService.getWithdrawalHistory(req.user!.userId);
    sendSuccess(res, history);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const getDeliveryCharge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const count = Number(req.query.count) || 1;
    const charge = await kitchenService.calcDeliveryCharge(count);
    sendSuccess(res, { charge });
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const listFoods = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const foods = await kitchenService.getActiveFoodItems();
    sendSuccess(res, foods);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};
