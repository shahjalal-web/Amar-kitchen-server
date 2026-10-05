import { getAuth } from 'firebase-admin/auth';
import { StaffRole } from './staff.model';
import { User } from '../auth/auth.model';
import { slugify } from '../location/location.model';
import { PERMISSION_GROUPS, isPermission, Permission } from '../../utils/permissions';

export const getPermissionGroups = () => PERMISSION_GROUPS;

const cleanPermissions = (input: unknown): Permission[] => {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter(isPermission))];
};

// ─── রোল ───────────────────────────────────────────────────
export const listRoles = async () => {
  const roles = await StaffRole.find().sort({ createdAt: 1 }).lean();
  const counts = await User.aggregate<{ _id: unknown; n: number }>([
    { $match: { role: 'admin', staffRole: { $ne: null } } },
    { $group: { _id: '$staffRole', n: { $sum: 1 } } },
  ]);
  const byRole = new Map(counts.map((c) => [String(c._id), c.n]));
  return roles.map((r) => ({ ...r, memberCount: byRole.get(String(r._id)) ?? 0 }));
};

export const createRole = async (data: { name?: string; slug?: string; description?: string; permissions?: unknown }) => {
  const name = data.name?.trim();
  if (!name) throw new Error('রোলের নাম দিন');
  const permissions = cleanPermissions(data.permissions);
  if (!permissions.length) throw new Error('অন্তত একটি পারমিশন দিন');
  const slug = slugify(data.slug?.trim() || '') || `role-${Date.now().toString(36)}`;
  if (await StaffRole.exists({ $or: [{ name }, { slug }] })) throw new Error('এই নামে রোল আগেই আছে');
  return StaffRole.create({ name, slug, description: data.description?.trim(), permissions });
};

export const updateRole = async (id: string, data: { name?: string; description?: string; permissions?: unknown; isActive?: boolean }) => {
  const role = await StaffRole.findById(id);
  if (!role) throw new Error('রোল পাওয়া যায়নি');
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw new Error('রোলের নাম দিন');
    if (await StaffRole.exists({ _id: { $ne: role._id }, name })) throw new Error('এই নামে রোল আগেই আছে');
    role.name = name;
  }
  if (data.description !== undefined) role.description = data.description.trim();
  if (data.permissions !== undefined) {
    const permissions = cleanPermissions(data.permissions);
    if (!permissions.length) throw new Error('অন্তত একটি পারমিশন দিন');
    role.permissions = permissions;
  }
  if (data.isActive !== undefined) role.isActive = !!data.isActive;
  return role.save();
};

export const deleteRole = async (id: string) => {
  const members = await User.countDocuments({ staffRole: id });
  if (members) throw new Error(`এই রোলে ${members} জন স্টাফ আছেন — আগে তাদের অন্য রোল দিন`);
  const role = await StaffRole.findByIdAndDelete(id);
  if (!role) throw new Error('রোল পাওয়া যায়নি');
  return role;
};

// ─── স্টাফ (সাব-অ্যাডমিন) ───────────────────────────────────
const STAFF_FIELDS = 'name email phone role staffRole isActive createdAt';

export const listStaff = () =>
  User.find({ role: 'admin' }).select(STAFF_FIELDS).populate('staffRole', 'name permissions isActive').sort({ staffRole: 1, createdAt: 1 });

const getActiveRole = async (roleId: unknown) => {
  const role = await StaffRole.findById(roleId);
  if (!role) throw new Error('রোল নির্বাচন করুন');
  if (!role.isActive) throw new Error('এই রোলটি বন্ধ আছে');
  return role;
};

export const createStaff = async (data: { name?: string; email?: string; phone?: string; password?: string; roleId?: string }) => {
  const name = data.name?.trim();
  const email = data.email?.trim().toLowerCase();
  const phone = data.phone?.trim();
  if (!name || !email || !phone) throw new Error('নাম, ইমেইল ও ফোন দিন');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('ইমেইল সঠিক নয়');
  if (!data.password || data.password.length < 8) throw new Error('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের দিন');
  const role = await getActiveRole(data.roleId);
  if (await User.exists({ email })) throw new Error('এই ইমেইলে আগেই একাউন্ট আছে');

  let uid: string;
  try {
    uid = (await getAuth().createUser({ email, password: data.password, displayName: name, emailVerified: true })).uid;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/email-already-exists') throw new Error('এই ইমেইলে Firebase-এ আগেই একাউন্ট আছে');
    throw new Error('লগইন একাউন্ট তৈরি করা যায়নি');
  }
  try {
    const user = await User.create({ firebaseUid: uid, name, email, phone, role: 'admin', isApproved: true, staffRole: role._id });
    return User.findById(user._id).select(STAFF_FIELDS).populate('staffRole', 'name permissions isActive');
  } catch (err) {
    await getAuth().deleteUser(uid).catch(() => undefined); // অর্ধেক তৈরি একাউন্ট রাখা হবে না
    throw err;
  }
};

const findStaff = async (id: string, actorId: string) => {
  if (id === actorId) throw new Error('নিজের একাউন্ট এখান থেকে বদলানো যাবে না');
  const user = await User.findOne({ _id: id, role: 'admin' });
  if (!user) throw new Error('স্টাফ পাওয়া যায়নি');
  if (!user.staffRole) throw new Error('সুপার অ্যাডমিনকে এখান থেকে বদলানো যাবে না');
  return user;
};

export const updateStaff = async (actorId: string, id: string, data: { name?: string; phone?: string; roleId?: string; isActive?: boolean; password?: string }) => {
  const user = await findStaff(id, actorId);
  if (data.name?.trim()) user.name = data.name.trim();
  if (data.phone?.trim()) user.phone = data.phone.trim();
  if (data.roleId) user.staffRole = (await getActiveRole(data.roleId))._id as typeof user.staffRole;
  if (data.isActive !== undefined) user.isActive = !!data.isActive;
  if (data.password) {
    if (data.password.length < 8) throw new Error('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের দিন');
    await getAuth().updateUser(user.firebaseUid, { password: data.password });
  }
  await user.save();
  return User.findById(user._id).select(STAFF_FIELDS).populate('staffRole', 'name permissions isActive');
};

export const deleteStaff = async (actorId: string, id: string) => {
  const user = await findStaff(id, actorId);
  await getAuth().deleteUser(user.firebaseUid).catch(() => undefined);
  await user.deleteOne();
  return { _id: user._id };
};
