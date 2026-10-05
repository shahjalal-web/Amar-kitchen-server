import { Router } from 'express';
import { authenticate, authorize, requirePermission as can } from '../../middleware/auth';
import {
  addFoodItem, listFoodItems, editFoodItem, removeFoodItem,
  addPackage, listPackages, editPackage,
  getConfig, updateConfig,
  pendingApprovals, approveUserCtrl, rejectUserCtrl, setOrderLimit,
  financialSummary, listWithdrawals, approveWithdrawalCtrl, rejectWithdrawalCtrl,
  dashboardStats, allOrders, cancelOrderCtrl, allUsers, userDetail, setUserActiveCtrl,
} from './admin.controller';

const router = Router();
// প্রতিটি রাউটে admin হওয়ার পাশাপাশি রোলের পারমিশন যাচাই (সুপার অ্যাডমিন সব পারে)
const admin = [authenticate, authorize('admin')];

// Food library
router.get('/foods', ...admin, can('foods.manage', 'packages.manage'), listFoodItems);
router.post('/foods', ...admin, can('foods.manage'), addFoodItem);
router.patch('/foods/:id', ...admin, can('foods.manage'), editFoodItem);
router.delete('/foods/:id', ...admin, can('foods.manage'), removeFoodItem);

// Packages
router.get('/packages', ...admin, can('packages.manage'), listPackages);
router.post('/packages', ...admin, can('packages.manage'), addPackage);
router.patch('/packages/:id', ...admin, can('packages.manage'), editPackage);

// Global config
router.get('/config', ...admin, can('config.manage'), getConfig);
router.patch('/config', ...admin, can('config.manage'), updateConfig);

// Approvals
router.get('/approvals', ...admin, can('approvals.manage'), pendingApprovals);
router.patch('/approvals/:id/approve', ...admin, can('approvals.manage'), approveUserCtrl);
router.patch('/approvals/:id/reject', ...admin, can('approvals.manage'), rejectUserCtrl);
router.patch('/kitchen/:id/order-limit', ...admin, can('users.manage', 'approvals.manage'), setOrderLimit);

// Financial
router.get('/finance', ...admin, can('finance.view', 'finance.manage'), financialSummary);
router.get('/withdrawals', ...admin, can('finance.view', 'finance.manage'), listWithdrawals);
router.patch('/withdrawals/:id/approve', ...admin, can('finance.manage'), approveWithdrawalCtrl);
router.patch('/withdrawals/:id/reject', ...admin, can('finance.manage'), rejectWithdrawalCtrl);

// Insights & management
router.get('/dashboard', ...admin, can('dashboard.view'), dashboardStats);
router.get('/orders', ...admin, can('orders.view', 'orders.manage'), allOrders);
router.patch('/orders/:id/cancel', ...admin, can('orders.manage'), cancelOrderCtrl);
router.get('/users', ...admin, can('users.view', 'users.manage'), allUsers);
router.get('/users/:id', ...admin, can('users.view', 'users.manage'), userDetail);
router.patch('/users/:id/active', ...admin, can('users.manage'), setUserActiveCtrl);

export default router;
