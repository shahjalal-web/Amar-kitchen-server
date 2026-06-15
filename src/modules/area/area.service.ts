import { Area } from './area.model';
import { User } from '../auth/auth.model';

const EARTH_RADIUS_KM = 6371;

export const createArea = (data: { name: string; lat: number; lng: number; radiusKm?: number }) =>
  Area.create({
    name: data.name,
    location: { type: 'Point', coordinates: [data.lng, data.lat] },
    radiusKm: data.radiusKm ?? 5,
  });

export const getActiveAreas = () => Area.find({ isActive: true }).sort({ name: 1 });

export const getAllAreas = () => Area.find().sort({ name: 1 });

export const updateArea = (
  id: string,
  data: Partial<{ name: string; lat: number; lng: number; radiusKm: number; isActive: boolean }>
) => {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm;
  if (data.isActive !== undefined) update.isActive = data.isActive;
  if (data.lat !== undefined && data.lng !== undefined) {
    update.location = { type: 'Point', coordinates: [data.lng, data.lat] };
  }
  return Area.findByIdAndUpdate(id, update, { new: true });
};

export const deactivateArea = (id: string) =>
  Area.findByIdAndUpdate(id, { isActive: false }, { new: true });

// নির্দিষ্ট পয়েন্টের radiusKm-এর মধ্যে থাকা approved কিচেনগুলো খুঁজো
export const findKitchensNear = (lng: number, lat: number, radiusKm: number) =>
  User.find({
    role: 'kitchen',
    isApproved: true,
    location: {
      $geoWithin: { $centerSphere: [[lng, lat], radiusKm / EARTH_RADIUS_KM] },
    },
  });
