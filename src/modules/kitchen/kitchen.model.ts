import mongoose, { Document, Schema } from 'mongoose';

// ==================== Daily Menu ====================
export interface IMenuItem {
  foodItem: mongoose.Types.ObjectId;
  price: number;
  isFree: boolean;
}

export interface IDailyMenu extends Document {
  kitchen: mongoose.Types.ObjectId;
  date: string;                       // YYYY-MM-DD format
  items: IMenuItem[];
  freeItems: mongoose.Types.ObjectId[];
  isPublished: boolean;
  isReadyForPickup: boolean;
  createdAt: Date;
}

const dailyMenuSchema = new Schema<IDailyMenu>(
  {
    kitchen: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    items: [
      {
        foodItem: { type: Schema.Types.ObjectId, ref: 'FoodItem', required: true },
        price: { type: Number, required: true },
        isFree: { type: Boolean, default: false },
      },
    ],
    freeItems: [{ type: Schema.Types.ObjectId, ref: 'FoodItem' }],
    isPublished: { type: Boolean, default: false },
    isReadyForPickup: { type: Boolean, default: false },
  },
  { timestamps: true }
);

dailyMenuSchema.index({ kitchen: 1, date: 1 }, { unique: true });

export const DailyMenu = mongoose.model<IDailyMenu>('DailyMenu', dailyMenuSchema);

// ==================== Withdrawal Request ====================
export type WithdrawStatus = 'pending' | 'approved' | 'rejected';

export interface IWithdrawal extends Document {
  kitchen: mongoose.Types.ObjectId;
  amount: number;
  bkashNumber: string;
  status: WithdrawStatus;
  processedAt?: Date;
  note?: string;
}

const withdrawalSchema = new Schema<IWithdrawal>(
  {
    kitchen: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    bkashNumber: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    processedAt: { type: Date },
    note: { type: String },
  },
  { timestamps: true }
);

export const Withdrawal = mongoose.model<IWithdrawal>('Withdrawal', withdrawalSchema);
