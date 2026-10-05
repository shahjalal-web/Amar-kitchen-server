import type { Server } from 'socket.io';

// Socket.io শুধু লোকাল/সাধারণ সার্ভারে চলে (src/index.ts সেট করে)।
// Vercel-এর মতো serverless-এ io থাকে না — তখন emit চুপচাপ কিছুই করে না।
let io: Server | null = null;

export const setIO = (server: Server): void => {
  io = server;
};

export const emit = (event: string, payload: unknown): void => {
  io?.emit(event, payload);
};
