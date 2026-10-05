import { Router } from 'express';
import { authenticate, authorize, requireApproved } from '../../middleware/auth';
import { availablePickups, myDeliveries, scan, earnings, updateDeliveryAreas, claim, updateAvailability } from './delivery.controller';

const router = Router();
const deliveryOnly = [authenticate, authorize('delivery')];
const approvedDelivery = [...deliveryOnly, requireApproved];

router.get('/pickups', ...approvedDelivery, availablePickups);
router.get('/my-deliveries', ...deliveryOnly, myDeliveries);
router.post('/orders/:id/claim', ...approvedDelivery, claim);
router.post('/scan', ...approvedDelivery, scan);
router.get('/earnings', ...deliveryOnly, earnings);
router.patch('/areas', ...deliveryOnly, updateDeliveryAreas);
router.patch('/availability', ...deliveryOnly, updateAvailability);   // অ্যাক্টিভ/অফ

export default router;
