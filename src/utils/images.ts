import { cloudinary } from '../config/cloudinary';
import { FoodItem } from '../modules/admin/admin.model';

export interface StoredImage {
  url: string;
  publicId: string;
  credit?: string;
}

export const MAX_FOOD_IMAGES = 6;
const APP_FOLDER = 'shokher-kitchen/';

// https://res.cloudinary.com/<cloud>/image/upload/[transforms/][v123/]<publicId>.<ext> → publicId
// শুধু আমাদের নিজের cloud-এর URL গ্রহণ করা হয় — অন্যের ছবির publicId দিয়ে কিছু মুছে ফেলা যাবে না
export const publicIdFromUrl = (url: string): string | null => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud || typeof url !== 'string') return null;
  const m = url.match(new RegExp(`^https://res\\.cloudinary\\.com/${cloud}/image/upload/(.+)$`));
  if (!m) return null;
  const parts = m[1].split('/');
  // ট্রান্সফর্মেশন (যেমন f_auto,w_400) আর ভার্সন (v123) বাদ
  while (parts.length > 1 && (/^v\d+$/.test(parts[0]) || /^[a-z]{1,3}_[^/]*$/.test(parts[0]) || parts[0].includes(','))) parts.shift();
  const publicId = parts.join('/').replace(/\.[a-z0-9]+$/i, '');
  return publicId || null;
};

// ক্লায়েন্ট পাঠায় images: (string | {url, credit?})[] — সার্ভার নিজে publicId বের করে রাখে
export const normalizeImages = (input: unknown): StoredImage[] => {
  if (!Array.isArray(input)) return [];
  const out: StoredImage[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const url = typeof raw === 'string' ? raw : (raw as { url?: string })?.url;
    const credit = typeof raw === 'object' && raw ? (raw as { credit?: string }).credit?.trim() : undefined;
    if (!url) continue;
    const publicId = publicIdFromUrl(url);
    if (!publicId) throw new Error('ছবি শুধু অ্যাপ থেকে আপলোড করা যাবে');
    if (seen.has(publicId)) continue;
    seen.add(publicId);
    out.push({ url, publicId, ...(credit ? { credit } : {}) });
  }
  if (out.length > MAX_FOOD_IMAGES) throw new Error(`সর্বোচ্চ ${MAX_FOOD_IMAGES}টি ছবি দেওয়া যাবে`);
  return out;
};

// Cloudinary থেকে ছবি মুছে ফেলে — তবে অন্য কোনো খাবার একই ছবি ব্যবহার করলে সেটা রাখা হয়
export const destroyUnusedImages = async (publicIds: string[]): Promise<string[]> => {
  const ids = [...new Set(publicIds.filter((id) => id?.startsWith(APP_FOLDER)))];
  if (!ids.length) return [];
  const stillUsed = await FoodItem.distinct('images.publicId', { 'images.publicId': { $in: ids } });
  const toDelete = ids.filter((id) => !stillUsed.includes(id));
  const results = await Promise.allSettled(toDelete.map((id) => cloudinary.uploader.destroy(id, { invalidate: true })));
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`Cloudinary: ${toDelete[i]} মুছতে ব্যর্থ —`, (r.reason as Error)?.message);
  });
  return toDelete;
};

// ফর্মে আপলোড করে পরে বাদ দেওয়া (সেভ না হওয়া) ছবি মুছে ফেলা
export const discardUploads = async (urls: unknown): Promise<string[]> => {
  if (!Array.isArray(urls)) return [];
  const ids = urls.map((u) => publicIdFromUrl(String(u))).filter((id): id is string => !!id);
  return destroyUnusedImages(ids.slice(0, 20));
};
