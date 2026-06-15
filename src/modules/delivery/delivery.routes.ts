import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { availablePickups, myDeliveries, scan, earnings, updateDeliveryAreas } from './delivery.controller';

const router = Router();
const deliveryOnly = [authenticate, authorize('delivery')];

router.get('/pickups', ...deliveryOnly, availablePickups);
router.get('/my-deliveries', ...deliveryOnly, myDeliveries);
router.post('/scan', ...deliveryOnly, scan);
router.get('/earnings', ...deliveryOnly, earnings);
router.patch('/areas', ...deliveryOnly, updateDeliveryAreas);

export default router;
