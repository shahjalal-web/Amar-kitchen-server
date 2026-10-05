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

export type DeliveryMode = 'self' | 'delivery_boy';

export interface IStatusEvent {
  status: OrderStatus;
  at: Date;
  by?: mongoose.Types.ObjectId;
  role: 'user' | 'kitchen' | 'delivery' | 'admin' | 'system';
  note?: string;
}

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
  deliveryAddress: string;   // সম্পূর্ণ ঠিকানা (বিল্ডিং, বিস্তারিত, এরিয়া, থানা, শহর)
  customerPhone?: string;
  // লোকেশন snapshot — অর্ডারের সময়ের নাম (পরে admin নাম বদলালেও ইতিহাস ঠিক থাকে)
  area: string;
  thana?: string;
  city?: string;
  zipCode?: string;
  areaId?: mongoose.Types.ObjectId;  // ডেলিভারি বয় ম্যাচিং এর ভিত্তি
  kitchenAreaId?: mongoose.Types.ObjectId;
  // ডেলিভারি: কিচেন নিজে দেবে নাকি ডেলিভারি বয়
  deliveryLocation?: { type: 'Point'; coordinates: [number, number] }; // গ্রাহকের পিন (থাকলে) — কিচেন/ডেলিভারি বয়ের ম্যাপ লিংক
  distanceKm?: number;       // কিচেন → গ্রাহক রাস্তার দূরত্ব (অর্ডারের সময়)
  distanceSource?: 'road' | 'estimate';
  // ডেলিভার্ড হলে টাকার ভাগ (কমিশন কাটার পর)
  settlement?: {
    foodCommission: number; deliveryCommission: number;
    kitchenEarning: number; delivererEarning: number; platformEarning: number;
  };
  deliveryMode?: DeliveryMode;
  statusHistory: IStatusEvent[];
  // ডেলিভারি নিশ্চিতকরণ: পিকআপের সময় ৪ অঙ্কের কোড তৈরি হয়, শুধু গ্রাহক দেখেন (ইমেইল + অ্যাপ)।
  // ডেলিভারিকারী কোড দিলে অথবা গ্রাহক নিজে "খাবার পেয়েছি" চাপলে তবেই delivered।
  deliveryOtp?: string;
  deliveryOtpSentAt?: Date;
  deliveryOtpAttempts?: number;
  deliveredConfirmedBy?: 'otp' | 'customer';
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
    customerPhone: { type: String },
    area: { type: String, required: true },
    thana: { type: String },
    city: { type: String },
    zipCode: { type: String },
    kitchenAreaId: { type: Schema.Types.ObjectId, ref: 'Area' },
    deliveryMode: { type: String, enum: ['self', 'delivery_boy'] },
    deliveryLocation: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number] } },
    distanceKm: { type: Number },
    distanceSource: { type: String, enum: ['road', 'estimate'] },
    settlement: {
      foodCommission: Number, deliveryCommission: Number,
      kitchenEarning: Number, delivererEarning: Number, platformEarning: Number,
    },
    deliveryOtp: { type: String, select: false },
    deliveryOtpSentAt: { type: Date },
    deliveryOtpAttempts: { type: Number, default: 0, select: false },
    deliveredConfirmedBy: { type: String, enum: ['otp', 'customer'] },
    statusHistory: [
      {
        _id: false,
        status: { type: String, required: true },
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, required: true },
        note: { type: String },
      },
    ],
    areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
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

orderSchema.index({ buildingName: 1, areaId: 1, status: 1 });
orderSchema.index({ areaId: 1, status: 1 });
orderSchema.index({ deliveryBoy: 1, status: 1 });

export const Order = mongoose.model<IOrder>('Order', orderSchema);
