import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  createOrder, handleOrderResponse, cancelUserOrder,
  purchaseResell, listResellOrders, myOrders, kitchenOrders,
} from './order.controller';

const router = Router();

// User routes
router.post('/', authenticate, authorize('user'), createOrder);
router.delete('/:id/cancel', authenticate, authorize('user'), cancelUserOrder);
router.get('/mine', authenticate, authorize('user'), myOrders);

// Resell routes (সব authenticated user দেখতে পারবে)
router.get('/resell', authenticate, listResellOrders);
router.post('/resell/:id/buy', authenticate, authorize('user'), purchaseResell);

// Kitchen routes
router.patch('/:id/respond', authenticate, authorize('kitchen'), handleOrderResponse);
router.get('/kitchen', authenticate, authorize('kitchen'), kitchenOrders);

export default router;
