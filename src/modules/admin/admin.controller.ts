import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as adminService from './admin.service';

// ─── Food Library ─────────────────────────────────────────
export const addFoodItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await adminService.createFoodItem(req.body);
    sendSuccess(res, item, 'খাবার যোগ করা হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const listFoodItems = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const items = await adminService.getAllFoodItems();
    sendSuccess(res, items);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const editFoodItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await adminService.updateFoodItem(String(req.params.id), req.body);
    sendSuccess(res, item, 'আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const removeFoodItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await adminService.deleteFoodItem(String(req.params.id));
    sendSuccess(res, null, 'মুছে ফেলা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

// ─── Package Management ───────────────────────────────────
export const addPackage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pkg = await adminService.createPackage(req.body);
    sendSuccess(res, pkg, 'প্যাকেজ তৈরি হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const listPackages = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const packages = await adminService.getAllPackages();
    sendSuccess(res, packages);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const editPackage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pkg = await adminService.updatePackage(String(req.params.id), req.body);
    sendSuccess(res, pkg, 'প্যাকেজ আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

// ─── Global Config ────────────────────────────────────────
export const getConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await adminService.getGlobalConfig();
    sendSuccess(res, config);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const updateConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await adminService.updateGlobalConfig(req.user!.userId, req.body);
    sendSuccess(res, config, 'কনফিগ আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

// ─── Approvals ────────────────────────────────────────────
export const pendingApprovals = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await adminService.getPendingApprovals();
    sendSuccess(res, users);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const approveUserCtrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await adminService.approveUser(String(req.params.id));
    sendSuccess(res, user, 'অ্যাপ্রুভ করা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const rejectUserCtrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await adminService.rejectUser(String(req.params.id));
    sendSuccess(res, null, 'প্রত্যাখ্যান করা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const setOrderLimit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await adminService.setKitchenOrderLimit(String(req.params.id), req.body.limit);
    sendSuccess(res, user, 'অর্ডার লিমিট আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const financialSummary = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await adminService.getFinancialSummary();
    sendSuccess(res, data);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

// ─── Withdrawals ──────────────────────────────────────────
export const listWithdrawals = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await adminService.getAllWithdrawals();
    sendSuccess(res, data);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const approveWithdrawalCtrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await adminService.approveWithdrawal(String(req.params.id));
    sendSuccess(res, data, 'উইথড্র অ্যাপ্রুভ করা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const rejectWithdrawalCtrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await adminService.rejectWithdrawal(String(req.params.id), req.body.note);
    sendSuccess(res, data, 'উইথড্র প্রত্যাখ্যান করা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};
