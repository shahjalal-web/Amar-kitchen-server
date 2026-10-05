import mongoose, { Document, Schema } from 'mongoose';

// ==================== Food Item ====================
// source: 'admin' = অ্যাডমিনের মাস্টার লাইব্রেরি (সব কিচেন ব্যবহার করতে পারে, সার্চে আগে দেখায়)
//         'kitchen' = কোনো কিচেন মালিকের নিজের তৈরি খাবার (শুধু সেই কিচেনের মেনুতে)
export type FoodSource = 'admin' | 'kitchen';

export interface IFoodItem extends Document {
  name: string;
  image: string;        // Cloudinary URL
  imageCredit?: string; // ছবির উৎস/লাইসেন্স (যেমন Wikimedia Commons, CC BY-SA)
  category: 'ভাত' | 'রুটি' | 'মাছ' | 'মাংস' | 'সবজি' | 'ডাল' | 'সালাদ' | 'পানীয়' | 'অন্যান্য';
  source: FoodSource;
  kitchen?: mongoose.Types.ObjectId;   // source === 'kitchen' হলে মালিক
  createdBy?: mongoose.Types.ObjectId;
  isActive: boolean;
}

const foodItemSchema = new Schema<IFoodItem>(
  {
    name: { type: String, required: true, trim: true },
    image: { type: String, required: true },
    imageCredit: { type: String, trim: true },
    source: { type: String, enum: ['admin', 'kitchen'], default: 'admin', index: true },
    kitchen: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    category: {
      type: String,
      enum: ['ভাত', 'রুটি', 'মাছ', 'মাংস', 'সবজি', 'ডাল', 'সালাদ', 'পানীয়', 'অন্যান্য'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// নাম ইউনিক: অ্যাডমিন লাইব্রেরির মধ্যে, এবং প্রতিটি কিচেনের নিজের খাবারের মধ্যে আলাদাভাবে
foodItemSchema.index({ name: 1, kitchen: 1 }, { unique: true });

export const FoodItem = mongoose.model<IFoodItem>('FoodItem', foodItemSchema);

// ==================== Package Template ====================
export type PackageTier = 'economy' | 'standard' | 'premium';

export interface IPackageItem {
  foodItem: mongoose.Types.ObjectId;
  quantity: number;
}

export interface IPackage extends Document {
  name: string;
  tier: PackageTier;
  items: IPackageItem[];
  basePrice: number;
  isActive: boolean;
}

const packageSchema = new Schema<IPackage>(
  {
    name: { type: String, required: true, trim: true },
    tier: { type: String, enum: ['economy', 'standard', 'premium'], required: true },
    items: [
      {
        foodItem: { type: Schema.Types.ObjectId, ref: 'FoodItem', required: true },
        quantity: { type: Number, default: 1 },
      },
    ],
    basePrice: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Package = mongoose.model<IPackage>('Package', packageSchema);

// ==================== Global Config ====================
export interface IGlobalConfig extends Document {
  defaultOrderLimit: number;
  deliveryBaseFee: number;                 // অন্য থানার ডেলিভারি চার্জ
  sameAreaDeliveryFee: number;             // কিচেন ও গ্রাহক একই এরিয়ায়
  sameThanaDeliveryFee: number;            // একই থানার অন্য এরিয়ায়
  nearbyRadiusKm: number;                  // "আশেপাশের টপ কিচেন" খোঁজার পরিধি
  deliveryDiscountPercentPerOrder: number; // প্রতি অতিরিক্ত অর্ডারে কত % ছাড়
  maxDeliveryDiscount: number;             // সর্বোচ্চ ছাড়ের সীমা (%)
  commissionRate: number;                  // admin commission %
  updatedBy: mongoose.Types.ObjectId;
}

const globalConfigSchema = new Schema<IGlobalConfig>(
  {
    defaultOrderLimit: { type: Number, default: 5 },
    deliveryBaseFee: { type: Number, default: 50 },
    sameAreaDeliveryFee: { type: Number, default: 20 },
    sameThanaDeliveryFee: { type: Number, default: 35 },
    nearbyRadiusKm: { type: Number, default: 3 },
    deliveryDiscountPercentPerOrder: { type: Number, default: 10 },
    maxDeliveryDiscount: { type: Number, default: 70 },
    commissionRate: { type: Number, default: 10 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const GlobalConfig = mongoose.model<IGlobalConfig>('GlobalConfig', globalConfigSchema);
