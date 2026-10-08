import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, BadgeCheck, Check, ChevronDown, Clock3, Lock, MessagesSquare, ShieldCheck, Timer, UserCheck } from 'lucide-react';
import { Logo } from '@/components/logo';
import { PostImage } from '@/components/post-bits';
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
    prisma.post.count({ where: { approval: true, status: { in: ['PUBLISHED', 'PROGRESSING'] } } }),
    prisma.post.count({ where: { status: 'COMPLETED' } }),
    prisma.user.count({ where: { role: 'CLIENT', deletedAt: null, isBlocked: false } }),
    prisma.post.findMany({
      where: { approval: true, status: { in: ['PUBLISHED', 'PROGRESSING'] } },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
  ]);
  return { live, completed, sellers, latest };
}

const steps = [
  {
    title: 'Find a listing',
    text: 'Every listing is reviewed by our team before it appears. Save the ones you like to your cart.',
  },
  {
    title: 'Hold it for 5 minutes',
    text: 'Press Confirm and the listing is locked to you alone. Nobody else can take it while you check.',
  },
  {
    title: 'Send your checking info',
    text: 'Share the details the seller needs. Only you, the seller and our team can ever see them.',
  },
  {
    title: 'Seller confirms, you chat',
    text: 'Once the seller marks it Checked, the deal is done and you continue in a private chat.',
  },
];

const faqs = [
  {
    q: 'What happens if the 5 minutes run out?',
    a: 'The hold is released automatically and the listing goes back on the marketplace. You can confirm it again, and so can anyone else. While the seller is reviewing your checking info, the clock is paused.',
  },
  {
    q: 'Can two buyers hold the same listing?',
    a: 'No. Many buyers can save a listing, but only one can hold it at a time. If someone confirms first, you will see "In progress" right away.',
  },
  {
    q: 'Who can see my checking info?',
    a: 'Only you, the seller of that listing and our admin team. Other buyers never see it.',
  },
  {
    q: 'How do I become a seller?',
    a: 'Seller accounts are created by our team so every seller is known to us. Create an account and message us from the support chat.',
  },
  {
    q: 'Do I need to refresh to see new listings?',
    a: 'No. New listings, holds and messages appear live, and you get a notification when something needs your attention.',
  },
];

function HoldCard() {
  return (
    <div className="panel w-full max-w-md p-5 shadow-lift">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-lo">Example listing</span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-purple/10 px-2 py-0.5 text-[11px] font-semibold text-brand-purple">
          <span className="size-1.5 rounded-full bg-brand-purple" /> Held for you
        </span>
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">Account #1042</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-mid">
            8 months old · seller pt96 <BadgeCheck className="size-4 text-brand-mint" aria-label="Reviewed seller" />
          </p>
        </div>
        <p className="text-xl font-bold tabular-nums">$120.00</p>
      </div>

      <ol className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
        <li className="flex items-center gap-3">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-on-primary"><Check className="size-3.5" /></span>
          <span className="text-ink-mid">Saved to cart</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-on-primary"><Check className="size-3.5" /></span>
          <span className="flex-1 font-medium">Confirmed, only you can hold it</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-purple/10 px-2 py-0.5 font-mono text-xs font-semibold text-brand-purple">
            <Timer className="size-3.5" /> 04:12
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="size-6 rounded-full border-2 border-dashed border-line" />
          <span className="text-ink-lo">Seller checks your details</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="size-6 rounded-full border-2 border-dashed border-line" />
          <span className="text-ink-lo">Deal completed, chat continues</span>
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
            <a href="#listings" className="hover:text-ink-hi">Listings</a>
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
      <section className="border-b border-line bg-bg-deep">
        <div className={`${wrap} grid items-center gap-12 py-16 lg:grid-cols-[1.15fr_1fr] lg:py-24`}>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-card px-3 py-1 text-xs font-medium text-ink-mid">
              <span className="size-1.5 rounded-full bg-brand-mint" />
              {data.live > 0 ? `${data.live} listing${data.live === 1 ? '' : 's'} live right now` : 'New listings every day'}
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-[3.4rem]">
              Buy reviewed accounts from sellers you can talk to.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-mid">
              Every listing is checked by our team before it goes live. When you find the right one, it is held for you alone
              while the seller confirms the details with you in a private chat.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary hover:bg-primary-hover">
                Browse listings <ArrowRight className="size-4" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold text-ink-hi hover:bg-bg-elev">
                How it works
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-mid">
              {['Reviewed before listing', 'One buyer at a time', 'Private checking info'].map((t) => (
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

      {/* Real numbers */}
      <section className="border-b border-line">
        <dl className={`${wrap} grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0`}>
          {[
            { label: 'Listings live now', value: data.live },
            { label: 'Deals completed', value: data.completed },
            { label: 'Reviewed sellers', value: data.sellers },
          ].map((s) => (
            <div key={s.label} className="py-7 sm:px-8 sm:first:pl-0">
              <dt className="text-sm text-ink-lo">{s.label}</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums">{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Latest real listings */}
      {data.latest.length > 0 && (
        <section id="listings" className="scroll-mt-16 py-20">
          <div className={wrap}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold">Latest listings</h2>
                <p className="mt-2 text-ink-mid">Straight from the marketplace. Sign up to save and hold one.</p>
              </div>
              <Link href="/register" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-mint hover:underline">
                See all listings <ArrowRight className="size-4" />
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
                      <p className="line-clamp-2 font-semibold group-hover:text-brand-mint">{p.title}</p>
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
            <h2 className="text-3xl font-bold">A fair way to buy, in four steps</h2>
            <p className="mt-3 text-ink-mid">
              The 5-minute hold means you never race other buyers mid-check, and sellers only deal with one buyer at a time.
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
            <h2 className="text-3xl font-bold">Built so both sides can trust the deal</h2>
            <p className="mt-3 text-ink-mid">The rules are enforced by the platform itself, not left to good intentions.</p>
          </div>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {[
              { icon: UserCheck, title: 'Reviewed sellers and listings', text: 'Seller accounts are created by our team, and each listing is checked and priced before buyers see it.' },
              { icon: Clock3, title: 'One buyer at a time', text: 'A hold locks the listing to a single buyer. If time runs out, it returns to the marketplace automatically.' },
              { icon: Lock, title: 'Private by default', text: 'Checking info is visible only to the buyer, the seller and our team. Chats are open only to their members.' },
              { icon: MessagesSquare, title: 'Real people, real chat', text: 'Talk with the seller directly once the deal is checked, and reach our support team from any page.' },
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
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Send your list. We handle the rest.</h2>
              <p className="mt-3 text-ink-mid">
                Submit your listings one line at a time. Our team adds the details and publishes them, and you get notified the moment
                a buyer holds one.
              </p>
            </div>
            <ul className="space-y-3 text-sm">
              {['Requests in seconds, one line per listing', 'Live status for every listing you own', 'Review checking info and confirm in one click'].map((t) => (
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
            <h2 className="text-3xl font-bold">Questions, answered</h2>
            <p className="mt-3 text-ink-mid">Anything else? Our team is one message away after you sign up.</p>
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
            <h2 className="text-2xl font-bold text-on-primary sm:text-3xl">Find your next account today.</h2>
            <p className="mt-2 text-on-primary/80">Free to join. New listings appear the moment they are approved.</p>
          </div>
          <Link href="/register" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-[#108a00] hover:bg-white/90">
            Create a free account <ArrowRight className="size-4" />
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
