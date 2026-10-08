import { AppShell } from '@/components/app-shell';
import { requirePage } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePage();
  return <AppShell me={me}>{children}</AppShell>;
}
