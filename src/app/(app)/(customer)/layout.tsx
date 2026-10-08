import { requirePage } from '@/lib/server-session';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  await requirePage(['CUSTOMER']);
  return children;
}
