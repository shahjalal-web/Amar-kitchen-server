import 'dotenv/config';
import connectDB from '../config/db';
import { initFirebase } from '../config/firebase';
import { getAuth } from 'firebase-admin/auth';
import { User } from '../modules/auth/auth.model';

// ক্রেডেনশিয়াল .env থেকে — কোডে পাসওয়ার্ড রাখা যাবে না
const ADMIN_EMAIL = process.env.ADMIN_EMAIL as string;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD as string;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Shokher Kitchen Admin';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '01700000000';

async function seedAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    throw new Error('.env-এ ADMIN_EMAIL ও ADMIN_PASSWORD (ন্যূনতম ৮ অক্ষর) দিন');
  }
  await connectDB();
  initFirebase();

  let firebaseUid: string;
  try {
    const existing = await getAuth().getUserByEmail(ADMIN_EMAIL);
    firebaseUid = existing.uid;
    // পাসওয়ার্ড .env-এর সাথে মিলিয়ে রাখো
    await getAuth().updateUser(firebaseUid, { password: ADMIN_PASSWORD, emailVerified: true });
    console.log('Firebase user already exists, password synced:', firebaseUid);
  } catch {
    const created = await getAuth().createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: ADMIN_NAME,
      emailVerified: true,
    });
    firebaseUid = created.uid;
    console.log('Firebase user created:', firebaseUid);
  }

  const existingDoc = await User.findOne({ email: ADMIN_EMAIL });
  if (existingDoc) {
    await User.updateOne(
      { _id: existingDoc._id },
      { role: 'admin', isApproved: true, isActive: true, firebaseUid }
    );
    console.log('Admin MongoDB doc updated');
  } else {
    await User.create({
      firebaseUid,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      phone: ADMIN_PHONE,
      role: 'admin',
      isApproved: true,
      isActive: true,
    });
    console.log('Admin MongoDB doc created');
  }

  console.log('\n✅ Admin account ready!');
  console.log('   Email   :', ADMIN_EMAIL);
  console.log('   Password: (.env-এর ADMIN_PASSWORD)');
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
