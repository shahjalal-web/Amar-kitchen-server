import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import * as mediaService from './media.service';

export const discardImages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deleted = await mediaService.discard(req.body?.urls);
    sendSuccess(res, { deleted: deleted.length }, 'ছবি মুছে ফেলা হয়েছে');
  } catch (err: unknown) { sendError(res, (err as Error).message, 400); }
};
