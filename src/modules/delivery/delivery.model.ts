import mongoose, { Document, Schema } from 'mongoose';

export interface IDeliveryTask extends Document {
  deliveryBoy: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  earning: number;
  createdAt: Date;
}

const deliveryTaskSchema = new Schema<IDeliveryTask>(
  {
    deliveryBoy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    earning: { type: Number, required: true },
  },
  { timestamps: true }
);

export const DeliveryTask = mongoose.model<IDeliveryTask>('DeliveryTask', deliveryTaskSchema);
