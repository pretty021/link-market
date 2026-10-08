import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  BellRing,
  Boxes,
  CheckCircle2,
  Clock3,
  FolderKanban,
  MessageCircle,
  Search,
  ShieldCheck,
  ShoppingCart,
  Timer,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { homePath } from '@/lib/home';
import { currentActor } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

const steps = [
  { title: 'Browse', text: 'See listings the moment they go live' },
  { title: 'Cart', text: 'Save the posts you want' },
  { title: 'Confirm', text: 'Lock it for 5 minutes' },
  { title: 'Check', text: 'Send your checking info' },
  { title: 'Chat', text: 'Finish the deal with the seller' },
];

const features = [
  { icon: Clock3, title: 'Save time', text: 'Sellers send a list of titles in one go. Admins add the image, connects and price, then publish with one click.', tone: 'mint' },
  { icon: BellRing, title: 'Reach buyers', text: 'Accepted posts appear in every buyer feed instantly. No refresh, no waiting.', tone: 'purple' },
  { icon: ShieldCheck, title: 'Protect private details', text: 'Checking info is visible only to the buyer holding the post, the seller and the admin.', tone: 'mint' },
  { icon: FolderKanban, title: 'Organize support', text: 'Every conversation is in one inbox, sorted by latest activity with unread counts.', tone: 'purple' },
] as const;

const benefits = [
  { icon: Boxes, title: 'Organized inventory', text: 'Every post moves through Requested, Published, In progress and Completed, visible to everyone who needs it.' },
  { icon: Search, title: 'Confident buyers', text: 'Only one buyer can hold a post at a time, with a live countdown that is fair to everyone.' },
  { icon: CheckCircle2, title: 'Clear order progress', text: 'Sellers mark checking info Checked or Not checked, and both sides land in the same chat.' },
];

function HeroPreview() {
  const cards = [
    { id: '#1042', price: '$120.00', age: '8 months old', g: 'from-[#0f2027] via-[#2c5364] to-[#4de3b4]', state: 'live' },
    { id: '#1043', price: '$95.00', age: '1 year old', g: 'from-[#41295a] via-[#5d4fe0] to-[#8a7dff]', state: 'hold' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-brand-purple/25 via-transparent to-brand-mint/20 blur-2xl" />
      <div className="relative space-y-4">
        <div className="panel ml-auto w-[88%] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-mid">Manage listings</span>
            <span className="rounded-full border border-brand-purple/50 bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold text-brand-purpleSoft">Admin</span>
          </div>
          {['#1042', '#1043', '#1044'].map((id, i) => (
            <div key={id} className="flex items-center justify-between border-t border-line/50 py-2 text-xs">
              <span className="text-ink-mid">Account {id}</span>
              <span className={i < 2 ? 'font-semibold text-brand-mint' : 'text-ink-lo'}>{i < 2 ? 'Published' : 'Requested'}</span>
            </div>
          ))}
        </div>
        {cards.map((c) => (
          <div key={c.id} className="panel flex gap-4 p-3">
            <div className={`h-20 w-28 shrink-0 rounded-xl bg-gradient-to-br ${c.g}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">Account {c.id}</p>
                <p className="text-base font-bold">{c.price}</p>
              </div>
              <p className="mt-0.5 text-xs text-ink-lo">Seller: pt96 · {c.age}</p>
              <div className="mt-2 flex items-center gap-2">
                {c.state === 'live' ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-brand-mint px-2.5 py-1 text-[11px] font-bold text-bg-deep">
                    <ShoppingCart className="size-3" /> Add to cart
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-brand-purple/50 bg-brand-purple/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-purpleSoft">
                    <Timer className="size-3" /> 04:12
                  </span>
                )}
                <span className="text-[11px] text-ink-lo">{c.state === 'live' ? '3 viewing' : 'In progress'}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="panel ml-8 space-y-2 p-4">
          <div className="flex justify-end">
            <span className="rounded-2xl rounded-br-md bg-bg-elev px-3 py-2 text-xs text-ink-hi">Can you confirm the transfer details?</span>
          </div>
          <div className="flex">
            <span className="rounded-2xl rounded-bl-md bg-brand-purple px-3 py-2 text-xs text-white">Yes, checked - let&apos;s finish here.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Landing() {
  const actor = await currentActor();
  if (actor) redirect(homePath(actor));

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-20 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Logo />
        <nav className="hidden gap-6 text-sm text-ink-mid md:flex">
          <a href="#how" className="hover:text-ink-hi">How it works</a>
          <a href="#features" className="hover:text-ink-hi">Features</a>
          <a href="#benefits" className="hover:text-ink-hi">Why LinkMarket</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-mid hover:text-ink-hi">Log in</Link>
          <Link href="/register" className="rounded-xl bg-brand-mint px-4 py-2 text-sm font-semibold text-bg-deep shadow-glow hover:bg-brand-mintSoft">
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-14">
        <div>
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Fresh accounts.
            <br />
            <span className="text-gradient">Real conversations.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-mid">
            Browse daily listings, lock the one you want with a fair 5-minute hold, and speak directly with the seller.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-brand-mint px-6 py-3 text-base font-semibold text-bg-deep shadow-glow hover:bg-brand-mintSoft">
              <Search className="size-5" /> Explore listings
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-brand-purple/70 bg-brand-purple/10 px-6 py-3 text-base font-semibold text-brand-purpleSoft hover:bg-brand-purple/20">
              <MessageCircle className="size-5" /> Talk to a seller
            </Link>
          </div>
          <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-line bg-bg-card/70 px-4 py-2.5 text-sm text-brand-mint">
            <ShieldCheck className="size-4" /> Checking info stays between you, the seller and the admin
          </div>
        </div>
        <HeroPreview />
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="panel flex flex-wrap items-center gap-4 border-brand-purple/40 bg-gradient-to-r from-brand-purple/15 via-bg-card/80 to-bg-card/80 px-6 py-4">
          <Bell className="size-5 text-brand-purpleSoft" />
          <p className="font-semibold">New listings appear live</p>
          <span className="hidden h-5 w-px bg-line sm:block" />
          <p className="text-sm text-ink-mid">Get notified the moment a post is accepted, a hold expires, or a seller replies.</p>
          <Link href="/register" className="ml-auto inline-flex items-center gap-2 rounded-xl border border-brand-purple/70 px-4 py-2 text-sm font-semibold text-brand-purpleSoft hover:bg-brand-purple/15">
            <Bell className="size-4" /> Enable alerts
          </Link>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="panel p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <ShoppingCart className="size-6 text-brand-mint" />
            <div>
              <h2 className="text-lg font-bold">Complete your purchase</h2>
              <p className="text-sm text-ink-lo">A simple, fair process from start to finish.</p>
            </div>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((s, i) => (
              <li key={s.title} className="flex items-center gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${i === 0 ? 'bg-brand-mint text-bg-deep' : 'border border-line bg-bg-elev text-ink-hi'}`}>
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-ink-lo">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <h2 className="mb-8 text-center text-3xl font-bold sm:text-4xl">
          A business that is <span className="text-gradient">easier to manage</span>
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          {features.map(({ icon: Icon, title, text, tone }) => (
            <div key={title} className="panel group relative overflow-hidden p-6">
              <div className={`absolute -right-10 -top-10 size-40 rounded-full blur-3xl ${tone === 'mint' ? 'bg-brand-mint/15' : 'bg-brand-purple/20'}`} />
              <div className={`relative mb-4 flex size-12 items-center justify-center rounded-2xl ${tone === 'mint' ? 'bg-grad-mint text-bg-deep' : 'bg-grad-purple text-white'}`}>
                <Icon className="size-6" />
              </div>
              <h3 className="relative text-lg font-bold">{title}</h3>
              <p className="relative mt-2 text-sm text-ink-mid">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="benefits" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <h2 className="mb-8 text-center text-3xl font-bold sm:text-4xl">
          More sales. <span className="text-gradient">Less manual work.</span>
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {benefits.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="panel p-6">
              <div className={`mb-4 flex size-12 items-center justify-center rounded-2xl ${i === 1 ? 'bg-grad-purple text-white' : 'bg-grad-mint text-bg-deep'}`}>
                <Icon className="size-6" />
              </div>
              <h3 className="text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm text-ink-mid">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex justify-center">
          <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-brand-mint px-6 py-3 font-semibold text-bg-deep shadow-glow hover:bg-brand-mintSoft">
            Create a buyer account <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line/60 py-8 text-center text-xs text-ink-lo">© {new Date().getFullYear()} LinkMarket</footer>
    </div>
  );
}
