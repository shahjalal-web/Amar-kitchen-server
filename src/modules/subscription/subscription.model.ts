import mongoose, { Document, Schema } from 'mongoose';

export type SubStatus = 'active' | 'cancel_pending' | 'cancelled';

export interface ISubscription extends Document {
  user: mongoose.Types.ObjectId;
  kitchen: mongoose.Types.ObjectId;
  package?: mongoose.Types.ObjectId;    // admin package (optional — custom items also allowed)
  customItems: { foodItem: mongoose.Types.ObjectId; quantity: number; price: number }[];
  totalDailyAmount: number;
  status: SubStatus;
  cancelRequestedAt?: Date;             // কখন cancel request করা হয়েছিল
  cancelEffectiveDate?: string;         // YYYY-MM-DD — কবে থেকে কার্যকর হবে
  startDate: string;
  endDate?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kitchen: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    package: { type: Schema.Types.ObjectId, ref: 'Package' },
    customItems: [
      {
        foodItem: { type: Schema.Types.ObjectId, ref: 'FoodItem' },
        quantity: { type: Number, default: 1 },
        price: { type: Number, required: true },
      },
    ],
    totalDailyAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['active', 'cancel_pending', 'cancelled'],
      default: 'active',
    },
    cancelRequestedAt: { type: Date },
    cancelEffectiveDate: { type: String },
    startDate: { type: String, required: true },
    endDate: { type: String },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
