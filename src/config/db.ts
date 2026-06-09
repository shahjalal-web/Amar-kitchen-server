import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI as string;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
    family: 4,
  });
  console.log('MongoDB connected');
};

export default connectDB;
