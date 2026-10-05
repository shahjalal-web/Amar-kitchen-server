import { sendMail } from './mailer';
import { User } from '../modules/auth/auth.model';
import { IOrder, OrderStatus } from '../modules/order/order.model';

// সব ইমেইল নোটিফিকেশন এক জায়গায় — কোন ইভেন্টে কাকে মেইল যাবে
const APP_URL = () => process.env.FRONTEND_URL || 'http://localhost:3000';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'নতুন (কিচেনের অপেক্ষায়)',
  accepted: 'কিচেন গ্রহণ করেছে',
  rejected: 'কিচেন প্রত্যাখ্যান করেছে',
  ready: 'রান্না শেষ — ডেলিভারির জন্য প্রস্তুত',
  picked_up: 'ডেলিভারির পথে',
  delivered: 'ডেলিভারি সম্পন্ন',
  cancelled: 'বাতিল',
  resell: 'রিসেল তালিকায়',
  resold: 'রিসেল হয়েছে',
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const layout = (title: string, body: string, link?: { href: string; label: string }) => `
<div style="font-family:'Noto Sans Bengali',Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden">
  <div style="background:#15803d;color:#fff;padding:16px 20px;font-size:18px;font-weight:700">🍱 শখের কিচেন</div>
  <div style="padding:20px;color:#1c1917;line-height:1.7">
    <h2 style="margin:0 0 12px;font-size:17px">${escapeHtml(title)}</h2>
    ${body}
    ${link ? `<p style="margin-top:20px"><a href="${link.href}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(link.label)}</a></p>` : ''}
  </div>
  <div style="background:#f5f5f4;color:#78716c;font-size:12px;padding:10px 20px">এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে।</div>
</div>`;

const orderSummary = (order: IOrder) => `
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 0;color:#78716c">অর্ডার কোড</td><td><b>${escapeHtml(order.uniqueCode)}</b></td></tr>
    <tr><td style="padding:4px 0;color:#78716c">স্ট্যাটাস</td><td>${STATUS_LABEL[order.status]}</td></tr>
    <tr><td style="padding:4px 0;color:#78716c">মোট</td><td>৳${order.totalAmount} + ডেলিভারি ৳${order.deliveryCharge}</td></tr>
    <tr><td style="padding:4px 0;color:#78716c">ঠিকানা</td><td>${escapeHtml(order.deliveryAddress)}</td></tr>
  </table>`;

const emailOf = async (userId?: unknown) => {
  if (!userId) return null;
  const u = await User.findById(userId).select('email name kitchenName');
  return u;
};

// নতুন অর্ডার → কিচেন মালিক
export const notifyNewOrder = async (order: IOrder) => {
  const kitchen = await emailOf(order.kitchen);
  sendMail(
    kitchen?.email,
    `নতুন অর্ডার — ${order.uniqueCode}`,
    layout('আপনার কিচেনে নতুন অর্ডার এসেছে', orderSummary(order), { href: `${APP_URL()}/kitchen/orders`, label: 'অর্ডার দেখুন' })
  );
};

// স্ট্যাটাস আপডেট → গ্রাহক (+ নির্ধারিত ডেলিভারি বয়, + কিচেন যদি ডেলিভারি বয় আপডেট করে)
export const notifyOrderStatus = async (order: IOrder, updatedBy: 'kitchen' | 'delivery' | 'user' | 'system') => {
  const [customer, deliveryBoy, kitchen] = await Promise.all([
    emailOf(order.user),
    emailOf(order.deliveryBoy),
    emailOf(order.kitchen),
  ]);
  const title = `অর্ডারের আপডেট: ${STATUS_LABEL[order.status]}`;
  const subject = `অর্ডার ${order.uniqueCode} — ${STATUS_LABEL[order.status]}`;

  sendMail(customer?.email, subject, layout(title, orderSummary(order), { href: `${APP_URL()}/user/orders`, label: 'অর্ডার ট্র্যাক করুন' }));
  if (deliveryBoy && updatedBy !== 'delivery') {
    sendMail(deliveryBoy.email, subject, layout(title, orderSummary(order), { href: `${APP_URL()}/delivery/pickups`, label: 'ডেলিভারি দেখুন' }));
  }
  if (kitchen && updatedBy !== 'kitchen') {
    sendMail(kitchen.email, subject, layout(title, orderSummary(order), { href: `${APP_URL()}/kitchen/orders`, label: 'অর্ডার দেখুন' }));
  }
};

// ডেলিভারি কোড → শুধু গ্রাহক
export const notifyDeliveryOtp = async (order: IOrder, otp: string) => {
  const customer = await emailOf(order.user);
  sendMail(
    customer?.email,
    `আপনার ডেলিভারি কোড: ${otp} (অর্ডার ${order.uniqueCode})`,
    layout(
      'আপনার খাবার পথে আছে 🛵',
      `<p>খাবার হাতে পাওয়ার পর ডেলিভারিকারীকে এই কোডটি দিন:</p>
       <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:12px 0">${otp}</p>
       <p style="color:#78716c;font-size:13px">খাবার না পেয়ে কাউকে কোড দেবেন না। অ্যাপের "আমার অর্ডার" পেজেও কোডটি দেখতে পাবেন।</p>
       ${orderSummary(order)}`,
      { href: `${APP_URL()}/user/orders`, label: 'অর্ডার দেখুন' }
    )
  );
};

// ডেলিভারি বয় নির্ধারণ → ডেলিভারি বয়
export const notifyDeliveryAssigned = async (order: IOrder) => {
  const [deliveryBoy, kitchen] = await Promise.all([emailOf(order.deliveryBoy), emailOf(order.kitchen)]);
  sendMail(
    deliveryBoy?.email,
    `নতুন ডেলিভারি — ${order.uniqueCode}`,
    layout(
      `${kitchen?.kitchenName || kitchen?.name || 'একটি কিচেন'} আপনাকে একটি ডেলিভারি দিয়েছে`,
      orderSummary(order),
      { href: `${APP_URL()}/delivery/pickups`, label: 'ডেলিভারি দেখুন' }
    )
  );
};

// অ্যাকাউন্ট অ্যাপ্রুভ/রিজেক্ট → কিচেন/ডেলিভারি
export const notifyAccountReview = async (userId: string, approved: boolean) => {
  const u = await emailOf(userId);
  sendMail(
    u?.email,
    approved ? 'আপনার একাউন্ট অ্যাপ্রুভ হয়েছে' : 'আপনার একাউন্ট অ্যাপ্রুভ হয়নি',
    layout(
      approved ? 'অভিনন্দন! আপনার একাউন্ট এখন সক্রিয়' : 'দুঃখিত, আপনার একাউন্টটি অ্যাপ্রুভ করা হয়নি',
      approved ? '<p>এখন লগইন করে কাজ শুরু করতে পারবেন।</p>' : '<p>বিস্তারিত জানতে অ্যাডমিনের সাথে যোগাযোগ করুন।</p>',
      approved ? { href: `${APP_URL()}/login`, label: 'লগইন করুন' } : undefined
    )
  );
};

// উইথড্র রিকোয়েস্ট রিভিউ → কিচেন
export const notifyWithdrawalReview = async (kitchenId: unknown, amount: number, approved: boolean) => {
  const u = await emailOf(kitchenId);
  sendMail(
    u?.email,
    approved ? `৳${amount} উইথড্র অনুমোদিত` : `৳${amount} উইথড্র বাতিল`,
    layout(approved ? 'উইথড্র রিকোয়েস্ট অনুমোদিত হয়েছে' : 'উইথড্র রিকোয়েস্ট বাতিল হয়েছে', `<p>পরিমাণ: ৳${amount}</p>`,
      { href: `${APP_URL()}/kitchen/wallet`, label: 'ওয়ালেট দেখুন' })
  );
};
