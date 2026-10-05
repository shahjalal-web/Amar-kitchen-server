import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { FoodItem } from '../modules/admin/admin.model';
import { publicIdFromUrl } from '../utils/images';

// পুরনো খাবার (শুধু image ফিল্ড) → images[{url, publicId, credit}]; বারবার চালালেও সমস্যা নেই
(async () => {
  await connectDB();
  const foods = await FoodItem.find({ $or: [{ images: { $exists: false } }, { images: { $size: 0 } }] });
  let done = 0;
  for (const f of foods) {
    const publicId = publicIdFromUrl(f.image);
    if (!publicId) { console.warn(`⚠️ ${f.name}: Cloudinary URL নয়, বাদ (${f.image})`); continue; }
    f.images = [{ url: f.image, publicId, credit: f.imageCredit }] as typeof f.images;
    await f.save();
    done++;
  }
  console.log(`✅ ${done}/${foods.length}টি খাবারের ছবি নতুন ফরম্যাটে নেওয়া হয়েছে`);
  await mongoose.disconnect();
})().catch((err) => { console.error('❌', err); process.exit(1); });
