'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react';
import type { PaymentAddress } from '@/lib/client/types';
import { cn } from '@/lib/utils';

type Network = { badge: string; name: string; standard: string; className: string };

// The payment "type" is free text set by the Admin (e.g. "USDT TRC20", "PayPal", "BTC").
// These tables turn it into an icon, a full name and a network badge.
const NETWORKS: { match: RegExp; network: Network }[] = [
  { match: /\b(TRC-?20|TRX|TRON)\b/, network: { badge: 'TRX', name: 'Tron', standard: 'TRC20', className: 'bg-[#e5484d] text-white' } },
  { match: /\b(ERC-?20|ETH|ETHEREUM)\b/, network: { badge: 'ETH', name: 'Ethereum', standard: 'ERC20', className: 'bg-[#627eea] text-white' } },
  { match: /\b(BEP-?20|BSC|BNB ?CHAIN)\b/, network: { badge: 'BSC', name: 'BSC', standard: 'BEP20', className: 'bg-[#d6a50a] text-white' } },
  { match: /\b(SOL|SOLANA|SPL)\b/, network: { badge: 'SOLANA', name: 'Solana', standard: 'SPL', className: 'bg-[#8b5cf6] text-white' } },
  { match: /\b(POLYGON|MATIC)\b/, network: { badge: 'POLYGON', name: 'Polygon', standard: 'Polygon', className: 'bg-[#7b3fe4] text-white' } },
  { match: /\bBASE\b/, network: { badge: 'BASE', name: 'Base', standard: 'Base', className: 'bg-[#0052ff] text-white' } },
  { match: /\b(ARB|ARBITRUM)\b/, network: { badge: 'ARB', name: 'Arbitrum', standard: 'Arbitrum', className: 'bg-[#2d74da] text-white' } },
];

const COINS: { match: RegExp; code: string; name: string; glyph: string; color: string; stable?: boolean; crypto?: boolean }[] = [
  { match: /\bUSDT|TETHER\b/, code: 'USDT', name: 'Tether USD', glyph: '₮', color: '#26a17b', stable: true, crypto: true },
  { match: /\bUSDC\b/, code: 'USDC', name: 'USD Coin', glyph: '$', color: '#2775ca', stable: true, crypto: true },
  { match: /\bDAI\b/, code: 'DAI', name: 'Dai', glyph: '◈', color: '#f5ac37', stable: true, crypto: true },
  { match: /\bBTC|BITCOIN\b/, code: 'BTC', name: 'Bitcoin', glyph: '₿', color: '#f7931a', crypto: true },
  { match: /^\s*(ETH|ETHEREUM)\b/, code: 'ETH', name: 'Ethereum', glyph: 'Ξ', color: '#627eea', crypto: true },
  { match: /^\s*(SOL|SOLANA)\b/, code: 'SOL', name: 'Solana', glyph: 'S', color: '#9945ff', crypto: true },
  { match: /\bLTC|LITECOIN\b/, code: 'LTC', name: 'Litecoin', glyph: 'Ł', color: '#345d9d', crypto: true },
  { match: /\bPAYPAL\b/, code: 'PayPal', name: 'Email transfer', glyph: 'P', color: '#1e4db7' },
  { match: /\bWISE\b/, code: 'Wise', name: 'Bank transfer', glyph: 'W', color: '#163300' },
  { match: /\bPAYONEER\b/, code: 'Payoneer', name: 'Payoneer transfer', glyph: 'P', color: '#ff4800' },
];

const POPULAR = new Set(['USDT', 'BTC', 'PayPal']);

/** Payment types offered when adding a Client's payment address. */
export const DEFAULT_PAYMENT_TYPES = [
  'USDT TRC20',
  'USDT BEP20',
  'USDT Solana',
  'USDT ERC20',
  'USDC Solana',
  'USDC Base',
  'USDC Polygon',
  'USDC ERC20',
] as const;

/**
 * Payment type dropdown for a payment address row. An older free-text type that isn't in the
 * list (e.g. "PayPal") stays as an extra option, so saved addresses never lose their type.
 */
export function PaymentTypeSelect({ value, onChange }: { value: string; onChange: (type: string) => void }) {
  const options: string[] = [...DEFAULT_PAYMENT_TYPES];
  if (value && !options.includes(value)) options.push(value);
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">Payment type</span>
      <select
        aria-label="Payment type"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('field cursor-pointer appearance-none pr-8', !value && 'text-ink-lo')}
      >
        <option value="" disabled>
          Type
        </option>
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-lo" />
    </label>
  );
}

export type PaymentMethod = PaymentAddress & {
  code: string;
  name: string;
  glyph: string;
  color: string;
  network: Network | null;
  stable: boolean;
  popular: boolean;
  /** Short safety note shown under the address (crypto only). */
  warning: string | null;
};

export function describePayment(p: PaymentAddress): PaymentMethod {
  const upper = p.type.toUpperCase();
  const coin = COINS.find((c) => c.match.test(upper));
  // "ETH" alone is the coin, not a network; only treat it as a network when another coin is named.
  const network = coin && coin.code !== 'ETH' && coin.code !== 'SOL' ? NETWORKS.find((n) => n.match.test(upper))?.network ?? null : null;
  const code = coin?.code ?? p.type.trim();
  const name = coin ? (network ? `${coin.name} (${network.name})` : coin.name) : 'Payment address';
  const warning = coin?.crypto
    ? network
      ? `Only send ${coin.code} on the ${network.name}${network.standard === network.name ? '' : ` (${network.standard})`} network.`
      : `Only send ${coin.code} to this address.`
    : null;
  return {
    ...p,
    code,
    name,
    glyph: coin?.glyph ?? (p.type.trim()[0] ?? '?').toUpperCase(),
    color: coin?.color ?? '#475569',
    network,
    stable: !!coin?.stable,
    popular: POPULAR.has(code),
    warning,
  };
}

export function MethodIcon({ method, className }: { method: PaymentMethod; className?: string }) {
  return (
    <span
      className={cn('flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-white', className)}
      style={{ background: method.color }}
      aria-hidden="true"
    >
      {method.glyph}
    </span>
  );
}

function MethodLabel({ method }: { method: PaymentMethod }) {
  return (
    <span className="min-w-0 text-left leading-tight">
      <span className="flex items-center gap-2">
        <span className="truncate text-base font-extrabold text-ink-hi">{method.code}</span>
        {method.network && <span className={cn('rounded px-1.5 py-px text-[11px] font-extrabold tracking-wide', method.network.className)}>{method.network.badge}</span>}
      </span>
      <span className="mt-0.5 block truncate text-sm text-ink-mid">{method.name}</span>
    </span>
  );
}

type Filter = 'all' | 'popular' | 'stable';

/** Payment method select: the chosen method, and a panel with search, quick filters and the list. */
export function PaymentMethodPicker({
  methods,
  value,
  onChange,
}: {
  methods: PaymentMethod[];
  value: PaymentMethod;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => {
    const terms = q.trim().toLowerCase();
    return methods.filter(
      (m) =>
        (filter === 'all' || (filter === 'popular' ? m.popular : m.stable)) &&
        (!terms || `${m.type} ${m.code} ${m.name} ${m.network?.badge ?? ''} ${m.network?.standard ?? ''}`.toLowerCase().includes(terms)),
    );
  }, [methods, q, filter]);

  const many = methods.length > 1;
  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...(methods.some((m) => m.popular) ? [{ id: 'popular' as const, label: 'Popular' }] : []),
    ...(methods.some((m) => m.stable) ? [{ id: 'stable' as const, label: 'Stablecoins' }] : []),
  ];

  return (
    <div
      onKeyDown={(e) => {
        // Esc closes the list, not the whole dialog.
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => many && setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border bg-bg-card px-4 py-3 text-left transition',
          open ? 'border-primary ring-4 ring-primary/15' : 'border-line hover:border-ink-lo/50',
          !many && 'cursor-default',
        )}
      >
        <MethodIcon method={value} />
        <span className="min-w-0 flex-1">
          <MethodLabel method={value} />
        </span>
        {many && (open ? <ChevronUp className="size-5 shrink-0 text-ink-mid" /> : <ChevronDown className="size-5 shrink-0 text-ink-mid" />)}
      </button>

      {open && (
        <div className="mt-2 rounded-2xl border border-line bg-bg-card p-3 shadow-lift">
          <label className="relative block">
            <span className="sr-only">Search method or network</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-lo" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search method or network"
              className="w-full rounded-xl border-0 bg-bg-elev py-2.5 pl-10 pr-3 text-sm text-ink-hi outline-none placeholder:text-ink-lo focus:ring-2 focus:ring-primary/30"
            />
          </label>
          {chips.length > 1 && (
            <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Filter methods">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(c.id)}
                  aria-pressed={filter === c.id}
                  className={cn(
                    'rounded-full border px-3.5 py-1 text-sm font-medium transition',
                    filter === c.id ? 'border-primary/60 bg-primary/10 text-primary' : 'border-transparent bg-bg-elev text-ink-mid hover:text-ink-hi',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label="Payment methods">
            {shown.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-lo">No method matches.</li>
            ) : (
              shown.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={m.id === value.id}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      setQ('');
                    }}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 transition', m.id === value.id ? 'bg-primary/10' : 'hover:bg-bg-elev')}
                  >
                    <MethodIcon method={m} />
                    <span className="min-w-0 flex-1">
                      <MethodLabel method={m} />
                    </span>
                    {m.id === value.id && <Check className="size-5 shrink-0 text-primary" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
