import { requirePage } from '@/lib/server-session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePage(['admin']);
  return children;
}
