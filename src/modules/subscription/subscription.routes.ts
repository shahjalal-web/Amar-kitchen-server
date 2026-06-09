import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { createSubscription, cancelSubscription, mySubscriptions } from './subscription.controller';

const router = Router();

router.post('/', authenticate, authorize('user'), createSubscription);
router.delete('/:id/cancel', authenticate, authorize('user'), cancelSubscription);
router.get('/mine', authenticate, authorize('user'), mySubscriptions);

export default router;
