import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/response';

export interface AuthPayload {
  userId: string;
  role: 'admin' | 'kitchen' | 'user' | 'delivery';
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    sendError(res, 'অনুমতি নেই — টোকেন প্রয়োজন', 401);
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    sendError(res, 'টোকেন অবৈধ বা মেয়াদোত্তীর্ণ', 401);
  }
};

export const authorize = (...roles: AuthPayload['role'][]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      sendError(res, 'এই কাজের অনুমতি নেই', 403);
      return;
    }
    next();
  };
