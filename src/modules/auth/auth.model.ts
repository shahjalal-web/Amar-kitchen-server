import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'admin' | 'kitchen' | 'user' | 'delivery';

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
  // user only — for cluster delivery grouping
  buildingName?: string;
  buildingAddress?: string;
  area?: string;
  // লাইভ/প্রোফাইল লোকেশন — সব রোলের জন্য (kitchen: কিচেনের লোকেশন, delivery: ডেলিভারি বয়ের বেস লোকেশন, user: লাইভ লোকেশন)
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  // delivery only — admin-তৈরি এরিয়া থেকে নিজের ডেলিভারি এরিয়া বেছে নেওয়া
  deliveryAreaIds?: mongoose.Types.ObjectId[];
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
    buildingName: { type: String },
    buildingAddress: { type: String },
    area: { type: String },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    deliveryAreaIds: [{ type: Schema.Types.ObjectId, ref: 'Area' }],
    kitchenName: { type: String },
    kitchenDescription: { type: String },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    orderLimit: { type: Number, default: 5 },
    walletBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ location: '2dsphere' }, { sparse: true });

export const User = mongoose.model<IUser>('User', userSchema);
