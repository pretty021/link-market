import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Check,
  CircleCheck,
  Lock,
  MessageCircle,
  MessagesSquare,
  Search,
  ShieldCheck,
  Timer,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { CanvasBackground } from '@/components/canvas-bg/canvas-background';
import { LandingMarket, type LandingListing } from '@/components/landing-market';
import { AccountThumb } from '@/components/linkedin-card';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { ACCOUNT_KINDS, type AccountKind } from '@/lib/account-kinds';
import { prisma } from '@/lib/db';
import { homePath } from '@/lib/home';
import { onlineIds } from '@/lib/realtime';
import { currentActor } from '@/lib/server-session';
import type { ImageInfo } from '@/lib/validation';
import { cn, formatPrice } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const wrap = 'mx-auto w-full max-w-6xl px-5 sm:px-8';
const eyebrow = 'text-xs font-semibold text-teal-600 dark:text-teal-300';
const h2 = 'mt-2 font-display text-3xl font-bold tracking-tight text-ink-hi sm:text-4xl';
const SUPPORT_EMAIL = 'support@inonlink.com';

const liveWhere = { approval: true, visible: true, status: { in: ['PUBLISHED' as const, 'PROGRESSING' as const] } };
const listingInclude = { client: { select: { id: true, name: true, image: true } } } as const;

/** Real numbers only: what is live now, what has been completed, and the newest listings of each type. */
async function loadPublicData() {
  const [byKind, completed, sellers, perKind] = await Promise.all([
    prisma.post.groupBy({ by: ['kind'], where: liveWhere, _count: { _all: true } }),
    prisma.post.count({ where: { status: 'COMPLETED' } }),
    prisma.user.count({ where: { role: 'CLIENT', deletedAt: null, isBlocked: false } }),
    Promise.all(
      ACCOUNT_KINDS.map((kind) =>
        prisma.post.findMany({ where: { ...liveWhere, kind }, include: listingInclude, orderBy: { createdAt: 'desc' }, take: 4 }),
      ),
    ),
  ]);
  const counts = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k, byKind.find((g) => g.kind === k)?._count._all ?? 0])) as Record<AccountKind, number>;
  const rows = perKind.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const listings: LandingListing[] = rows.map((p) => ({
    id: p.id,
    kind: p.kind,
    name: p.name,
    title: p.title,
    price: p.price,
    connects: p.connects,
    photo: (p.image as ImageInfo | null)?.url ?? null,
    seller: p.client.name,
    sellerPhoto: (p.client.image as ImageInfo | null)?.url ?? null,
  }));
  // The hero card shows a real listing: a named LinkedIn account, ideally one with a photo.
  const hero =
    rows.find((p) => p.kind === 'LINKEDIN' && p.name && p.image) ?? rows.find((p) => p.kind === 'LINKEDIN' && p.name) ?? rows[0] ?? null;
  return {
    live: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    completed,
    sellers,
    listings,
    hero: hero && {
      name: hero.name?.trim() || hero.title,
      photo: (hero.image as ImageInfo | null)?.url ?? null,
      detail: hero.kind === 'LINKEDIN' ? `LinkedIn · ${hero.connects} connects` : null,
      price: hero.price,
      seller: hero.client.name,
      sellerPhoto: (hero.client.image as ImageInfo | null)?.url ?? null,
      sellerOnline: onlineIds().has(hero.client.id),
    },
  };
}

const steps: { icon: LucideIcon; title: string; text: string; tone: string }[] = [
  { icon: Search, title: 'Find', text: 'Browse reviewed listings and save the ones you like to your cart.', tone: 'text-primary' },
  { icon: Timer, title: 'Hold', text: 'Confirm and the account is yours alone for 5 minutes.', tone: 'text-state-warn' },
  { icon: Wallet, title: 'Pay and check', text: 'Pay the seller, then send your payment link. Only they can see it.', tone: 'text-primary' },
  { icon: CircleCheck, title: 'Done', text: 'The seller confirms and your chat with them stays open.', tone: 'text-primary' },
];

const safety: { icon: LucideIcon; title: string; text: string; tone: string }[] = [
  { icon: ShieldCheck, title: 'Reviewed listings', text: 'Every seller and every listing is checked by our team before it goes live.', tone: 'bg-primary/15 text-primary' },
  { icon: Timer, title: 'One buyer at a time', text: 'A hold locks the listing to you, so nobody can buy it out from under you.', tone: 'bg-state-warn/15 text-state-warn' },
  { icon: Lock, title: 'Private details', text: 'Only you, the seller and our team can see your payment and checking info.', tone: 'bg-teal-500/15 text-teal-600 dark:text-teal-300' },
  { icon: MessagesSquare, title: 'Real chat', text: 'Talk to sellers and to our support team at any time, before and after you buy.', tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' },
];

const sellerPerks: { icon: LucideIcon; title: string; note: string }[] = [
  { icon: Zap, title: 'Fast requests', note: 'Buyers come to you' },
  { icon: Activity, title: 'Live status', note: 'See every hold and sale' },
  { icon: Check, title: 'One-click confirm', note: 'Approve payments in chat' },
];

const faqs = [
  {
    q: 'What happens if the 5 minutes run out?',
    a: 'The hold is released and the listing goes back to available, so another buyer can confirm it. You can hold it again if it is still free.',
  },
  { q: 'Can two buyers hold the same account?', a: 'No. A hold locks the listing to one buyer until it is done or the time runs out.' },
  { q: 'Who can see my checking info?', a: 'Only you, the seller of that account, and our team.' },
  { q: 'How do I become a seller?', a: 'Create an account, then message us in support chat. We review you and set you up as a seller.' },
  { q: 'Do I need to refresh the page?', a: 'No. Holds, prices, chats and status all update live.' },
];

/** Example of a hold, built from a real listing when there is one. */
function HoldCard({ hero }: { hero: NonNullable<Awaited<ReturnType<typeof loadPublicData>>['hero']> | null }) {
  const name = hero?.name ?? 'LinkedIn account';
  const row = (state: 'done' | 'now' | 'next', label: string, extra?: string) => (
    <li className="flex items-center gap-3 text-sm">
      {state === 'done' ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-on-primary">
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : state === 'now' ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-state-warn">
          <span className="size-1.5 rounded-full bg-bg-card" />
        </span>
      ) : (
        <span className="size-5 rounded-full border border-line" />
      )}
      <span className={cn('flex-1', state === 'next' ? 'text-ink-lo' : state === 'now' ? 'font-semibold text-ink-hi' : 'text-ink-mid')}>{label}</span>
      {extra && <span className="text-xs text-ink-lo">{extra}</span>}
    </li>
  );
  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0">
      <div className="absolute -left-16 -top-14 hidden items-center gap-3 rounded-xl border border-line bg-bg-card/95 px-3 py-2.5 shadow-lift backdrop-blur sm:flex">
        <span className="flex size-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-300">
          <ShieldCheck className="size-4" />
        </span>
        <span className="leading-tight">
          <span className="block text-xs font-semibold text-ink-hi">Listing reviewed</span>
          <span className="block text-[11px] text-ink-lo">by the inonlink team</span>
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-bg-card p-5 shadow-lift">
        <div className="flex items-center gap-3">
          <AccountThumb name={name} photo={hero?.photo} className="size-12 rounded-xl" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold text-ink-hi">{name}</p>
            {hero?.detail && <p className="mt-0.5 text-xs text-ink-lo">{hero.detail}</p>}
          </div>
          <p className="font-display text-2xl font-bold tabular-nums text-ink-hi">{formatPrice(hero?.price ?? 43)}</p>
        </div>
        <div className="mt-4 rounded-xl border border-state-warn/40 bg-state-warn/10 px-3.5 py-3 text-state-warn">
          <div className="flex items-center justify-between text-sm">
            <span>Held for you</span>
            <span className="font-mono text-lg font-bold">04:12</span>
          </div>
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full">
            <div className="absolute inset-0 bg-current opacity-15" />
            <div className="relative h-full w-[66%] rounded-full bg-current" />
          </div>
        </div>
        <ol className="mt-4 space-y-3">
          {row('done', 'Added to cart')}
          {row('now', 'On hold for you', '5 min')}
          {row('next', 'Seller checks payment')}
          {row('next', 'Done, chat stays open')}
        </ol>
      </div>

      {hero && (
        <div className="absolute -bottom-10 -left-12 hidden items-center gap-2.5 rounded-xl border border-line bg-bg-card/95 px-3 py-2.5 shadow-lift backdrop-blur sm:flex">
          {hero.sellerPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.sellerPhoto} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{hero.seller[0]?.toUpperCase()}</span>
          )}
          <span className="leading-tight">
            <span className="block text-xs text-ink-mid">
              <span className="font-semibold text-ink-hi">{hero.seller}</span> {hero.sellerOnline ? 'is online' : 'reviewed seller'}
            </span>
            <span className="block text-[11px] text-ink-lo">{hero.sellerOnline ? 'replies in chat' : 'chat with them after you hold'}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default async function Landing() {
  const actor = await currentActor();
  if (actor) redirect(homePath(actor));
  const data = await loadPublicData();

  return (
    <div className="min-h-screen bg-bg-deep">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg-deep/85 backdrop-blur">
        <div className={`${wrap} flex h-16 items-center gap-8`}>
          <Logo />
          <nav className="hidden gap-7 text-sm font-medium text-ink-mid md:flex">
            <a href="#listings" className="hover:text-ink-hi">Accounts</a>
            <a href="#how" className="hover:text-ink-hi">How it works</a>
            <a href="#safety" className="hover:text-ink-hi">Safety</a>
            <a href="#sellers" className="hover:text-ink-hi">For sellers</a>
            <a href="#faq" className="hover:text-ink-hi">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden rounded-xl border border-line sm:inline-flex" />
            <Link href="/login" className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-hi hover:bg-bg-elev">
              Log in
            </Link>
            <Link href="/register" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-[0_8px_24px_-8px_rgb(var(--primary)/0.7)] hover:bg-primary-hover">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <CanvasBackground />
        <div className="pointer-events-none absolute -right-40 top-0 size-[36rem] rounded-full bg-primary/10 blur-3xl" />
        <div className={`${wrap} relative grid items-center gap-14 pb-16 pt-14 lg:grid-cols-[1.1fr_1fr] lg:pb-20 lg:pt-20`}>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-card/80 px-3 py-1 text-xs font-medium text-ink-mid">
              <span className="size-1.5 rounded-full bg-state-ok" />
              {data.live > 0 ? `${data.live} account${data.live === 1 ? '' : 's'} available now` : 'New accounts daily'}
            </p>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.02] tracking-tight text-ink-hi sm:text-6xl">
              Reviewed
              <br />
              accounts.
              <br />
              <span className="bg-gradient-to-r from-[#5b8cff] to-[#2dd4bf] bg-clip-text text-transparent">Real sellers.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-mid">
              LinkedIn, Google Voice, Gmail, WhatsApp and Telegram accounts. Each one is checked by our team, held for one buyer at a time, and confirmed in chat.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#listings" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary shadow-[0_10px_30px_-10px_rgb(var(--primary)/0.8)] hover:bg-primary-hover">
                Browse accounts <ArrowRight className="size-4" />
              </a>
              <a href="#how" className="rounded-xl border border-line bg-bg-card/60 px-5 py-3 font-semibold text-ink-hi hover:bg-bg-elev">
                How it works
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-mid">
              {['Every listing reviewed', 'One buyer at a time', 'Private chat'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-teal-600 dark:text-teal-300" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:pl-10">
            <HoldCard hero={data.hero} />
          </div>
        </div>

        {/* Real numbers */}
        <div className={`${wrap} relative pb-16`}>
          <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-bg-card/80 backdrop-blur lg:grid-cols-4">
            {[
              { value: data.live.toLocaleString(), label: 'Accounts live now' },
              { value: data.completed.toLocaleString(), label: 'Deals completed' },
              { value: data.sellers.toLocaleString(), label: 'Reviewed sellers' },
              { value: '5 min', label: 'Hold time per buyer' },
            ].map((s, i) => (
              <div key={s.label} className={cn('p-6', i % 2 === 1 && 'border-l border-line', i >= 2 && 'border-t border-line lg:border-t-0', i === 2 && 'lg:border-l')}>
                <dd className="font-display text-3xl font-bold tabular-nums text-ink-hi">{s.value}</dd>
                <dt className="mt-1 text-sm text-ink-lo">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Marketplace */}
      <section id="listings" className="scroll-mt-16 border-y border-line/70 bg-bg-base py-20">
        <div className={wrap}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={eyebrow}>Marketplace</p>
              <h2 className={h2}>Available accounts</h2>
              <p className="mt-2 text-ink-mid">Five account types, every listing reviewed before it goes live.</p>
            </div>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg-card px-4 py-2.5 text-sm font-semibold text-ink-hi hover:bg-bg-elev">
              See all accounts <ArrowRight className="size-4" />
            </Link>
          </div>
          <LandingMarket listings={data.listings} counts={data.counts} />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-16 py-20">
        <div className={wrap}>
          <p className={eyebrow}>How it works</p>
          <h2 className={h2}>Four steps. No racing other buyers.</h2>
          <p className="mt-2 max-w-md text-ink-mid">When you confirm a listing, it is locked to you for five minutes while you pay.</p>
          <ol className="relative mt-12 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            <span className="absolute left-6 right-[10%] top-6 hidden h-px bg-gradient-to-r from-line via-primary/40 to-transparent lg:block" aria-hidden="true" />
            {steps.map((s, i) => (
              <li key={s.title} className="relative">
                <span className={cn('relative flex size-12 items-center justify-center rounded-xl border border-line bg-bg-card', s.tone)}>
                  <s.icon className="size-5" />
                  <span className="absolute -right-3 -top-2 rounded-full bg-primary px-1.5 text-[10px] font-bold text-on-primary">0{i + 1}</span>
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold text-ink-hi">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-mid">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Safety */}
      <section id="safety" className="scroll-mt-16 pb-20">
        <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_1.35fr]`}>
          <div>
            <p className={eyebrow}>Safety</p>
            <h2 className={h2}>Safe by design</h2>
            <p className="mt-2 text-ink-mid">These rules are built into the platform, not left to trust.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {safety.map((s) => (
              <div key={s.title} className="rounded-2xl border border-line bg-bg-card p-5">
                <span className={cn('flex size-10 items-center justify-center rounded-xl', s.tone)}>
                  <s.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold text-ink-hi">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-mid">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For sellers */}
      <section id="sellers" className="scroll-mt-16 pb-20">
        <div className={wrap}>
          <div className="relative overflow-hidden rounded-3xl border border-line bg-bg-card p-8 sm:p-10">
            <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-teal-400/15 blur-3xl" />
            <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <p className={eyebrow}>For sellers</p>
                <h2 className={h2}>Send a list. We do the rest.</h2>
                <p className="mt-3 max-w-lg text-ink-mid">
                  Send one line per account. We review and publish each listing, and you get an alert the moment someone holds one.
                </p>
                <Link href="/register" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary shadow-[0_10px_30px_-10px_rgb(var(--primary)/0.8)] hover:bg-primary-hover">
                  Become a seller
                </Link>
              </div>
              <ul className="space-y-3">
                {sellerPerks.map((p) => (
                  <li key={p.title} className="flex items-center gap-3 rounded-xl border border-line bg-bg-base/70 px-4 py-3">
                    <p.icon className="size-4 text-teal-600 dark:text-teal-300" />
                    <span className="flex-1 text-sm font-medium text-ink-hi">{p.title}</span>
                    <span className="text-xs text-ink-lo">{p.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 pb-20">
        <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_1.35fr]`}>
          <div>
            <p className={eyebrow}>FAQ</p>
            <h2 className={h2}>Questions, answered</h2>
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-bg-card p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <MessageCircle className="size-4" />
              </span>
              <p className="text-sm leading-tight">
                <span className="block font-semibold text-ink-hi">Still have a question?</span>
                <span className="text-ink-lo">
                  Ask us in chat or write to{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-mint hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                </span>
              </p>
            </div>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((f, i) => (
              <details key={f.q} className="group py-4" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink-hi [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="relative size-4 shrink-0 text-ink-lo" aria-hidden="true">
                    <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-current transition group-open:rotate-45" />
                    <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 rotate-90 bg-current transition group-open:rotate-[135deg]" />
                  </span>
                </summary>
                <p className="mt-3 pr-8 text-sm leading-relaxed text-ink-mid">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="pb-20">
        <div className={wrap}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#2f5bea] via-[#3b6cf6] to-[#22a6b3] px-8 py-10 sm:px-12">
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-40"
              style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.35) 1px, transparent 1px)', backgroundSize: '14px 14px', maskImage: 'linear-gradient(to left, black, transparent)' }}
            />
            <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">Find your next account.</h2>
                <p className="mt-2 text-white/80">Free to join. See live listings without an account.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/register" className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#1d3fbf] hover:bg-white/90">
                  Join free
                </Link>
                <a href="#listings" className="rounded-xl border border-white/50 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                  Browse accounts
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line/70 bg-bg-base">
        <div className={`${wrap} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-lo">
              Reviewed LinkedIn, Google Voice, Gmail, WhatsApp and Telegram accounts from real sellers. Each one is checked, held for one buyer, and confirmed in chat.
            </p>
          </div>
          {[
            {
              title: 'Marketplace',
              links: [
                ['Accounts', '#listings'],
                ['How it works', '#how'],
                ['Safety', '#safety'],
                ['FAQ', '#faq'],
              ],
            },
            {
              title: 'Sellers',
              links: [
                ['Become a seller', '#sellers'],
                ['Seller login', '/login'],
              ],
            },
            {
              title: 'Support',
              links: [
                [SUPPORT_EMAIL, `mailto:${SUPPORT_EMAIL}`],
                ['Log in', '/login'],
                ['Sign up', '/register'],
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-lo">{col.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-ink-mid hover:text-ink-hi">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line/70">
          <div className={`${wrap} flex flex-col gap-2 py-5 text-xs text-ink-lo sm:flex-row sm:items-center sm:justify-between`}>
            <span>© {new Date().getFullYear()} inonlink</span>
            <span>Support usually replies within a few hours</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
