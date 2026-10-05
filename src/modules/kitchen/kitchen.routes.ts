import { Router } from 'express';
import { authenticate, authorize, requireApproved } from '../../middleware/auth';
import {
  setMenu, getMyMenu, getSuggestions, getTopNearby, searchDeliveryBoys, readyForPickup,
  getWallet, withdrawRequest, getWithdrawals, getDeliveryCharge,
  listFoods, myFoods, createMyFood, updateMyFood, foodSearch,
} from './kitchen.controller';

const router = Router();
const kitchenOnly = [authenticate, authorize('kitchen')];
const approvedKitchen = [...kitchenOnly, requireApproved];

router.get('/foods', ...kitchenOnly, listFoods);              // অ্যাডমিন লাইব্রেরি + নিজের খাবার
router.get('/foods/mine', ...kitchenOnly, myFoods);
router.post('/foods', ...approvedKitchen, createMyFood);
router.patch('/foods/:id', ...approvedKitchen, updateMyFood);
router.get('/food-search', authenticate, foodSearch);            // ?q=&areaId= — ইউজারের খাবার সার্চ

router.post('/menu', ...approvedKitchen, setMenu);
router.get('/menu/mine', ...kitchenOnly, getMyMenu);
router.patch('/menu/ready', ...approvedKitchen, readyForPickup);

router.get('/wallet', ...kitchenOnly, getWallet);
router.post('/wallet/withdraw', ...approvedKitchen, withdrawRequest);
router.get('/wallet/withdrawals', ...kitchenOnly, getWithdrawals);

// এলাকা ভিত্তিক কিচেন সাজেশন (?areaId=, না দিলে নিজের প্রোফাইলের এলাকা)
router.get('/suggestions', authenticate, getSuggestions);      // ?areaId= | ?zip=
router.get('/top-nearby', authenticate, getTopNearby);         // ?areaId= — আশেপাশের এলাকার টপ কিচেন

// কিচেন — নিজের এলাকার ডেলিভারি বয় খোঁজা (?areaId=&q=)
router.get('/delivery-boys', ...approvedKitchen, searchDeliveryBoys);
router.get('/delivery-charge', authenticate, getDeliveryCharge);

export default router;
