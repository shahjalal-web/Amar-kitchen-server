import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { discardImages } from './media.controller';

const router = Router();

// ফর্মে আপলোড করা কিন্তু সেভ না হওয়া ছবি মোছা (খাবারের ছবি যারা দিতে পারে)
router.post('/discard', authenticate, authorize('admin', 'kitchen'), discardImages);

export default router;
