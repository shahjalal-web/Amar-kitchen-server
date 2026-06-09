import { Response } from 'express';

export const sendSuccess = (
  res: Response,
  data: unknown,
  message = 'সফল',
  statusCode = 200
): void => {
  res.status(statusCode).json({ success: true, message, data });
};

export const sendError = (
  res: Response,
  message = 'কিছু একটা সমস্যা হয়েছে',
  statusCode = 500
): void => {
  res.status(statusCode).json({ success: false, message });
};
