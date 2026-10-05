import mongoose from 'mongoose';

// একবার কানেক্ট হলে সেই কানেকশনই আবার ব্যবহার হয় (serverless-এ প্রতিটা রিকোয়েস্টে নতুন কানেকশন নয়)
let connecting: Promise<typeof mongoose> | null = null;

const connectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) return;
  if (!connecting) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI সেট করা নেই');
    connecting = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10000, family: 4 })
      .then((m) => {
        console.log('MongoDB connected');
        return m;
      })
      .catch((err) => {
        connecting = null; // পরের রিকোয়েস্টে আবার চেষ্টা করবে
        throw err;
      });
  }
  await connecting;
};

export default connectDB;
