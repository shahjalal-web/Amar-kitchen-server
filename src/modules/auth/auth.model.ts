import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'admin' | 'kitchen' | 'user' | 'delivery';

// ইউজারের সেভ করা ঠিকানা — City/Thana area থেকে আসে, তাই শুধু areaId রাখা হয়
export interface IGeoPoint { type: 'Point'; coordinates: [number, number] } // [lng, lat]

export interface IAddress {
  label: string;             // যেমন: বাসা, অফিস
  areaId: mongoose.Types.ObjectId;
  buildingName: string;
  addressLine: string;       // বাসা/রোড/ফ্ল্যাট — বিস্তারিত ঠিকানা
  phone?: string;
  isDefault: boolean;
  location?: IGeoPoint;      // ম্যাপে বসানো পিন (ঐচ্ছিক) — দূরত্ব/ডেলিভারি চার্জ সঠিক করতে
}

const pointSchema = new Schema<IGeoPoint>({ type: { type: String, enum: ['Point'] }, coordinates: { type: [Number] } }, { _id: false });

const addressSchema = new Schema<IAddress>({
  label: { type: String, default: 'বাসা', trim: true },
  areaId: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
  buildingName: { type: String, required: true, trim: true },
  addressLine: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  isDefault: { type: Boolean, default: false },
  location: { type: pointSchema, default: undefined },
});

export interface IUser extends Document {
  firebaseUid: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  isApproved: boolean;       // admin approval — only required for kitchen & delivery
  avatar?: string;           // Cloudinary URL
  // kitchen / delivery only
  nidNumber?: string;
  nidImage?: string;         // Cloudinary URL
  // kitchen: কিচেনের এলাকা; user: ডিফল্ট ঠিকানার এলাকা (কিচেন সাজেশনের ডিফল্ট)
  areaId?: mongoose.Types.ObjectId;
  area?: string;             // এরিয়ার নাম (denormalized)
  buildingName?: string;
  buildingAddress?: string;  // kitchen: কিচেনের বিস্তারিত ঠিকানা
  // kitchen: ম্যাপে বসানো আসল লোকেশন। select:false — গ্রাহকের কাছে কখনো যায় না;
  // শুধু কিচেন নিজে, অ্যাডমিন আর অ্যাসাইন করা ডেলিভারি বয় (পিকআপ) স্পষ্টভাবে '+kitchenLocation' দিয়ে পায়
  kitchenLocation?: IGeoPoint;
  // user only — একাধিক সেভ করা ঠিকানা
  addresses: mongoose.Types.DocumentArray<IAddress & mongoose.Types.Subdocument>;
  // delivery only — admin-তৈরি এরিয়া থেকে নিজের ডেলিভারি এরিয়া বেছে নেওয়া
  deliveryAreaIds?: mongoose.Types.ObjectId[];
  isAvailable?: boolean;     // delivery only — এখন ডেলিভারি নিতে পারবে কিনা (অ্যাক্টিভ/অফ)
  // admin only — না থাকলে সুপার অ্যাডমিন (সব পারমিশন); থাকলে সেই রোলের পারমিশন
  staffRole?: mongoose.Types.ObjectId;
  // kitchen only
  kitchenName?: string;
  kitchenDescription?: string;
  rating?: number;
  totalRatings?: number;
  orderLimit?: number;       // admin-controlled
  walletBalance?: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    firebaseUid: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    role: {
      type: String,
      enum: ['admin', 'kitchen', 'user', 'delivery'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
    avatar: { type: String },
    nidNumber: { type: String },
    nidImage: { type: String },
    areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
    area: { type: String },
    buildingName: { type: String },
    buildingAddress: { type: String },
    kitchenLocation: { type: pointSchema, default: undefined, select: false },
    addresses: { type: [addressSchema], default: [] },
    deliveryAreaIds: [{ type: Schema.Types.ObjectId, ref: 'Area' }],
    isAvailable: { type: Boolean, default: true },
    staffRole: { type: Schema.Types.ObjectId, ref: 'StaffRole', default: null },
    kitchenName: { type: String },
    kitchenDescription: { type: String },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    orderLimit: { type: Number, default: 5 },
    walletBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, areaId: 1, isApproved: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
