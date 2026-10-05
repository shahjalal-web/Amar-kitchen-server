import 'dotenv/config';
import mongoose from 'mongoose';
import { getAuth } from 'firebase-admin/auth';
import connectDB from '../config/db';
import { initFirebase } from '../config/firebase';
import { User } from '../modules/auth/auth.model';
import { Area } from '../modules/location/location.model';
import { FoodItem, Package, GlobalConfig, IFoodItem } from '../modules/admin/admin.model';
import { DailyMenu } from '../modules/kitchen/kitchen.model';
import { Order, OrderStatus, IStatusEvent } from '../modules/order/order.model';
import { DeliveryTask } from '../modules/delivery/delivery.model';
import { Subscription } from '../modules/subscription/subscription.model';

// ডেমো ডেটা: কিচেন, ডেলিভারি বয়, গ্রাহক, খাবার, প্যাকেজ, আজকের মেনু ও গত ১৪ দিনের অর্ডার।
// সব ডেমো একাউন্টের ইমেইল @demo.shokherkitchen.com — `npm run seed:demo -- --reset` দিলে শুধু এগুলোই মোছে।
const DOMAIN = 'demo.shokherkitchen.com';
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';
const RESET = process.argv.includes('--reset');

type Category = IFoodItem['category'];
// আসল ছবি: Wikimedia Commons থেকে নেওয়া (লাইসেন্স অনুযায়ী ক্রেডিটসহ), Cloudinary-তে হোস্ট করা
const FOOD_IMAGES: Record<string, { url: string; credit: string }> = {
  "সাদা ভাত": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087932/shokher-kitchen/foods/food-1.jpg",
    "credit": "ছবি: Anna Frodesiak — CC0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Steamed_rice_in_bowl_01.jpg)"
  },
  "খিচুড়ি": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087938/shokher-kitchen/foods/food-2.jpg",
    "credit": "ছবি: Souradeep.Dasgupta — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Khichuri_-_Bhog.jpg)"
  },
  "পোলাও": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087944/shokher-kitchen/foods/food-3.jpg",
    "credit": "ছবি: Sumit Surai — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Veg_Pulao_(Indian_fried_rice).jpg)"
  },
  "আটার রুটি": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087952/shokher-kitchen/foods/food-4.jpg",
    "credit": "ছবি: Euniceyeoh07 — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Chapati_roti.jpg)"
  },
  "পরোটা": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087958/shokher-kitchen/foods/food-5.jpg",
    "credit": "ছবি: Shahzaib Damn Cruze — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Paratha_is_a_dough_fried_flatbread_native_to_India_and_Pakistan.jpg)"
  },
  "রুই মাছের ঝোল": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087964/shokher-kitchen/foods/food-6.jpg",
    "credit": "ছবি: Srujay Dulapalli — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Rohu_Fish_Curry.jpg)"
  },
  "ইলিশ ভাজা": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087971/shokher-kitchen/foods/food-7.jpg",
    "credit": "ছবি: Marajozkee — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Fried_Ilish_fish.jpg)"
  },
  "মুরগির ঝোল": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087977/shokher-kitchen/foods/food-8.jpg",
    "credit": "ছবি: Gaurav Dhwaj Khadka — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Chicken_Curry_9.jpg)"
  },
  "গরুর মাংস ভুনা": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087982/shokher-kitchen/foods/food-9.jpg",
    "credit": "ছবি: Munni Akter Mim — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:%E0%A6%97%E0%A6%B0%E0%A7%81%E0%A6%B0_%E0%A6%9D%E0%A6%BE%E0%A6%B2_%E0%A6%AD%E0%A7%81%E0%A6%A8%E0%A6%BE.jpg)"
  },
  "মিক্সড সবজি": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087989/shokher-kitchen/foods/food-10.jpg",
    "credit": "ছবি: Miansari66 — CC0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Mixed_Vegetable_Curry.JPG)"
  },
  "মসুর ডাল": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791087995/shokher-kitchen/foods/food-11.jpg",
    "credit": "ছবি: Miansari66 — CC0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Kali_Masoor_Ki_Dal_Ka_Salan.JPG)"
  },
  "শসা-টমেটো সালাদ": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791088006/shokher-kitchen/foods/food-12.jpg",
    "credit": "ছবি: Voxbyrox — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Cucumber_onion_and_tomato_salad_with_mint_coriander_and_lemon.jpg)"
  },
  "বোরহানি": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791088011/shokher-kitchen/foods/food-13.jpg",
    "credit": "ছবি: Sumit Surai — CC BY-SA 3.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Food-Burhani-Ghol.jpg)"
  },
  "ডিম ভুনা": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791088017/shokher-kitchen/foods/food-14.jpg",
    "credit": "ছবি: https://onlybestrecipes.com/egg-curry-recipeegg-curry-recipe/ — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Spicy_Anda_Curry.jpg)"
  },
  "আলু ভর্তা": {
    "url": "https://res.cloudinary.com/dmclys9tv/image/upload/v1791088024/shokher-kitchen/foods/food-15.jpg",
    "credit": "ছবি: Sm faysal — CC BY-SA 4.0, Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Home_made_Alu_vorta_(Bengali_mashed_potato).jpg)"
  }
};

const FOODS: [string, Category, string, number][] = [
  // [নাম, ক্যাটাগরি, (পুরনো লেবেল — ব্যবহার হয় না), সাধারণ দাম]
  ['সাদা ভাত', 'ভাত', 'Rice', 25],
  ['খিচুড়ি', 'ভাত', 'Khichuri', 70],
  ['পোলাও', 'ভাত', 'Polao', 60],
  ['আটার রুটি', 'রুটি', 'Ruti', 10],
  ['পরোটা', 'রুটি', 'Paratha', 15],
  ['রুই মাছের ঝোল', 'মাছ', 'Rui Curry', 120],
  ['ইলিশ ভাজা', 'মাছ', 'Ilish Fry', 220],
  ['মুরগির ঝোল', 'মাংস', 'Chicken Curry', 140],
  ['গরুর মাংস ভুনা', 'মাংস', 'Beef Bhuna', 200],
  ['মিক্সড সবজি', 'সবজি', 'Mixed Veg', 50],
  ['আলু ভর্তা', 'সবজি', 'Alu Bhorta', 30],
  ['মসুর ডাল', 'ডাল', 'Dal', 30],
  ['শসা-টমেটো সালাদ', 'সালাদ', 'Salad', 25],
  ['বোরহানি', 'পানীয়', 'Borhani', 40],
  ['ডিম ভুনা', 'অন্যান্য', 'Egg Bhuna', 45],
];

interface PersonSeed { key: string; name: string; phone: string; area: string; city: string }
const KITCHENS: (PersonSeed & { kitchenName: string; desc: string; rating: number; approved?: boolean })[] = [
  { key: 'kitchen1', name: 'রহিমা বেগম', phone: '01810000001', area: 'কান্দিরপাড়', city: 'কুমিল্লা', kitchenName: 'রহিমার রান্নাঘর', desc: 'ঘরোয়া মাছ-ভাত, প্রতিদিন তাজা বাজার', rating: 4.8 },
  { key: 'kitchen2', name: 'সালমা আক্তার', phone: '01810000002', area: 'রাজগঞ্জ', city: 'কুমিল্লা', kitchenName: 'সালমার হেঁশেল', desc: 'খিচুড়ি আর ভুনা মাংসের জন্য বিখ্যাত', rating: 4.6 },
  { key: 'kitchen3', name: 'নাসরিন সুলতানা', phone: '01810000003', area: 'ঝাউতলা', city: 'কুমিল্লা', kitchenName: 'মায়ের হাতের রান্না', desc: 'কম তেল-মশলার স্বাস্থ্যকর খাবার', rating: 4.4 },
  { key: 'kitchen4', name: 'ফারহানা ইসলাম', phone: '01810000004', area: 'টমছম ব্রিজ', city: 'কুমিল্লা', kitchenName: 'ফারহানার কিচেন', desc: 'অফিসের লাঞ্চ বক্স স্পেশালিস্ট', rating: 4.2 },
  { key: 'kitchen5', name: 'শাহনাজ পারভীন', phone: '01810000005', area: 'ধানমন্ডি', city: 'ঢাকা', kitchenName: 'ধানমন্ডি হোম কিচেন', desc: 'পুরান ঢাকার স্বাদে ঘরের রান্না', rating: 4.7 },
  { key: 'kitchen6', name: 'রোকসানা হক', phone: '01810000006', area: 'মিরপুর ১০', city: 'ঢাকা', kitchenName: 'রোকসানার রসুই', desc: 'ব্যাচেলরদের জন্য সাশ্রয়ী মিল', rating: 4.5 },
  { key: 'kitchen7', name: 'তাহমিনা খাতুন', phone: '01810000007', area: 'উত্তরা সেক্টর ৭', city: 'ঢাকা', kitchenName: 'উত্তরা ঘরোয়া খাবার', desc: 'প্রতিদিন নতুন মেনু', rating: 4.3 },
  { key: 'kitchen8', name: 'জান্নাতুল ফেরদৌস', phone: '01810000008', area: 'মোহাম্মদপুর', city: 'ঢাকা', kitchenName: 'জান্নাতের হেঁশেল', desc: 'বিরিয়ানি ও পোলাও স্পেশাল', rating: 4.6 },
  { key: 'kitchen9', name: 'মরিয়ম বিবি', phone: '01810000009', area: 'চকবাজার', city: 'কুমিল্লা', kitchenName: 'নতুন কিচেন (অ্যাপ্রুভালের অপেক্ষায়)', desc: 'নতুন যোগ দিয়েছে', rating: 0, approved: false },
];
const DELIVERY_BOYS: (PersonSeed & { areas: string[]; approved?: boolean })[] = [
  { key: 'delivery1', name: 'রাকিব হাসান', phone: '01910000001', area: 'কান্দিরপাড়', city: 'কুমিল্লা', areas: ['কান্দিরপাড়', 'রাজগঞ্জ', 'মনোহরপুর', 'চকবাজার'] },
  { key: 'delivery2', name: 'সজীব আহমেদ', phone: '01910000002', area: 'ঝাউতলা', city: 'কুমিল্লা', areas: ['ঝাউতলা', 'বাগিচাগাঁও', 'রেসকোর্স', 'টমছম ব্রিজ'] },
  { key: 'delivery3', name: 'তানভীর রহমান', phone: '01910000003', area: 'রাজগঞ্জ', city: 'কুমিল্লা', areas: ['রাজগঞ্জ', 'কান্দিরপাড়', 'ঝাউতলা', 'টমছম ব্রিজ'] },
  { key: 'delivery4', name: 'আরিফ হোসেন', phone: '01910000004', area: 'ধানমন্ডি', city: 'ঢাকা', areas: ['ধানমন্ডি', 'কলাবাগান', 'লালমাটিয়া', 'মোহাম্মদপুর'] },
  { key: 'delivery5', name: 'মামুন মিয়া', phone: '01910000005', area: 'মিরপুর ১০', city: 'ঢাকা', areas: ['মিরপুর ১০', 'মিরপুর ২', 'কাজীপাড়া', 'মিরপুর ১১'] },
  { key: 'delivery6', name: 'জুবায়ের আলম', phone: '01910000006', area: 'উত্তরা সেক্টর ৭', city: 'ঢাকা', areas: ['উত্তরা সেক্টর ৭'], approved: false },
];
const CUSTOMERS: (PersonSeed & { building: string; line: string; office?: [string, string, string] })[] = [
  { key: 'user1', name: 'তানিয়া রহমান', phone: '01710000001', area: 'কান্দিরপাড়', city: 'কুমিল্লা', building: 'করিম টাওয়ার', line: 'ফ্ল্যাট ৪বি, রোড ২', office: ['রাজগঞ্জ', 'সোনালী ব্যাংক ভবন', '৩য় তলা'] },
  { key: 'user2', name: 'মাহমুদুল হাসান', phone: '01710000002', area: 'কান্দিরপাড়', city: 'কুমিল্লা', building: 'করিম টাওয়ার', line: 'ফ্ল্যাট ৬এ, রোড ২' },
  { key: 'user3', name: 'নুসরাত জাহান', phone: '01710000003', area: 'ঝাউতলা', city: 'কুমিল্লা', building: 'গ্রিন ভিউ', line: 'বাসা ১২, লেন ৩' },
  { key: 'user4', name: 'সাকিব আল মামুন', phone: '01710000004', area: 'ধানমন্ডি', city: 'ঢাকা', building: 'লেক ভিউ এপার্টমেন্ট', line: 'বাড়ি ২৭, রোড ৮এ', office: ['কারওয়ান বাজার', 'বিএসইসি ভবন', '৫ম তলা'] },
  { key: 'user5', name: 'ফাহিম মুনতাসির', phone: '01710000005', area: 'মিরপুর ১০', city: 'ঢাকা', building: 'শাপলা ম্যানশন', line: 'ব্লক সি, রোড ৪' },
  { key: 'user6', name: 'ইশরাত জাহান', phone: '01710000006', area: 'মোহাম্মদপুর', city: 'ঢাকা', building: 'রিং রোড হাইটস', line: 'ফ্ল্যাট ২সি' },
  { key: 'user7', name: 'রাফি চৌধুরী', phone: '01710000007', area: 'চকবাজার', city: 'কুমিল্লা', building: 'চৌধুরী ভিলা', line: 'হোল্ডিং ৪৫' },
];

const email = (key: string) => `${key}@${DOMAIN}`;

// কিছু কিচেনের নিজের তৈরি খাবার (ছবি অ্যাডমিন লাইব্রেরির একই ধরনের খাবারের)
const KITCHEN_FOODS: Record<string, { name: string; category: Category; price: number; imageOf: string }> = {
  kitchen1: { name: 'রহিমার স্পেশাল খিচুড়ি', category: 'ভাত', price: 90, imageOf: 'খিচুড়ি' },
  kitchen2: { name: 'সালমার কালা ভুনা', category: 'মাংস', price: 230, imageOf: 'গরুর মাংস ভুনা' },
  kitchen5: { name: 'পুরান ঢাকার মুরগি রেজালা', category: 'মাংস', price: 170, imageOf: 'মুরগির ঝোল' },
};
const rand = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const todayStr = () => new Date().toISOString().split('T')[0];

async function firebaseUid(key: string, name: string) {
  try {
    const u = await getAuth().getUserByEmail(email(key));
    await getAuth().updateUser(u.uid, { password: PASSWORD, emailVerified: true });
    return u.uid;
  } catch {
    const u = await getAuth().createUser({ email: email(key), password: PASSWORD, displayName: name, emailVerified: true });
    return u.uid;
  }
}

async function findArea(name: string, city: string) {
  const areas = await Area.find({ name }).populate('city', 'name');
  const a = areas.find((x) => (x.city as unknown as { name: string }).name === city);
  if (!a) throw new Error(`এরিয়া পাওয়া যায়নি: ${name} (${city}) — আগে npm run seed:locations চালান`);
  return a;
}

async function reset() {
  const demoUsers = await User.find({ email: new RegExp(`@${DOMAIN.replace(/\./g, '\\.')}$`) }).select('_id firebaseUid');
  const ids = demoUsers.map((u) => u._id);
  const orders = await Order.find({ $or: [{ user: { $in: ids } }, { kitchen: { $in: ids } }] }).select('_id');
  await DeliveryTask.deleteMany({ $or: [{ order: { $in: orders.map((o) => o._id) } }, { deliveryBoy: { $in: ids } }] });
  await Order.deleteMany({ _id: { $in: orders.map((o) => o._id) } });
  await DailyMenu.deleteMany({ kitchen: { $in: ids } });
  await FoodItem.deleteMany({ kitchen: { $in: ids } });
  await Subscription.deleteMany({ $or: [{ user: { $in: ids } }, { kitchen: { $in: ids } }] });
  await User.deleteMany({ _id: { $in: ids } });
  const demoFoods = await FoodItem.find({ name: { $in: FOODS.map(([n]) => n) }, source: { $ne: 'kitchen' } }).select('_id');
  await Package.deleteMany({ 'items.foodItem': { $in: demoFoods.map((f) => f._id) } });
  await FoodItem.deleteMany({ _id: { $in: demoFoods.map((f) => f._id) } });
  const uids = demoUsers.map((u) => u.firebaseUid).filter(Boolean);
  if (uids.length) await getAuth().deleteUsers(uids);
  console.log(`🧹 ${demoUsers.length}টি ডেমো একাউন্ট, ${orders.length}টি অর্ডার ও ${demoFoods.length}টি ডেমো খাবার মুছে ফেলা হয়েছে`);
}

async function seed() {
  await reset(); // বারবার চালালেও ডুপ্লিকেট হবে না
  await GlobalConfig.findOneAndUpdate({}, {}, { upsert: true, setDefaultsOnInsert: true });
  await FoodItem.syncIndexes(); // পুরনো name_1 unique index বাদ দিয়ে {name, kitchen} index বসাও

  // ─ খাবার ও প্যাকেজ
  const foods = [];
  for (const [name, category] of FOODS) {
    const { url: image, credit: imageCredit } = FOOD_IMAGES[name];
    foods.push(await FoodItem.findOneAndUpdate(
      { name, kitchen: null },
      { $set: { image, imageCredit, category, source: 'admin', isActive: true }, $setOnInsert: { name } },
      { upsert: true, returnDocument: 'after' }
    ));
  }
  const byName = new Map(foods.map((f) => [f.name, f]));
  const basePrice = new Map(FOODS.map(([n, , , p]) => [n, p]));
  const pkg = (names: string[]) => names.map((n) => ({ foodItem: byName.get(n)!._id, quantity: 1 }));
  await Package.create([
    { name: 'সাশ্রয়ী দুপুরের খাবার', tier: 'economy', items: pkg(['সাদা ভাত', 'মসুর ডাল', 'আলু ভর্তা', 'ডিম ভুনা']), basePrice: 110 },
    { name: 'স্ট্যান্ডার্ড মাছ-ভাত', tier: 'standard', items: pkg(['সাদা ভাত', 'রুই মাছের ঝোল', 'মিক্সড সবজি', 'মসুর ডাল']), basePrice: 190 },
    { name: 'প্রিমিয়াম ভোজ', tier: 'premium', items: pkg(['পোলাও', 'গরুর মাংস ভুনা', 'শসা-টমেটো সালাদ', 'বোরহানি']), basePrice: 320 },
  ]);

  // ─ কিচেন
  const kitchens = [];
  for (const k of KITCHENS) {
    const area = await findArea(k.area, k.city);
    kitchens.push(await User.create({
      firebaseUid: await firebaseUid(k.key, k.name), name: k.name, email: email(k.key), phone: k.phone, role: 'kitchen',
      isApproved: k.approved !== false, kitchenName: k.kitchenName, kitchenDescription: k.desc,
      areaId: area._id, area: area.name, buildingAddress: `${area.name} মেইন রোড`,
      rating: k.rating, totalRatings: k.rating ? randInt(20, 180) : 0, orderLimit: 30, nidNumber: `199${randInt(1000000, 9999999)}`,
    }));
  }
  const activeKitchens = kitchens.filter((k) => k.isApproved);

  // ─ আজকের মেনু (প্রতিটি অ্যাপ্রুভড কিচেনের ৫–৭টি আইটেম)
  const menuPrices = new Map<string, Map<string, number>>();
  for (const k of activeKitchens) {
    const picks = [...FOODS].sort(() => Math.random() - 0.5).slice(0, randInt(5, 7));
    const items = picks.map(([n]) => ({ foodItem: byName.get(n)!._id, price: basePrice.get(n)! + randInt(-2, 4) * 5 }));
    // কিচেন মালিকের নিজের তৈরি খাবার (ডেমো) — সার্চে অ্যাডমিন লাইব্রেরির পরে দেখাবে
    const own = KITCHEN_FOODS[KITCHENS.find((x) => email(x.key) === k.email)!.key];
    if (own) {
      const f = await FoodItem.create({
        name: own.name, category: own.category, image: FOOD_IMAGES[own.imageOf].url, imageCredit: FOOD_IMAGES[own.imageOf].credit,
        source: 'kitchen', kitchen: k._id, createdBy: k._id,
      });
      items.push({ foodItem: f._id, price: own.price });
    }
    menuPrices.set(k.id, new Map(items.map((it) => [String(it.foodItem), it.price])));
    await DailyMenu.create({ kitchen: k._id, date: todayStr(), items, freeItems: [byName.get('শসা-টমেটো সালাদ')!._id], isPublished: true });
  }

  // ─ ডেলিভারি বয়
  const boys = [];
  for (const d of DELIVERY_BOYS) {
    const base = await findArea(d.area, d.city);
    const areaIds = await Promise.all(d.areas.map((a) => findArea(a, d.city).then((x) => x._id)));
    boys.push(await User.create({
      firebaseUid: await firebaseUid(d.key, d.name), name: d.name, email: email(d.key), phone: d.phone, role: 'delivery',
      isApproved: d.approved !== false, isAvailable: d.approved !== false, deliveryAreaIds: areaIds, area: base.name, nidNumber: `199${randInt(1000000, 9999999)}`,
    }));
  }
  const activeBoys = boys.filter((b) => b.isApproved);

  // ─ গ্রাহক (বাসা + কারো কারো অফিস ঠিকানা)
  const customers = [];
  for (const c of CUSTOMERS) {
    const home = await findArea(c.area, c.city);
    const addresses = [{ label: 'বাসা', areaId: home._id, buildingName: c.building, addressLine: c.line, phone: c.phone, isDefault: true }];
    if (c.office) {
      const office = await findArea(c.office[0], c.city);
      addresses.push({ label: 'অফিস', areaId: office._id, buildingName: c.office[1], addressLine: c.office[2], phone: c.phone, isDefault: false });
    }
    customers.push(await User.create({
      firebaseUid: await firebaseUid(c.key, c.name), name: c.name, email: email(c.key), phone: c.phone, role: 'user',
      isApproved: true, areaId: home._id, area: home.name, addresses,
    }));
  }

  // ─ গত ১৪ দিনের অর্ডার (একই শহরের কিচেন থেকে)
  const areaInfo = new Map<string, { name: string; thana: string; city: string; zip: string; thanaId: string }>();
  for (const a of await Area.find({}).populate('thana', 'name').populate('city', 'name')) {
    areaInfo.set(a.id, {
      name: a.name, zip: a.zipCode, thanaId: String((a.thana as unknown as { _id: unknown })._id),
      thana: (a.thana as unknown as { name: string }).name, city: (a.city as unknown as { name: string }).name,
    });
  }
  const FINAL: OrderStatus[] = ['delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'cancelled', 'rejected'];
  const TODAY_STATUSES: OrderStatus[] = ['pending', 'pending', 'accepted', 'accepted', 'ready', 'picked_up', 'delivered', 'delivered'];
  let orderCount = 0;
  let code = randInt(0x10000000, 0x7fffffff);

  for (let day = 13; day >= 0; day--) {
    const perDay = day === 0 ? 10 : randInt(4, 12);
    for (let i = 0; i < perDay; i++) {
      const customer = rand(customers);
      const address = rand(customer.addresses);
      const cust = areaInfo.get(String(address.areaId))!;
      const cityKitchens = activeKitchens.filter((k) => areaInfo.get(String(k.areaId))?.city === cust.city);
      const kitchen = rand(cityKitchens);
      const prices = menuPrices.get(kitchen.id)!;
      const chosen = [...prices.entries()].sort(() => Math.random() - 0.5).slice(0, randInt(1, 3));
      const items = chosen.map(([foodItem, price]) => ({ foodItem, price, quantity: randInt(1, 2) }));
      const totalAmount = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const kInfo = areaInfo.get(String(kitchen.areaId))!;
      const deliveryCharge = String(kitchen.areaId) === String(address.areaId) ? 20 : kInfo.thanaId === cust.thanaId ? 35 : 50;

      const status = day === 0 ? rand(TODAY_STATUSES) : rand(FINAL);
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - day);
      createdAt.setHours(randInt(10, 20), randInt(0, 59), 0, 0);
      if (day === 0 && createdAt > new Date()) createdAt.setTime(Date.now() - randInt(5, 120) * 60000);

      const selfDelivery = Math.random() < 0.3;
      const boy = selfDelivery ? null : activeBoys.find((b) => b.deliveryAreaIds?.some((a) => String(a) === String(kitchen.areaId))) ?? null;
      const needsDelivery = ['ready', 'picked_up', 'delivered'].includes(status) || (status === 'accepted' && Math.random() < 0.5);

      // স্ট্যাটাসের ইতিহাস
      const flow: [OrderStatus, IStatusEvent['role']][] = [['pending', 'user']];
      if (status === 'rejected') flow.push(['rejected', 'kitchen']);
      else if (status === 'cancelled') flow.push(['cancelled', 'user']);
      else {
        const steps: OrderStatus[] = ['accepted', 'ready', 'picked_up', 'delivered'];
        for (const s of steps.slice(0, steps.indexOf(status) + 1)) {
          flow.push([s, s === 'picked_up' || s === 'delivered' ? (boy && !selfDelivery ? 'delivery' : 'kitchen') : 'kitchen']);
        }
      }
      const statusHistory = flow.map(([s, role], idx) => ({ status: s, role, at: new Date(createdAt.getTime() + idx * randInt(8, 25) * 60000) }));

      const order = await Order.create({
        user: customer._id, kitchen: kitchen._id, items, totalAmount, deliveryCharge,
        uniqueCode: (code++).toString(16).toUpperCase().padStart(8, '0').slice(-8),
        buildingName: address.buildingName,
        deliveryAddress: `${address.buildingName}, ${address.addressLine}, ${cust.name}, ${cust.thana}, ${cust.city}-${cust.zip}`,
        customerPhone: customer.phone, area: cust.name, thana: cust.thana, city: cust.city, zipCode: cust.zip,
        areaId: address.areaId, kitchenAreaId: kitchen.areaId, paymentMethod: 'cash', isPaid: status === 'delivered',
        status, statusHistory,
        deliveryMode: needsDelivery ? (boy ? 'delivery_boy' : 'self') : undefined,
        deliveryOtp: status === 'picked_up' ? String(randInt(1000, 9999)) : undefined,
        deliveryOtpSentAt: status === 'picked_up' ? statusHistory[statusHistory.length - 1].at : undefined,
        deliveredConfirmedBy: status === 'delivered' ? 'otp' : undefined,
        deliveryBoy: needsDelivery && boy ? boy._id : undefined,
      });
      const last = statusHistory[statusHistory.length - 1].at;
      await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt, updatedAt: last } });

      if (needsDelivery && boy && ['picked_up', 'delivered'].includes(status)) {
        const task = await DeliveryTask.create({
          deliveryBoy: boy._id, order: order._id, earning: Math.round(deliveryCharge * 0.9),
          pickedUpAt: statusHistory.find((h) => h.status === 'picked_up')?.at,
          deliveredAt: status === 'delivered' ? last : undefined,
        });
        await DeliveryTask.collection.updateOne({ _id: task._id }, { $set: { createdAt: last } });
      }
      orderCount++;
    }
  }

  console.log(`✅ ডেমো ডেটা তৈরি: ${kitchens.length}টি কিচেন, ${boys.length}টি ডেলিভারি বয়, ${customers.length}জন গ্রাহক, ${foods.length}টি খাবার, ৩টি প্যাকেজ, ${orderCount}টি অর্ডার`);
  console.log(`\n🔑 সব ডেমো একাউন্টের পাসওয়ার্ড: ${PASSWORD}`);
  console.log('   কিচেন:      ' + KITCHENS.map((k) => email(k.key)).join(', '));
  console.log('   ডেলিভারি:    ' + DELIVERY_BOYS.map((d) => email(d.key)).join(', '));
  console.log('   গ্রাহক:      ' + CUSTOMERS.map((c) => email(c.key)).join(', '));
}

(async () => {
  await connectDB();
  initFirebase();
  if (RESET) await reset();
  else await seed();
  await mongoose.disconnect();
})().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
