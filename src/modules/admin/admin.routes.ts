import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  addFoodItem, listFoodItems, editFoodItem, removeFoodItem,
  addPackage, listPackages, editPackage,
  getConfig, updateConfig,
  pendingApprovals, approveUserCtrl, rejectUserCtrl, setOrderLimit,
  financialSummary,
} from './admin.controller';

const router = Router();
const adminOnly = [authenticate, authorize('admin')];

// Food library
router.get('/foods', ...adminOnly, listFoodItems);
router.post('/foods', ...adminOnly, addFoodItem);
router.patch('/foods/:id', ...adminOnly, editFoodItem);
router.delete('/foods/:id', ...adminOnly, removeFoodItem);

// Packages
router.get('/packages', ...adminOnly, listPackages);
router.post('/packages', ...adminOnly, addPackage);
router.patch('/packages/:id', ...adminOnly, editPackage);

// Global config
router.get('/config', ...adminOnly, getConfig);
router.patch('/config', ...adminOnly, updateConfig);

// Approvals
router.get('/approvals', ...adminOnly, pendingApprovals);
router.patch('/approvals/:id/approve', ...adminOnly, approveUserCtrl);
router.patch('/approvals/:id/reject', ...adminOnly, rejectUserCtrl);
router.patch('/kitchen/:id/order-limit', ...adminOnly, setOrderLimit);

// Financial
router.get('/finance', ...adminOnly, financialSummary);

export default router;
