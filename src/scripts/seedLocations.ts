import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { City, Thana, Area, slugify } from '../modules/location/location.model';
import { BD_LOCATIONS, ALIASES } from './data/bdLocations';

// শহর → থানা → এরিয়া সিড। আবার চালালে নতুনগুলো যোগ হয় এবং সিড-ডেটার জিপ/কোঅর্ডিনেট আপডেট হয়;
// admin-এর নিজে যোগ করা এরিয়া মোছে না।
async function seedLocations() {
  await connectDB();

  // পুরনো (থানা ছাড়া) ফরম্যাটের এরিয়া থাকলে মুছে দাও
  const legacy = await Area.deleteMany({ thana: { $exists: false } });
  if (legacy.deletedCount) console.log(`পুরনো ফরম্যাটের ${legacy.deletedCount}টি এরিয়া মুছে ফেলা হয়েছে`);
  await Area.syncIndexes();

  let thanaCount = 0;
  let areaCount = 0;
  for (const c of BD_LOCATIONS) {
    const city = await City.findOneAndUpdate(
      { name: c.name },
      { $set: { nameEn: c.nameEn, slug: slugify(c.nameEn), aliases: ALIASES[c.nameEn] ?? [] }, $setOnInsert: { name: c.name, isActive: true } },
      { upsert: true, returnDocument: 'after' }
    );
    for (const t of c.thanas) {
      const thana = await Thana.findOneAndUpdate(
        { city: city._id, name: t.name },
        { $set: { nameEn: t.nameEn, slug: slugify(t.nameEn), aliases: ALIASES[t.nameEn] ?? [] }, $setOnInsert: { city: city._id, name: t.name, isActive: true } },
        { upsert: true, returnDocument: 'after' }
      );
      thanaCount++;
      for (const [name, nameEn, zipCode, lat, lng] of t.areas) {
        await Area.updateOne(
          { thana: thana._id, name },
          {
            $set: { nameEn, slug: slugify(nameEn), aliases: ALIASES[nameEn] ?? [], zipCode, city: city._id, location: { type: 'Point', coordinates: [lng, lat] } },
            $setOnInsert: { thana: thana._id, name, isActive: true },
          },
          { upsert: true }
        );
        areaCount++;
      }
    }
    console.log(`✓ ${c.name}: ${c.thanas.length}টি থানা`);
  }

  console.log(`মোট ${BD_LOCATIONS.length}টি শহর, ${thanaCount}টি থানা, ${areaCount}টি এরিয়া সিড হয়েছে`);
  await mongoose.disconnect();
}

seedLocations().catch((err) => {
  console.error(err);
  process.exit(1);
});
