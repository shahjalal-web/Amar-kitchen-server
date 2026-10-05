import mongoose, { Document, Schema } from 'mongoose';
import { ALL_PERMISSIONS, Permission } from '../../utils/permissions';

// অ্যাডমিন প্যানেলের রোল (সাব অ্যাডমিন, ম্যানেজার, অ্যাকাউন্টস…) — স্টাফ ইউজার role: 'admin' + staffRole
export interface IStaffRole extends Document {
  name: string;
  slug: string;
  description?: string;
  permissions: Permission[];
  isActive: boolean;
}

const staffRoleSchema = new Schema<IStaffRole>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, trim: true, unique: true, lowercase: true },
    description: { type: String, trim: true },
    permissions: { type: [String], enum: ALL_PERMISSIONS, default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const StaffRole = mongoose.model<IStaffRole>('StaffRole', staffRoleSchema);
