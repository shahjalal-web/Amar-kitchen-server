import jwt from 'jsonwebtoken';
import { getAuth } from 'firebase-admin/auth';
import { User, IUser, UserRole } from './auth.model';
import { Area } from '../location/location.model';
import { getActiveAreaOrThrow, AREA_POPULATE } from '../location/location.service';

export interface RegisterDTO {
  firebaseToken: string;
  name: string;
  phone: string;
  role: UserRole;
  areaId?: string;            // user ও kitchen-এর জন্য বাধ্যতামূলক
  deliveryAreaIds?: string[]; // delivery — এক বা একাধিক এরিয়া
  buildingName?: string;      // user — প্রথম ঠিকানার বিল্ডিং
  buildingAddress?: string;   // user — প্রথম ঠিকানার বিস্তারিত; kitchen — কিচেনের ঠিকানা
  kitchenName?: string;
  kitchenDescription?: string;
  nidNumber?: string;
  nidImage?: string;
}

const SELF_REGISTER_ROLES: UserRole[] = ['user', 'kitchen', 'delivery'];

const signJwt = (user: IUser): string =>
  jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
  );

const validDeliveryAreaIds = async (ids?: string[]) => {
  if (!ids?.length) return [];
  const valid = await Area.find({ _id: { $in: ids }, isActive: true }).select('_id');
  return valid.map((a) => a._id);
};

export const registerUser = async (dto: RegisterDTO) => {
  const decoded = await getAuth().verifyIdToken(dto.firebaseToken);

  const existing = await User.findOne({ firebaseUid: decoded.uid });
  if (existing) {
    return { user: existing, token: signJwt(existing) };
  }

  // admin রোল কেউ নিজে রেজিস্ট্রেশন করে নিতে পারবে না
  if (!SELF_REGISTER_ROLES.includes(dto.role)) throw new Error('অবৈধ রোল');

  const needsApproval = dto.role === 'kitchen' || dto.role === 'delivery';
  const fields: Record<string, unknown> = {};

  if (dto.role === 'user' || dto.role === 'kitchen') {
    const area = await getActiveAreaOrThrow(dto.areaId);
    fields.areaId = area._id;
    fields.area = area.name;

    if (dto.role === 'user') {
      if (!dto.buildingName?.trim() || !dto.buildingAddress?.trim()) {
        throw new Error('বিল্ডিংয়ের নাম ও বিস্তারিত ঠিকানা দিন');
      }
      fields.addresses = [{
        label: 'বাসা',
        areaId: area._id,
        buildingName: dto.buildingName.trim(),
        addressLine: dto.buildingAddress.trim(),
        phone: dto.phone,
        isDefault: true,
      }];
    } else {
      fields.buildingAddress = dto.buildingAddress?.trim();
    }
  }

  if (dto.role === 'delivery') {
    fields.deliveryAreaIds = await validDeliveryAreaIds(dto.deliveryAreaIds);
  }

  const user = await User.create({
    firebaseUid: decoded.uid,
    name: dto.name,
    email: decoded.email,
    phone: dto.phone,
    role: dto.role,
    isApproved: !needsApproval,
    ...fields,
    kitchenName: dto.kitchenName,
    kitchenDescription: dto.kitchenDescription,
    nidNumber: dto.nidNumber,
    nidImage: dto.nidImage,
  });

  return { user, token: signJwt(user) };
};

export const loginUser = async (firebaseToken: string) => {
  const decoded = await getAuth().verifyIdToken(firebaseToken);
  const user = await User.findOne({ firebaseUid: decoded.uid });

  if (!user) throw new Error('ব্যবহারকারী পাওয়া যায়নি। প্রথমে রেজিস্ট্রেশন করুন।');
  if (!user.isActive) throw new Error('আপনার একাউন্ট বন্ধ করা হয়েছে।');

  return { user, token: signJwt(user) };
};

export const getProfile = (userId: string) =>
  User.findById(userId).select('-firebaseUid');

export interface UpdateProfileDTO {
  name?: string;
  phone?: string;
  areaId?: string;
  buildingAddress?: string;
  kitchenName?: string;
  kitchenDescription?: string;
  deliveryAreaIds?: string[];
}

// নিজের প্রোফাইল আপডেট — রোল/অ্যাপ্রুভাল/ওয়ালেট এখান থেকে বদলানো যাবে না।
// ইউজারের ঠিকানা আলাদা /auth/addresses এন্ডপয়েন্টে।
export const updateProfile = async (userId: string, dto: UpdateProfileDTO) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('ব্যবহারকারী পাওয়া যায়নি');

  const update: Record<string, unknown> = {};
  if (dto.name?.trim()) update.name = dto.name.trim();
  if (dto.phone?.trim()) update.phone = dto.phone.trim();

  if (user.role === 'kitchen') {
    if (dto.areaId !== undefined) {
      const area = await getActiveAreaOrThrow(dto.areaId);
      update.areaId = area._id;
      update.area = area.name;
    }
    if (dto.kitchenName?.trim()) update.kitchenName = dto.kitchenName.trim();
    if (dto.kitchenDescription !== undefined) update.kitchenDescription = dto.kitchenDescription.trim();
    if (dto.buildingAddress !== undefined) update.buildingAddress = dto.buildingAddress.trim();
  }

  if (user.role === 'delivery' && dto.deliveryAreaIds !== undefined) {
    update.deliveryAreaIds = await validDeliveryAreaIds(dto.deliveryAreaIds);
  }

  return User.findByIdAndUpdate(userId, update, { new: true }).select('-firebaseUid');
};

// ─── ঠিকানা বই (শুধু user রোল) ───────────────────────────
export interface AddressDTO {
  label?: string;
  areaId?: string;
  buildingName?: string;
  addressLine?: string;
  phone?: string;
  isDefault?: boolean;
}

const populateAddresses = (userId: string) =>
  User.findById(userId)
    .select('addresses areaId area')
    .populate({ path: 'addresses.areaId', populate: AREA_POPULATE });

export const listAddresses = async (userId: string) => {
  const user = await populateAddresses(userId);
  return user?.addresses ?? [];
};

// ডিফল্ট ঠিকানা বদলালে user.areaId/area-ও মিলিয়ে রাখো (কিচেন সাজেশনের ডিফল্ট)
const syncDefault = async (user: IUser, defaultId?: string) => {
  if (user.addresses.length === 0) {
    user.set({ areaId: undefined, area: undefined });
    return;
  }
  const target = (defaultId && user.addresses.id(defaultId)) || user.addresses.find((a) => a.isDefault) || user.addresses[0];
  user.addresses.forEach((a) => { a.isDefault = String(a._id) === String(target._id); });
  const area = await Area.findById(target.areaId).select('name');
  user.areaId = target.areaId;
  user.area = area?.name;
};

export const addAddress = async (userId: string, dto: AddressDTO) => {
  const user = await User.findById(userId);
  if (!user || user.role !== 'user') throw new Error('শুধু গ্রাহক ঠিকানা সেভ করতে পারবেন');
  if (user.addresses.length >= 10) throw new Error('সর্বোচ্চ ১০টি ঠিকানা সেভ করা যাবে');

  const area = await getActiveAreaOrThrow(dto.areaId);
  if (!dto.buildingName?.trim() || !dto.addressLine?.trim()) throw new Error('বিল্ডিংয়ের নাম ও বিস্তারিত ঠিকানা দিন');

  user.addresses.push({
    label: dto.label?.trim() || 'বাসা',
    areaId: area._id,
    buildingName: dto.buildingName.trim(),
    addressLine: dto.addressLine.trim(),
    phone: dto.phone?.trim() || user.phone,
    isDefault: false,
  });
  const created = user.addresses[user.addresses.length - 1];
  await syncDefault(user, dto.isDefault || user.addresses.length === 1 ? String(created._id) : undefined);
  await user.save();
  return { address: created, addresses: await listAddresses(userId) };
};

export const updateAddress = async (userId: string, addressId: string, dto: AddressDTO) => {
  const user = await User.findById(userId);
  const address = user?.addresses.id(addressId);
  if (!user || !address) throw new Error('ঠিকানা পাওয়া যায়নি');

  if (dto.areaId !== undefined) address.areaId = (await getActiveAreaOrThrow(dto.areaId))._id as typeof address.areaId;
  if (dto.label !== undefined) address.label = dto.label.trim() || 'বাসা';
  if (dto.buildingName !== undefined) {
    if (!dto.buildingName.trim()) throw new Error('বিল্ডিংয়ের নাম দিন');
    address.buildingName = dto.buildingName.trim();
  }
  if (dto.addressLine !== undefined) {
    if (!dto.addressLine.trim()) throw new Error('বিস্তারিত ঠিকানা দিন');
    address.addressLine = dto.addressLine.trim();
  }
  if (dto.phone !== undefined) address.phone = dto.phone.trim();

  await syncDefault(user, dto.isDefault ? addressId : undefined);
  await user.save();
  return listAddresses(userId);
};

export const deleteAddress = async (userId: string, addressId: string) => {
  const user = await User.findById(userId);
  const address = user?.addresses.id(addressId);
  if (!user || !address) throw new Error('ঠিকানা পাওয়া যায়নি');
  address.deleteOne();
  await syncDefault(user);
  await user.save();
  return listAddresses(userId);
};
