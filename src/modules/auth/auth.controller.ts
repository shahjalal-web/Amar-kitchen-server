import { Request, Response } from 'express';
import {
  registerUser, loginUser, getProfile, updateProfile,
  listAddresses, addAddress, updateAddress, deleteAddress,
} from './auth.service';
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

export const updateMyProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await updateProfile(req.user!.userId, req.body);
    sendSuccess(res, user, 'প্রোফাইল আপডেট হয়েছে');
  } catch (err: unknown) {
    sendError(res, (err as Error).message, 400);
  }
};

// ─── ঠিকানা বই ────────────────────────────────────────────
export const getAddresses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await listAddresses(req.user!.userId));
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const createAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await addAddress(req.user!.userId, req.body), 'ঠিকানা সেভ হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const editAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await updateAddress(req.user!.userId, String(req.params.id), req.body), 'ঠিকানা আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const removeAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await deleteAddress(req.user!.userId, String(req.params.id)), 'ঠিকানা মুছে ফেলা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};
