import { Router } from 'express';
import { authenticate, authorize, requireApproved } from '../../middleware/auth';
import {
  setMenu, getMyMenu, getSuggestions, getTopNearby, searchDeliveryBoys, readyForPickup,
  getWallet, withdrawRequest, getWithdrawals, getDeliveryCharge,
  listFoods, myFoods, createMyFood, updateMyFood, deleteMyFood, foodSearch, publicHighlights, browse,
} from './kitchen.controller';

const router = Router();
const kitchenOnly = [authenticate, authorize('kitchen')];
const approvedKitchen = [...kitchenOnly, requireApproved];

// পাবলিক — হোম পেজ
router.get('/public/highlights', publicHighlights);

router.get('/foods', ...kitchenOnly, listFoods);              // অ্যাডমিন লাইব্রেরি + নিজের খাবার
router.get('/foods/mine', ...kitchenOnly, myFoods);
router.post('/foods', ...approvedKitchen, createMyFood);
router.patch('/foods/:id', ...approvedKitchen, updateMyFood);
router.delete('/foods/:id', ...approvedKitchen, deleteMyFood);
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
router.get('/browse', authenticate, browse);                   // ?areaId=&radiusKm= — নিজের এরিয়া + পরিধির কিচেন, দূরত্ব ও চার্জসহ

// কিচেন — নিজের এলাকার ডেলিভারি বয় খোঁজা (?areaId=&q=)
router.get('/delivery-boys', ...approvedKitchen, searchDeliveryBoys);
router.get('/delivery-charge', authenticate, getDeliveryCharge);

export default router;
