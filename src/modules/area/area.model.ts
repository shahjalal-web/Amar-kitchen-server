import mongoose, { Document, Schema } from 'mongoose';

export interface IArea extends Document {
  name: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  radiusKm: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const areaSchema = new Schema<IArea>(
  {
    name: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'], required: true },
      coordinates: { type: [Number], required: true },
    },
    radiusKm: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

areaSchema.index({ location: '2dsphere' });

export const Area = mongoose.model<IArea>('Area', areaSchema);
