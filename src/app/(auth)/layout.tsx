import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { homePath } from '@/lib/home';
import { currentActor } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (actor) redirect(homePath(actor));
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-8 text-2xl" />
      <div className="panel w-full max-w-md p-6 sm:p-8">{children}</div>
    </div>
  );
}
