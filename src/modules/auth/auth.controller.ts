import { Request, Response } from 'express';
import { registerUser, loginUser, getProfile } from './auth.service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../middleware/auth';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await registerUser(req.body);
    sendSuccess(res, result, 'রেজিস্ট্রেশন সফল হয়েছে', 201);
  } catch (err: unknown) {
    sendError(res, (err as Error).message, 400);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await loginUser(req.body.firebaseToken);
    sendSuccess(res, result, 'লগইন সফল হয়েছে');
  } catch (err: unknown) {
    sendError(res, (err as Error).message, 400);
  }
};

export const profile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await getProfile(req.user!.userId);
    if (!user) { sendError(res, 'ব্যবহারকারী পাওয়া যায়নি', 404); return; }
    sendSuccess(res, user, 'প্রোফাইল পাওয়া গেছে');
  } catch (err: unknown) {
    sendError(res, (err as Error).message, 400);
  }
};
