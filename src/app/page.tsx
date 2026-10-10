import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, ArrowRight, BadgeCheck, Check, ChevronDown, Clock3, Handshake, Lock, MessagesSquare, ShieldCheck, Timer, UserCheck } from 'lucide-react';
import { CanvasBackground } from '@/components/canvas-bg/canvas-background';
import { Logo } from '@/components/logo';
import { LinkedInMark, PostImage } from '@/components/post-bits';
import { ThemeToggle } from '@/components/theme-toggle';
import { prisma } from '@/lib/db';
import { homePath } from '@/lib/home';
import { currentActor } from '@/lib/server-session';
import type { ImageInfo } from '@/lib/validation';
import { formatPrice } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const wrap = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

/** Real numbers only: what is live right now and what has actually been completed. */
async function loadPublicData() {
  const [live, completed, sellers, latest] = await Promise.all([
    prisma.post.count({ where: { approval: true, visible: true, status: { in: ['PUBLISHED', 'PROGRESSING'] } } }),
    prisma.post.count({ where: { status: 'COMPLETED' } }),
    prisma.user.count({ where: { role: 'CLIENT', deletedAt: null, isBlocked: false } }),
    prisma.post.findMany({
      where: { approval: true, visible: true, status: { in: ['PUBLISHED', 'PROGRESSING'] } },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
  ]);
  return { live, completed, sellers, latest };
}

const steps = [
  {
    title: 'Find',
    text: 'Browse reviewed links. Save to cart.',
  },
  {
    title: 'Hold',
    text: 'Confirm. It is yours for 5 minutes.',
  },
  {
    title: 'Check',
    text: 'Send your checking link. Kept private.',
  },
  {
    title: 'Done',
    text: 'Seller confirms. Chat continues.',
  },
];

const faqs = [
  {
    q: 'What happens if the 5 minutes run out?',
    a: 'It goes back on the market. Anyone can confirm it again. The clock pauses while the seller reviews.',
  },
  {
    q: 'Can two buyers hold the same link?',
    a: 'No. Only one buyer can hold it at a time.',
  },
  {
    q: 'Who can see my checking info?',
    a: 'Only you and the seller.',
  },
  {
    q: 'How do I become a seller?',
    a: 'Sign up, then message us in support chat.',
  },
  {
    q: 'Do I need to refresh?',
    a: 'No. Everything updates live.',
  },
];

function HoldCard() {
  return (
    <div className="panel w-full max-w-md p-5 shadow-lift">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-lo">Example link</span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-purple/10 px-2 py-0.5 text-[11px] font-semibold text-brand-purple">
          <span className="size-1.5 rounded-full bg-brand-purple" /> Held for you
        </span>
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <LinkedInMark className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Link #21</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-mid">
            8 years old · seller Payal <BadgeCheck className="size-4 text-brand-mint" aria-label="Reviewed seller" />
          </p>
        </div>
        <p className="text-xl font-bold tabular-nums">$50.00</p>
      </div>

      <ol className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
        <li className="flex items-center gap-3">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-on-primary"><Check className="size-3.5" /></span>
          <span className="text-ink-mid">Saved</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-on-primary"><Check className="size-3.5" /></span>
          <span className="flex-1 font-medium">On hold for you</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-purple/10 px-2 py-0.5 font-mono text-xs font-semibold text-brand-purple">
            <Timer className="size-3.5" /> 04:12
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="size-6 rounded-full border-2 border-dashed border-line" />
          <span className="text-ink-lo">Seller checks</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="size-6 rounded-full border-2 border-dashed border-line" />
          <span className="text-ink-lo">Done</span>
        </li>
      </ol>
    </div>
  );
}

export default async function Landing() {
  const actor = await currentActor();
  if (actor) redirect(homePath(actor));
  const data = await loadPublicData();

  return (
    <div className="min-h-screen bg-bg-card">
      <header className="sticky top-0 z-30 border-b border-line bg-bg-card">
        <div className={`${wrap} flex h-16 items-center gap-8`}>
          <Logo />
          <nav className="hidden gap-7 text-sm font-medium text-ink-mid md:flex">
            <a href="#listings" className="hover:text-ink-hi">Link</a>
            <a href="#how" className="hover:text-ink-hi">How it works</a>
            <a href="#safety" className="hover:text-ink-hi">Safety</a>
            <a href="#faq" className="hover:text-ink-hi">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-ink-hi hover:bg-bg-elev">Log in</Link>
            <Link href="/register" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-bg-deep">
        <CanvasBackground />
        <div className={`${wrap} relative grid items-center gap-12 pb-28 pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-36 lg:pt-24`}>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-card px-3 py-1 text-xs font-medium text-ink-mid">
              <span className="size-1.5 rounded-full bg-brand-mint" />
              {data.live > 0 ? `${data.live} link${data.live === 1 ? '' : 's'} Available` : 'New links daily'}
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-[3.4rem]">
              Reviewed links. Real sellers.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-mid">
              Checked before the link. Held just for you. Confirmed in chat.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary hover:bg-primary-hover">
                Browse <ArrowRight className="size-4" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold text-ink-hi hover:bg-bg-elev">
                How it works
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-mid">
              {['Reviewed', 'One buyer at a time', 'Private'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-brand-mint" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HoldCard />
          </div>
        </div>
      </section>

      {/* Real numbers: a floating card overlapping the hero */}
      <section className="relative z-10 -mt-14">
        <div className={wrap}>
          <dl className="panel grid overflow-hidden shadow-lift sm:grid-cols-3">
            {[
              { icon: Activity, label: 'Link live', value: data.live, note: 'Ready to hold', live: true },
              { icon: Handshake, label: 'Deals completed', value: data.completed, note: 'Confirmed by sellers', live: false },
              { icon: BadgeCheck, label: 'Reviewed sellers', value: data.sellers, note: 'Verified by our team', live: false },
            ].map(({ icon: Icon, label, value, note, live }, i) => (
              <div key={label} className={`flex items-start gap-4 p-6 ${i > 0 ? 'border-t border-line sm:border-l sm:border-t-0' : ''}`}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-mint/10 text-brand-mint">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <dt className="flex items-center gap-2 text-sm font-medium text-ink-mid">
                    {label}
                    {live && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-state-ok/10 px-2 py-0.5 text-[11px] font-semibold text-state-ok">
                        <span className="relative flex size-1.5">
                          <span className="absolute inline-flex size-full rounded-full bg-state-ok opacity-70 motion-safe:animate-ping" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-state-ok" />
                        </span>
                        Live
                      </span>
                    )}
                  </dt>
                  <dd className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{value.toLocaleString()}</dd>
                  <p className="mt-1 text-xs text-ink-lo">{note}</p>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Latest real listings */}
      {data.latest.length > 0 && (
        <section id="listings" className="scroll-mt-16 py-20">
          <div className={wrap}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold">Latest Links</h2>
                <p className="mt-2 text-ink-mid">Sign up to hold one.</p>
              </div>
              <Link href="/register" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-mint hover:underline">
                See all <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.latest.map((p) => (
                <li key={p.id}>
                  <Link href="/register" className="panel group flex h-full gap-4 p-4 transition-shadow hover:shadow-lift">
                    <div className="size-20 shrink-0 overflow-hidden rounded-lg">
                      <PostImage image={p.image as ImageInfo | null} title={p.title} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="line-clamp-2 font-semibold group-hover:text-brand-mint">{p.name || p.title}</p>
                      <p className="mt-1 text-xs text-ink-lo">
                        {p.client.name} · {p.connects} connects
                      </p>
                      <div className="mt-auto flex items-center justify-between pt-3">
                        <span className="text-lg font-bold tabular-nums">{formatPrice(p.price)}</span>
                        {p.status === 'PROGRESSING' ? (
                          <span className="text-xs font-medium text-brand-purple">On hold</span>
                        ) : (
                          <span className="text-xs font-medium text-brand-mint">Available</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* How it works */}
      <section id="how" className="scroll-mt-16 border-y border-line bg-bg-deep py-20">
        <div className={wrap}>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold">How it works</h2>
            <p className="mt-3 text-ink-mid">
              Four steps. No racing other buyers.
            </p>
          </div>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="font-mono text-sm font-semibold text-brand-mint">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-mid">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Safety */}
      <section id="safety" className="scroll-mt-16 py-20">
        <div className={`${wrap} grid gap-12 lg:grid-cols-[1fr_1.4fr]`}>
          <div>
            <h2 className="text-3xl font-bold">Safe by design</h2>
            <p className="mt-3 text-ink-mid">Enforced by the platform.</p>
          </div>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {[
              { icon: UserCheck, title: 'Reviewed', text: 'Every seller and link checked.' },
              { icon: Clock3, title: 'One buyer at a time', text: 'A hold locks it to you alone.' },
              { icon: Lock, title: 'Private', text: 'Only buyer, seller and team see details.' },
              { icon: MessagesSquare, title: 'Real chat', text: 'Talk to sellers and support anytime.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <Icon className="size-6 text-brand-mint" strokeWidth={1.75} />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-mid">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sellers */}
      <section className="pb-20">
        <div className={wrap}>
          <div className="panel grid gap-8 p-8 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-brand-mint">For sellers</p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Send a list. We do the rest.</h2>
              <p className="mt-3 text-ink-mid">
                One line per link. We publish it. You get alerts.
              </p>
            </div>
            <ul className="space-y-3 text-sm">
              {['Fast requests', 'Live status', 'One-click confirm'].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-mint" /> <span className="text-ink-mid">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 border-t border-line bg-bg-deep py-20">
        <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_1.6fr]`}>
          <div>
            <h2 className="text-3xl font-bold">FAQ</h2>
            <p className="mt-3 text-ink-mid">More? Ask us in chat.</p>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-5 shrink-0 text-ink-lo transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-mid">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final call to action */}
      <section className="bg-primary">
        <div className={`${wrap} flex flex-col items-start justify-between gap-6 py-14 sm:flex-row sm:items-center`}>
          <div>
            <h2 className="text-2xl font-bold text-on-primary sm:text-3xl">Find your next link.</h2>
            <p className="mt-2 text-on-primary/80">Free to join.</p>
          </div>
          <Link href="/register" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-[#0A66C2] hover:bg-white/90">
            Join free <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className={`${wrap} flex flex-col items-start justify-between gap-4 py-8 text-sm text-ink-lo sm:flex-row sm:items-center`}>
          <Logo />
          <nav className="flex gap-6">
            <a href="#how" className="hover:text-ink-hi">How it works</a>
            <a href="#safety" className="hover:text-ink-hi">Safety</a>
            <a href="#faq" className="hover:text-ink-hi">FAQ</a>
            <Link href="/login" className="hover:text-ink-hi">Log in</Link>
          </nav>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
