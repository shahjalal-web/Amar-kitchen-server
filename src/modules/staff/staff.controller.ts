import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as staffService from './staff.service';

export const permissions = async (_req: AuthRequest, res: Response): Promise<void> => {
  sendSuccess(res, staffService.getPermissionGroups());
};

export const roles = async (_req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await staffService.listRoles()); }
  catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const addRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await staffService.createRole(req.body), 'রোল তৈরি হয়েছে', 201); }
  catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const editRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await staffService.updateRole(String(req.params.id), req.body), 'রোল আপডেট হয়েছে'); }
  catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const removeRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await staffService.deleteRole(String(req.params.id)), 'রোল মুছে ফেলা হয়েছে'); }
  catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const members = async (_req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await staffService.listStaff()); }
  catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const addMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await staffService.createStaff(req.body), 'স্টাফ একাউন্ট তৈরি হয়েছে', 201); }
  catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const editMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await staffService.updateStaff(req.user!.userId, String(req.params.id), req.body), 'স্টাফ আপডেট হয়েছে'); }
  catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const removeMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try { sendSuccess(res, await staffService.deleteStaff(req.user!.userId, String(req.params.id)), 'স্টাফ মুছে ফেলা হয়েছে'); }
  catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};
