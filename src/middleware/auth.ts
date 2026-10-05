import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/response';
import { User } from '../modules/auth/auth.model';

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

// kitchen/delivery একাউন্ট admin approve না করা পর্যন্ত কাজ করতে পারবে না
// (JWT শুধু role বহন করে, তাই isApproved/isActive প্রতি রিকোয়েস্টে DB থেকে দেখা হয়)
export const requireApproved = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.user?.userId).select('isApproved isActive');
    if (!user || !user.isActive) {
      sendError(res, 'আপনার একাউন্ট বন্ধ করা হয়েছে', 403);
      return;
    }
    if (!user.isApproved) {
      sendError(res, 'অ্যাডমিন এখনো আপনার একাউন্ট অ্যাপ্রুভ করেনি', 403);
      return;
    }
    next();
  } catch {
    sendError(res, 'অনুমতি যাচাই করা যায়নি', 500);
  }
};
