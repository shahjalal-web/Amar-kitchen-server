// অ্যাডমিন প্যানেলের পারমিশন। সুপার অ্যাডমিন (staffRole নেই এমন admin) সব পারে;
// সাব-অ্যাডমিন/ম্যানেজার ইত্যাদি স্টাফ শুধু তাদের রোলে থাকা পারমিশন পায়।
// স্টাফ ও রোল ব্যবস্থাপনা শুধু সুপার অ্যাডমিনের — কোনো রোলে দেওয়া যায় না (নিজের ক্ষমতা বাড়ানো ঠেকাতে)।
export const PERMISSION_GROUPS = [
  {
    group: 'ড্যাশবোর্ড ও অর্ডার',
    items: [
      { key: 'dashboard.view', label: 'ড্যাশবোর্ড দেখা' },
      { key: 'orders.view', label: 'সব অর্ডার দেখা' },
      { key: 'orders.manage', label: 'অর্ডার বাতিল করা' },
    ],
  },
  {
    group: 'ইউজার',
    items: [
      { key: 'users.view', label: 'ইউজার দেখা' },
      { key: 'users.manage', label: 'ইউজার ব্লক/চালু, অর্ডার লিমিট' },
      { key: 'approvals.manage', label: 'কিচেন/ডেলিভারি অ্যাপ্রুভাল' },
    ],
  },
  {
    group: 'কনটেন্ট',
    items: [
      { key: 'foods.manage', label: 'খাবার লাইব্রেরি' },
      { key: 'packages.manage', label: 'প্যাকেজ' },
      { key: 'locations.manage', label: 'লোকেশন (সিটি/থানা/এরিয়া)' },
    ],
  },
  {
    group: 'ফিনান্স ও সেটিংস',
    items: [
      { key: 'finance.view', label: 'ফিনান্স দেখা' },
      { key: 'finance.manage', label: 'উইথড্র অ্যাপ্রুভ/রিজেক্ট' },
      { key: 'config.manage', label: 'ডেলিভারি চার্জ ও গ্লোবাল কনফিগ' },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number]['key'];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const isPermission = (p: unknown): p is Permission => ALL_PERMISSIONS.includes(p as Permission);
