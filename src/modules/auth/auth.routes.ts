import { Router } from 'express';
import { register, login, profile, updateProfileLocation } from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authenticate, profile);
router.patch('/profile/location', authenticate, updateProfileLocation);

export default router;
