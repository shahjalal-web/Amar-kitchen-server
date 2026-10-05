import http from 'http';
import { Server as SocketServer } from 'socket.io';

import app from './app';
import connectDB from './config/db';
import { setIO } from './utils/realtime';
import { startCronJobs } from './utils/cron';

// লোকাল / সাধারণ সার্ভার (npm run dev, npm start)। Vercel এই ফাইল চালায় না — ../index.ts দেখুন।
const httpServer = http.createServer(app);

const io = new SocketServer(httpServer, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
});
setIO(io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;

const start = async (): Promise<void> => {
  await connectDB();
  startCronJobs();
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start().catch(console.error);
