import mongoose, { Document, Schema } from 'mongoose';

// ইংরেজি নাম থেকে URL/সার্চ-বান্ধব slug: "Mirpur 10" → "mirpur-10"
export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// name (বাংলা) + nameEn (ইংরেজি) + slug — বাংলা বা ইংরেজি যেকোনো ভাষায় সার্চ করা যায়
const bilingualFields = {
  name: { type: String, required: true, trim: true },
  nameEn: { type: String, trim: true, default: '' },
  slug: { type: String, trim: true, default: '', index: true },
  aliases: { type: [String], default: [] },   // বিকল্প বানান, যেমন Comilla, Chakbazar
};

function setSlug(this: { nameEn?: string; slug?: string; isModified: (p: string) => boolean }) {
  if (this.isModified('nameEn')) this.slug = slugify(this.nameEn ?? '');
}

// লোকেশন হায়ারার্কি: City → Thana → Area
// কিচেন সাজেশন, ডেলিভারি চার্জ ও ডেলিভারি বয় ম্যাচিং Area-ভিত্তিক।
// Area-র center point (lat/lng) শুধু "আশেপাশের এলাকা" বের করার জন্য — ইউজারের লাইভ লোকেশন নয়।

export interface ICity extends Document {
  name: string;
  nameEn: string;
  slug: string;
  aliases: string[];
  isActive: boolean;
}

const citySchema = new Schema<ICity>(
  {
    ...bilingualFields,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
citySchema.index({ name: 1 }, { unique: true });
citySchema.pre('save', setSlug);

export const City = mongoose.model<ICity>('City', citySchema);

export interface IThana extends Document {
  name: string;
  nameEn: string;
  slug: string;
  aliases: string[];
  city: mongoose.Types.ObjectId;
  isActive: boolean;
}

const thanaSchema = new Schema<IThana>(
  {
    ...bilingualFields,
    city: { type: Schema.Types.ObjectId, ref: 'City', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
thanaSchema.index({ city: 1, name: 1 }, { unique: true });
thanaSchema.pre('save', setSlug);

export const Thana = mongoose.model<IThana>('Thana', thanaSchema);

export interface IArea extends Document {
  name: string;
  nameEn: string;
  slug: string;
  aliases: string[];
  thana: mongoose.Types.ObjectId;
  city: mongoose.Types.ObjectId;   // denormalized — thana.city
  zipCode: string;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat] — এলাকার আনুমানিক কেন্দ্র
  };
  isActive: boolean;
}

const areaSchema = new Schema<IArea>(
  {
    ...bilingualFields,
    thana: { type: Schema.Types.ObjectId, ref: 'Thana', required: true },
    city: { type: Schema.Types.ObjectId, ref: 'City', required: true },
    zipCode: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
areaSchema.index({ thana: 1, name: 1 }, { unique: true });
areaSchema.index({ zipCode: 1 });
areaSchema.pre('save', setSlug);
areaSchema.index({ location: '2dsphere' }, { sparse: true });

export const Area = mongoose.model<IArea>('Area', areaSchema);

// ─── রাস্তার দূরত্বের ক্যাশ ─────────────────────────────────
// দুটো নির্দিষ্ট বিন্দুর (এরিয়ার কেন্দ্র বা ম্যাপের পিন) রাস্তার দূরত্ব একবার মেপে রাখা হয়;
// পরের বার একই জোড়ার জন্য রাউটিং API আর ডাকা হয় না। key = দুই বিন্দু (৫ দশমিক পর্যন্ত, ছোটটা আগে)।
export interface IRouteDistance extends Document {
  key: string;
  km: number;
  provider: string;
}

const routeDistanceSchema = new Schema<IRouteDistance>(
  {
    key: { type: String, required: true, unique: true },
    km: { type: Number, required: true },
    provider: { type: String, default: 'openrouteservice' },
  },
  { timestamps: true }
);

export const RouteDistance = mongoose.model<IRouteDistance>('RouteDistance', routeDistanceSchema);
