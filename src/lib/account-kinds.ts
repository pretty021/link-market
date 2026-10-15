export const ACCOUNT_KINDS = ['LINKEDIN', 'GV', 'GMAIL', 'WHATSAPP', 'TELEGRAM'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  LINKEDIN: 'LinkedIn',
  GV: 'GV',
  GMAIL: 'Gmail',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
};

export function isAccountKind(value: string): value is AccountKind {
  return (ACCOUNT_KINDS as readonly string[]).includes(value);
}

const KIND_LOGO: Partial<Record<AccountKind, string>> = {
  GV: '/gv.png',
  GMAIL: '/gmail.png',
  WHATSAPP: '/whatsapp.png',
  TELEGRAM: '/telegram.png',
};

export function kindLogoSrc(kind?: string | null) {
  if (kind !== 'GV' && kind !== 'GMAIL' && kind !== 'WHATSAPP' && kind !== 'TELEGRAM') return null;
  return KIND_LOGO[kind] ?? null;
}

export function isKindLogoSrc(src?: string | null) {
  return src === '/gv.png' || src === '/gmail.png' || src === '/whatsapp.png' || src === '/telegram.png';
}

/** Plain person placeholder for an account without a photo (globals.css swaps in the dark version). */
export const DEFAULT_ACCOUNT_IMAGE = '/default-account.svg';

/** Picture shown when an account has no upload. Logos stay contained; other covers fill the frame. */
export function coverSrc(imageUrl: string | null | undefined, kind?: string | null) {
  return imageUrl || kindLogoSrc(kind) || DEFAULT_ACCOUNT_IMAGE;
}

export function coverIsLogo(imageUrl: string | null | undefined, kind?: string | null) {
  return !imageUrl && kindLogoSrc(kind) !== null;
}

export function coverClass(imageUrl: string | null | undefined, kind?: string | null, pad = 'p-1') {
  return coverIsLogo(imageUrl, kind) ? `size-full bg-white object-contain ${pad}` : 'size-full object-cover';
}

/** LinkedIn keeps its current routes. The other catalogs have their own page. */
export function kindHref(kind: AccountKind, side: 'admin' | 'client' | 'customer') {
  if (kind === 'LINKEDIN') {
    if (side === 'admin') return '/admin/posts';
    if (side === 'client') return '/client';
    return '/feed';
  }
  const slug = kind.toLowerCase();
  if (side === 'admin') return `/admin/${slug}`;
  if (side === 'client') return `/client/${slug}`;
  return `/feed/${slug}`;
}
