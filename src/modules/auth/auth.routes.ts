import { Router } from 'express';
import {
  register, login, profile, updateMyProfile,
  getAddresses, createAddress, editAddress, removeAddress,
} from './auth.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authenticate, profile);
router.patch('/profile', authenticate, updateMyProfile);

// গ্রাহকের সেভ করা ঠিকানা
const userOnly = [authenticate, authorize('user')];
router.get('/addresses', ...userOnly, getAddresses);
router.post('/addresses', ...userOnly, createAddress);
router.patch('/addresses/:id', ...userOnly, editAddress);
router.delete('/addresses/:id', ...userOnly, removeAddress);

export default router;
