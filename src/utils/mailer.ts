import nodemailer, { Transporter } from 'nodemailer';
import { waitUntil } from '@vercel/functions';

// SMTP দিয়ে ইমেইল পাঠানো (Gmail হলে App Password লাগবে)।
// SMTP কনফিগ না থাকলে ইমেইল স্কিপ করে শুধু লগ করে — অ্যাপ বন্ধ হয় না।
let transporter: Transporter | null = null;
let warned = false;

const getTransporter = (): Transporter | null => {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    if (!warned) {
      console.warn('Mailer: SMTP_HOST/SMTP_USER/SMTP_PASS সেট করা নেই — ইমেইল পাঠানো হবে না');
      warned = true;
    }
    return null;
  }
  const port = Number(SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
};

export const isMailerConfigured = () => !!getTransporter();

// fire-and-forget — ইমেইল ফেইল হলে মূল রিকোয়েস্ট ফেইল করবে না
export const sendMail = (to: string | undefined | null, subject: string, html: string): void => {
  const t = getTransporter();
  if (!t || !to) return;
  const from = process.env.MAIL_FROM || `শখের কিচেন <${process.env.SMTP_USER}>`;
  const job = t.sendMail({ from, to, subject, html }).catch((err: Error) => {
    console.error(`Mailer: ${to}-এ ইমেইল পাঠানো যায়নি —`, err.message);
  });
  // Vercel-এ রেসপন্সের পরও ফাংশনকে মেইল শেষ হওয়া পর্যন্ত চালু রাখে; লোকালে কিছু করে না
  waitUntil(job);
};
