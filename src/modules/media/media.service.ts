import { discardUploads } from '../../utils/images';

// ফর্মে আপলোড করে সেভ না করেই বাদ দেওয়া ছবি Cloudinary থেকে মোছা।
// কোনো খাবারে ব্যবহৃত ছবি কখনো মোছে না (destroyUnusedImages যাচাই করে)।
export const discard = (urls: unknown) => discardUploads(urls);
