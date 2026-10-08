import { requirePage } from '@/lib/server-session';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requirePage(['CLIENT']);
  return children;
}
