import { Router } from 'express';
import { authenticate, authorize, requirePermission } from '../../middleware/auth';
import {
  listCities, listThanas, listAreas, areaDetail, search, nearbyAreas, nearestArea,
  adminCities, adminThanas, adminAreas,
  createCity, updateCity, createThana, updateThana, createArea, updateArea,
} from './location.controller';

const router = Router();
const adminOnly = [authenticate, authorize('admin'), requirePermission('locations.manage')];

// পাবলিক — লগইনের আগেই (রেজিস্ট্রেশন) দরকার
router.get('/cities', listCities);
router.get('/thanas', listThanas);            // ?cityId=
router.get('/areas', listAreas);              // ?thanaId=
router.get('/areas/search', search);          // ?q= জিপ কোড বা নাম
router.get('/areas/nearest', nearestArea);     // ?lat=&lng= — ম্যাপের পিনের সবচেয়ে কাছের এরিয়া
router.get('/areas/:id', areaDetail);
router.get('/areas/:id/nearby', nearbyAreas); // ?radiusKm=

// Admin
router.get('/admin/cities', ...adminOnly, adminCities);
router.get('/admin/thanas', ...adminOnly, adminThanas);
router.get('/admin/areas', ...adminOnly, adminAreas);
router.post('/cities', ...adminOnly, createCity);
router.patch('/cities/:id', ...adminOnly, updateCity);
router.post('/thanas', ...adminOnly, createThana);
router.patch('/thanas/:id', ...adminOnly, updateThana);
router.post('/areas', ...adminOnly, createArea);
router.patch('/areas/:id', ...adminOnly, updateArea);

export default router;
