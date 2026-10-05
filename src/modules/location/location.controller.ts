import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import * as locationService from './location.service';

// প্রতিটি হ্যান্ডলার একই try/catch → sendSuccess/sendError প্যাটার্ন
const handle = (fn: (req: Request) => Promise<unknown>, okMessage?: string, okStatus = 200) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      sendSuccess(res, await fn(req), okMessage, okStatus);
    } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
  };

// পাবলিক — রেজিস্ট্রেশন ও অর্ডারের ড্রপডাউন
export const listCities = handle(() => locationService.getCities());
export const listThanas = handle((req) => locationService.getThanas(String(req.query.cityId)));
export const listAreas = handle((req) => locationService.getAreas(String(req.query.thanaId)));
export const areaDetail = handle((req) => locationService.getAreaDetail(String(req.params.id)));
export const search = handle((req) => locationService.searchAreas(String(req.query.q ?? '')));
export const nearbyAreas = handle((req) =>
  locationService.findNearbyAreas(String(req.params.id), Number(req.query.radiusKm) || 3));

// Admin — নিষ্ক্রিয়সহ সব
export const adminCities = handle(() => locationService.getCities(true));
export const adminThanas = handle((req) => locationService.getThanas(String(req.query.cityId), true));
export const adminAreas = handle((req) => locationService.getAreas(String(req.query.thanaId), true));

export const createCity = handle((req) => locationService.createCity(req.body), 'শহর যোগ হয়েছে', 201);
export const updateCity = handle((req) => locationService.updateCity(String(req.params.id), req.body), 'শহর আপডেট হয়েছে');
export const createThana = handle((req) => locationService.createThana(req.body), 'থানা যোগ হয়েছে', 201);
export const updateThana = handle((req) => locationService.updateThana(String(req.params.id), req.body), 'থানা আপডেট হয়েছে');
export const createArea = handle((req) => locationService.createArea(req.body), 'এরিয়া যোগ হয়েছে', 201);
export const updateArea = handle((req) => locationService.updateArea(String(req.params.id), req.body), 'এরিয়া আপডেট হয়েছে');
