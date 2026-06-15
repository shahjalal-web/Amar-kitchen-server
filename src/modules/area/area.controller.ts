import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as areaService from './area.service';

export const listActiveAreas = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const areas = await areaService.getActiveAreas();
    sendSuccess(res, areas);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const listAllAreas = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const areas = await areaService.getAllAreas();
    sendSuccess(res, areas);
  } catch (err: unknown) { sendError(res, (err as Error).message); }
};

export const createAreaCtrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, lat, lng, radiusKm } = req.body;
    const area = await areaService.createArea({ name, lat, lng, radiusKm });
    sendSuccess(res, area, 'এরিয়া তৈরি হয়েছে', 201);
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const updateAreaCtrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const area = await areaService.updateArea(String(req.params.id), req.body);
    sendSuccess(res, area, 'এরিয়া আপডেট হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};

export const deactivateAreaCtrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const area = await areaService.deactivateArea(String(req.params.id));
    sendSuccess(res, area, 'এরিয়া নিষ্ক্রিয় করা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};
