import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as subService from './subscription.service';

export const createSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sub = await subService.subscribe(req.user!.userId, req.body);
    sendSuccess(res, sub, 'সাবস্ক্রিপশন সফল হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const cancelSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sub = await subService.requestCancellation(req.user!.userId, String(req.params.id));
    sendSuccess(res, sub, 'সাবস্ক্রিপশন ক্যান্সেল রিকোয়েস্ট নেওয়া হয়েছে। পরদিন থেকে কার্যকর হবে।');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const mySubscriptions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const subs = await subService.getUserSubscriptions(req.user!.userId);
    sendSuccess(res, subs);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};
