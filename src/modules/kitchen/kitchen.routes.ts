import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  setMenu, getMyMenu, getNearbyMenus, readyForPickup,
  getWallet, withdrawRequest, getWithdrawals, getDeliveryCharge,
  listFoods,
} from './kitchen.controller';

const router = Router();
const kitchenOnly = [authenticate, authorize('kitchen')];

router.get('/foods', ...kitchenOnly, listFoods);

router.post('/menu', ...kitchenOnly, setMenu);
router.get('/menu/mine', ...kitchenOnly, getMyMenu);
router.patch('/menu/ready', ...kitchenOnly, readyForPickup);

router.get('/wallet', ...kitchenOnly, getWallet);
router.post('/wallet/withdraw', ...kitchenOnly, withdrawRequest);
router.get('/wallet/withdrawals', ...kitchenOnly, getWithdrawals);

// ব্যবহারকারীও মেনু দেখতে পারবে
router.get('/nearby', authenticate, getNearbyMenus);
router.get('/delivery-charge', authenticate, getDeliveryCharge);

export default router;
