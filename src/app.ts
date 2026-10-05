import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import connectDB from './config/db';
import { initFirebase } from './config/firebase';
import { initCloudinary } from './config/cloudinary';
import { errorHandler } from './middleware/error';

import authRoutes from './modules/auth/auth.routes';
import adminRoutes from './modules/admin/admin.routes';
import kitchenRoutes from './modules/kitchen/kitchen.routes';
import orderRoutes from './modules/order/order.routes';
import deliveryRoutes from './modules/delivery/delivery.routes';
import subscriptionRoutes from './modules/subscription/subscription.routes';
import locationRoutes from './modules/location/location.routes';
import staffRoutes from './modules/staff/staff.routes';
import mediaRoutes from './modules/media/media.routes';

import { processCancelledSubscriptions } from './modules/subscription/subscription.service';

// Express app — লোকাল সার্ভার (src/index.ts) আর Vercel (../index.ts) দুজনেই এটা ব্যবহার করে।
// এখানে listen() নেই; serverless-এ প্রতিটা রিকোয়েস্টে এই app-ই হ্যান্ডলার।
initFirebase();
initCloudinary();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ success: true, message: 'শখের কিচেন API চালু আছে' });
});

// serverless-এ cold start হলে DB কানেকশন রিকোয়েস্টের সময় তৈরি হয়, পরে আবার ব্যবহার হয়
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/media', mediaRoutes);

// Vercel Cron (vercel.json) প্রতিদিন এটা ডাকে — লোকালে node-cron একই কাজ করে
app.get('/api/cron/subscriptions', async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ success: false, message: 'অনুমতি নেই' });
    return;
  }
  try {
    await processCancelledSubscriptions();
    res.json({ success: true, message: 'সাবস্ক্রিপশন প্রসেস হয়েছে' });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

export default app;
