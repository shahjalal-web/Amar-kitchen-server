import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  listActiveAreas, listAllAreas, createAreaCtrl, updateAreaCtrl, deactivateAreaCtrl,
} from './area.controller';

const router = Router();
const adminOnly = [authenticate, authorize('admin')];

router.get('/', authenticate, listActiveAreas);
router.get('/all', ...adminOnly, listAllAreas);
router.post('/', ...adminOnly, createAreaCtrl);
router.patch('/:id', ...adminOnly, updateAreaCtrl);
router.delete('/:id', ...adminOnly, deactivateAreaCtrl);

export default router;
