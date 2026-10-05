import { Router } from 'express';
import { authenticate, authorize, superAdminOnly } from '../../middleware/auth';
import {
  permissions, roles, addRole, editRole, removeRole,
  members, addMember, editMember, removeMember,
} from './staff.controller';

// স্টাফ ও রোল ব্যবস্থাপনা — শুধু সুপার অ্যাডমিন
const router = Router();
const superOnly = [authenticate, authorize('admin'), superAdminOnly];

router.get('/permissions', ...superOnly, permissions);
router.get('/roles', ...superOnly, roles);
router.post('/roles', ...superOnly, addRole);
router.patch('/roles/:id', ...superOnly, editRole);
router.delete('/roles/:id', ...superOnly, removeRole);
router.get('/members', ...superOnly, members);
router.post('/members', ...superOnly, addMember);
router.patch('/members/:id', ...superOnly, editMember);
router.delete('/members/:id', ...superOnly, removeMember);

export default router;
