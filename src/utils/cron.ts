import cron from 'node-cron';
import { processCancelledSubscriptions } from '../modules/subscription/subscription.service';

export const startCronJobs = (): void => {
  // প্রতিদিন রাত ১২টায় — pending cancellation গুলো activate করো
  cron.schedule('0 0 * * *', async () => {
    console.log('Cron: সাবস্ক্রিপশন ক্যান্সেলেশন প্রসেস শুরু');
    await processCancelledSubscriptions();
  });
};
