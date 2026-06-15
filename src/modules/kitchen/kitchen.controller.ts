import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as kitchenService from './kitchen.service';
import { Area } from '../area/area.model';

const DEFAULT_RADIUS_KM = 5;

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
    const { areaId, lat, lng } = req.query;

    let lng_: number, lat_: number, radiusKm: number;

    if (areaId) {
      const area = await Area.findById(areaId as string);
      if (!area) { sendError(res, 'এরিয়া পাওয়া যায়নি', 404); return; }
      [lng_, lat_] = area.location.coordinates;
      radiusKm = area.radiusKm;
    } else if (lat && lng) {
      lat_ = Number(lat);
      lng_ = Number(lng);
      radiusKm = DEFAULT_RADIUS_KM;
    } else {
      sendError(res, 'লোকেশন বা এরিয়া দিন', 400);
      return;
    }

    const menus = await kitchenService.getNearbyKitchenMenus(lng_, lat_, radiusKm);
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
