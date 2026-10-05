import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as kitchenService from './kitchen.service';
import { LngLat, parsePoint } from '../../utils/geo';
import { User } from '../auth/auth.model';

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

// ?areaId= না দিলে ইউজারের প্রোফাইলের এলাকা ধরা হয়
const resolveAreaId = async (req: AuthRequest): Promise<string | null> => {
  if (req.query.areaId) return String(req.query.areaId);
  const me = await User.findById(req.user!.userId).select('areaId');
  return me?.areaId?.toString() ?? null;
};

// ?areaId= অথবা ?zip= ; কিছু না দিলে নিজের প্রোফাইলের এলাকা
export const getSuggestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.query.zip) {
      sendSuccess(res, await kitchenService.getKitchensByZip(String(req.query.zip)));
      return;
    }
    const areaId = await resolveAreaId(req);
    if (!areaId) { sendError(res, 'এলাকা নির্বাচন করুন', 400); return; }
    sendSuccess(res, await kitchenService.getKitchenSuggestionsByArea(areaId));
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const getTopNearby = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const areaId = await resolveAreaId(req);
    if (!areaId) { sendError(res, 'এলাকা নির্বাচন করুন', 400); return; }
    sendSuccess(res, await kitchenService.getTopNearbyKitchens(areaId));
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const searchDeliveryBoys = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boys = await kitchenService.findDeliveryBoys(req.user!.userId, {
      areaId: req.query.areaId as string | undefined,
      q: req.query.q as string | undefined,
    });
    sendSuccess(res, boys);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const readyForPickup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { menu, readyOrders } = await kitchenService.markReadyForPickup(req.user!.userId);
    sendSuccess(res, menu, `ডেলিভারি বয়কে সিগন্যাল পাঠানো হয়েছে (${readyOrders}টি অর্ডার প্রস্তুত)`);
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

// ?kitchenId=&areaId=&count= — কিচেন ও গ্রাহকের এলাকা অনুযায়ী আনুমানিক চার্জ
// ?kitchenId=&areaId=[&lat=&lng=][&count=] — গ্রাহক যেকোনো কিচেনের চার্জ দেখতে পারে (কিচেনের লোকেশন রেসপন্সে যায় না)
const queryPoint = (req: AuthRequest): LngLat | null => {
  if (req.query.lat === undefined || req.query.lng === undefined) return null;
  const p = parsePoint({ lat: req.query.lat, lng: req.query.lng });
  return p ? (p.coordinates as LngLat) : null;
};

export const getDeliveryCharge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const count = Number(req.query.count) || 1;
    const kitchen = req.query.kitchenId
      ? await User.findOne({ _id: String(req.query.kitchenId), role: 'kitchen' }).select('areaId +kitchenLocation')
      : null;
    const point = queryPoint(req);
    const quote = await kitchenService.quoteDelivery(
      { areaId: kitchen?.areaId?.toString(), location: kitchen?.kitchenLocation },
      { areaId: req.query.areaId as string | undefined, location: point ? { coordinates: point } : null },
      count
    );
    sendSuccess(res, quote);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const listFoods = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const foods = await kitchenService.getActiveFoodItems(req.user!.userId);
    sendSuccess(res, foods);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

// ─── কিচেনের নিজের খাবার ───────────────────────────────────
export const myFoods = async (req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await kitchenService.getMyFoodItems(req.user!.userId)); }
  catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const createMyFood = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const food = await kitchenService.createKitchenFood(req.user!.userId, req.body);
    sendSuccess(res, food, 'খাবার যোগ হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const updateMyFood = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const food = await kitchenService.updateKitchenFood(req.user!.userId, String(req.params.id), req.body);
    sendSuccess(res, food, 'খাবার আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const deleteMyFood = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await kitchenService.deleteKitchenFood(req.user!.userId, String(req.params.id));
    sendSuccess(res, result, 'খাবার ও এর ছবি মুছে ফেলা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

// ইউজারের খাবার সার্চ (?q=&areaId=; areaId না দিলে প্রোফাইলের এলাকা)
export const foodSearch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const areaId = await resolveAreaId(req);
    if (!areaId) { sendError(res, 'এলাকা নির্বাচন করুন', 400); return; }
    const radius = req.query.radiusKm !== undefined ? Number(req.query.radiusKm) : undefined;
    sendSuccess(res, await kitchenService.searchFoodInArea(areaId, String(req.query.q ?? ''), radius));
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

// পাবলিক — হোম পেজ (লগইন লাগে না); CDN/ব্রাউজার ১০ মিনিট ক্যাশ রাখতে পারে
export const publicHighlights = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    sendSuccess(res, await kitchenService.getPublicHighlights());
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

// গ্রাহকের ব্রাউজ: ?areaId=&radiusKm= — নিজের এরিয়া + পরিধির মধ্যের কিচেন, দূরত্ব ও চার্জসহ
export const browse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const areaId = await resolveAreaId(req);
    if (!areaId) { sendError(res, 'এলাকা নির্বাচন করুন', 400); return; }
    const radius = req.query.radiusKm !== undefined ? Number(req.query.radiusKm) : undefined;
    sendSuccess(res, await kitchenService.browseKitchens(areaId, radius, queryPoint(req)));
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};
