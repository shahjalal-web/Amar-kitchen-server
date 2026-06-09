import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketServer } from 'socket.io';

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

import { startCronJobs } from './utils/cron';

const app = express();
const httpServer = http.createServer(app);

export const io = new SocketServer(httpServer, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
});

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/subscription', subscriptionRoutes);

app.use(errorHandler);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;

const start = async (): Promise<void> => {
  await connectDB();
  initFirebase();
  initCloudinary();
  startCronJobs();
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start().catch(console.error);
