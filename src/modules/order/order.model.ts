import mongoose, { Document, Schema } from 'mongoose';

export type OrderStatus =
  | 'pending'       // ইউজার অর্ডার করেছে, কিচেন এখনো দেখেনি
  | 'accepted'      // কিচেন accept করেছে
  | 'rejected'      // কিচেন reject করেছে
  | 'ready'         // রান্না শেষ, ডেলিভারির জন্য প্রস্তুত
  | 'picked_up'     // ডেলিভারি বয় নিয়েছে
  | 'delivered'     // ইউজারের কাছে পৌঁছেছে
  | 'cancelled'     // ক্যান্সেল হয়েছে
  | 'resell'        // Accept-এর পর ক্যান্সেল → resell তালিকায়
  | 'resold';       // রিসেল হয়ে গেছে

export interface IOrderItem {
  foodItem: mongoose.Types.ObjectId;
  quantity: number;
  price: number;
}

export interface IOrder extends Document {
  user: mongoose.Types.ObjectId;
  kitchen: mongoose.Types.ObjectId;
  items: IOrderItem[];
  totalAmount: number;
  deliveryCharge: number;
  status: OrderStatus;
  uniqueCode: string;
  buildingName: string;
  deliveryAddress: string;
  area: string;
  // resell fields
  isResell: boolean;
  originalUser?: mongoose.Types.ObjectId;
  resellPrice?: number;
  resellBuyer?: mongoose.Types.ObjectId;
  // payment
  isPaid: boolean;
  paymentMethod?: 'sslcommerz' | 'cash';
  transactionId?: string;
  // delivery
  deliveryBoy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kitchen: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        foodItem: { type: Schema.Types.ObjectId, ref: 'FoodItem', required: true },
        quantity: { type: Number, default: 1 },
        price: { type: Number, required: true },
      },
    ],
    totalAmount: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'ready', 'picked_up', 'delivered', 'cancelled', 'resell', 'resold'],
      default: 'pending',
    },
    uniqueCode: { type: String, required: true, unique: true },
    buildingName: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    area: { type: String, required: true },
    isResell: { type: Boolean, default: false },
    originalUser: { type: Schema.Types.ObjectId, ref: 'User' },
    resellPrice: { type: Number },
    resellBuyer: { type: Schema.Types.ObjectId, ref: 'User' },
    isPaid: { type: Boolean, default: false },
    paymentMethod: { type: String, enum: ['sslcommerz', 'cash'] },
    transactionId: { type: String },
    deliveryBoy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

orderSchema.index({ buildingName: 1, area: 1, status: 1 });

export const Order = mongoose.model<IOrder>('Order', orderSchema);
