import jwt from 'jsonwebtoken';
import { getAuth } from 'firebase-admin/auth';
import { User, IUser, UserRole } from './auth.model';

export interface RegisterDTO {
  firebaseToken: string;
  name: string;
  phone: string;
  role: UserRole;
  buildingName?: string;
  buildingAddress?: string;
  area?: string;
  kitchenName?: string;
  kitchenDescription?: string;
  nidNumber?: string;
  nidImage?: string;
}

const signJwt = (user: IUser): string =>
  jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
  );

export const registerUser = async (dto: RegisterDTO) => {
  const decoded = await getAuth().verifyIdToken(dto.firebaseToken);

  const existing = await User.findOne({ firebaseUid: decoded.uid });
  if (existing) {
    return { user: existing, token: signJwt(existing) };
  }

  const needsApproval = dto.role === 'kitchen' || dto.role === 'delivery';

  const user = await User.create({
    firebaseUid: decoded.uid,
    name: dto.name,
    email: decoded.email,
    phone: dto.phone,
    role: dto.role,
    isApproved: !needsApproval,
    buildingName: dto.buildingName,
    buildingAddress: dto.buildingAddress,
    area: dto.area,
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

export const updateLocation = (userId: string, lat: number, lng: number) =>
  User.findByIdAndUpdate(
    userId,
    { location: { type: 'Point', coordinates: [lng, lat] } },
    { new: true }
  ).select('-firebaseUid');
