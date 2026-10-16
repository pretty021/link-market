import { redirect } from 'next/navigation';
import { Check } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { homePath } from '@/lib/home';
import { currentActor } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

const points = [
  'Every account reviewed',
  '5-minute hold, just for you',
  'Private checking info',
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (actor) redirect(homePath(actor));
  return (
    <div className="grid grid-cols-1 min-h-screen bg-bg-card lg:grid-cols-2">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <aside className="hidden border-l border-line bg-bg-deep lg:flex lg:flex-col lg:justify-center lg:px-16">
        <p className="text-sm font-semibold text-brand-mint">Why us</p>
        <h2 className="mt-3 max-w-md text-3xl font-bold leading-tight">Checked deals. No rush.</h2>
        <ul className="mt-8 max-w-md space-y-4">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-ink-mid">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                <Check className="size-3" />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
