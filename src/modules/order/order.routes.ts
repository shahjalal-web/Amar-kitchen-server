import { Router } from 'express';
import { authenticate, authorize, requireApproved } from '../../middleware/auth';
import {
  createOrder, handleOrderResponse, cancelUserOrder,
  purchaseResell, listResellOrders, myOrders, kitchenOrders,
  updateStatus, assignDelivery, confirmDelivery, resendOtp,
} from './order.controller';

const router = Router();

// User routes
router.post('/', authenticate, authorize('user'), createOrder);
router.delete('/:id/cancel', authenticate, authorize('user'), cancelUserOrder);
router.get('/mine', authenticate, authorize('user'), myOrders);
router.post('/:id/confirm-delivery', authenticate, authorize('user'), confirmDelivery);

// Resell routes (সব authenticated user দেখতে পারবে)
router.get('/resell', authenticate, listResellOrders);
router.post('/resell/:id/buy', authenticate, authorize('user'), purchaseResell);

// Kitchen routes
router.patch('/:id/respond', authenticate, authorize('kitchen'), requireApproved, handleOrderResponse);
router.get('/kitchen', authenticate, authorize('kitchen'), kitchenOrders);
router.patch('/:id/assign', authenticate, authorize('kitchen'), requireApproved, assignDelivery);

// কিচেন ও নির্ধারিত ডেলিভারি বয় — স্ট্যাটাস আপডেট (কে কোনটা পারবে service-এ যাচাই হয়)
router.patch('/:id/status', authenticate, authorize('kitchen', 'delivery'), requireApproved, updateStatus);
router.post('/:id/resend-otp', authenticate, authorize('kitchen', 'delivery'), requireApproved, resendOtp);

export default router;
