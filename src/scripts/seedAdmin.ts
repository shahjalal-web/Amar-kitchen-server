import 'dotenv/config';
import connectDB from '../config/db';
import { initFirebase } from '../config/firebase';
import { getAuth } from 'firebase-admin/auth';
import { User } from '../modules/auth/auth.model';

const ADMIN_EMAIL = 'shahjalal.profession@gmail.com';
const ADMIN_PASSWORD = 'asdfasdf';
const ADMIN_NAME = 'Shahjalal Admin';
const ADMIN_PHONE = '01700000000';

async function seedAdmin() {
  await connectDB();
  initFirebase();

  let firebaseUid: string;
  try {
    const existing = await getAuth().getUserByEmail(ADMIN_EMAIL);
    firebaseUid = existing.uid;
    console.log('Firebase user already exists:', firebaseUid);
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
  console.log('   Password:', ADMIN_PASSWORD);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
