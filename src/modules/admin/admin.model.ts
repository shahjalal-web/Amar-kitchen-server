import mongoose, { Document, Schema } from 'mongoose';

// ==================== Master Food Item ====================
export interface IFoodItem extends Document {
  name: string;
  image: string;        // Cloudinary URL
  category: 'ভাত' | 'রুটি' | 'মাছ' | 'মাংস' | 'সবজি' | 'ডাল' | 'সালাদ' | 'পানীয়' | 'অন্যান্য';
  isActive: boolean;
}

const foodItemSchema = new Schema<IFoodItem>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    image: { type: String, required: true },
    category: {
      type: String,
      enum: ['ভাত', 'রুটি', 'মাছ', 'মাংস', 'সবজি', 'ডাল', 'সালাদ', 'পানীয়', 'অন্যান্য'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

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
  deliveryBaseFee: number;
  deliveryDiscountPercentPerOrder: number; // প্রতি অতিরিক্ত অর্ডারে কত % ছাড়
  maxDeliveryDiscount: number;             // সর্বোচ্চ ছাড়ের সীমা (%)
  commissionRate: number;                  // admin commission %
  updatedBy: mongoose.Types.ObjectId;
}

const globalConfigSchema = new Schema<IGlobalConfig>(
  {
    defaultOrderLimit: { type: Number, default: 5 },
    deliveryBaseFee: { type: Number, default: 50 },
    deliveryDiscountPercentPerOrder: { type: Number, default: 10 },
    maxDeliveryDiscount: { type: Number, default: 70 },
    commissionRate: { type: Number, default: 10 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const GlobalConfig = mongoose.model<IGlobalConfig>('GlobalConfig', globalConfigSchema);
