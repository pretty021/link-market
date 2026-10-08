'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Timer } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useCountdown } from '@/lib/client/clock';
import type { ImageInfo, PostStatus } from '@/lib/client/types';
import { cn } from '@/lib/utils';
import { Badge, Spinner } from './ui/primitives';

export function StatusBadge({ status, mine }: { status: PostStatus; mine?: boolean }) {
  switch (status) {
    case 'REQUESTED':
      return <Badge tone="amber">Requested</Badge>;
    case 'PUBLISHED':
      return <Badge tone="mint">Published</Badge>;
    case 'PROGRESSING':
      return <Badge tone="purple">{mine ? 'Your hold' : 'In progress'}</Badge>;
    case 'COMPLETED':
      return <Badge tone="slate">Completed</Badge>;
  }
}

export function Countdown({
  expiresAt,
  onDone,
  className,
  big,
}: {
  expiresAt: string | null;
  onDone?: () => void;
  className?: string;
  big?: boolean;
}) {
  const { label, ms } = useCountdown(expiresAt, onDone);
  const urgent = ms > 0 && ms < 60_000;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border font-mono font-semibold tabular-nums',
        big ? 'px-3 py-1.5 text-lg' : 'px-2 py-0.5 text-xs',
        urgent ? 'border-state-err/50 bg-state-err/10 text-state-err' : 'border-brand-purple/50 bg-brand-purple/10 text-brand-purpleSoft',
        className,
      )}
      aria-label={`Time left ${label}`}
    >
      <Timer className={big ? 'size-4' : 'size-3.5'} />
      {label}
    </span>
  );
}

const palettes = [
  'from-[#1d2b64] via-[#3b2f8f] to-[#4de3b4]',
  'from-[#0f2027] via-[#2c5364] to-[#8a7dff]',
  'from-[#41295a] via-[#2F0743] to-[#4de3b4]',
  'from-[#134e5e] via-[#1b2651] to-[#8a7dff]',
];

export function PostImage({ image, title, className }: { image: ImageInfo | null; title: string; className?: string }) {
  if (image?.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image.url} alt={title} className={cn('size-full object-cover', className)} />;
  }
  const p = palettes[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % palettes.length];
  return (
    <div className={cn('relative flex size-full items-end overflow-hidden bg-gradient-to-br p-3', p, className)}>
      <div className="absolute -right-6 -top-6 size-24 rounded-full bg-white/10 blur-xl" />
      <span className="relative line-clamp-2 text-xs font-semibold text-white/80">{title}</span>
    </div>
  );
}

export function ImageUpload({
  value,
  onChange,
  label = 'Upload image',
  round,
}: {
  value: ImageInfo | null;
  onChange: (img: ImageInfo | null) => void;
  label?: string;
  round?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Use a JPG, PNG or WEBP image.');
    if (file.size > 5 * 1024 * 1024) return setError('Images must be 5 MB or smaller.');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api<{ image: ImageInfo }>('/api/uploads/image', { form });
      onChange(r.image);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden border border-dashed border-line bg-bg-base text-ink-lo transition hover:border-brand-mint/60 hover:text-brand-mint',
          round ? 'size-16 rounded-full' : 'h-20 w-28 rounded-xl',
        )}
        aria-label={label}
      >
        {value?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.url} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-5" />
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-bg-deep/70">
            <Spinner />
          </span>
        )}
      </button>
      <div className="min-w-0 text-xs">
        <button type="button" onClick={() => input.current?.click()} className="font-semibold text-brand-mint hover:underline">
          {value ? 'Replace' : label}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="ml-3 text-ink-lo hover:text-state-err">
            Remove
          </button>
        )}
        <p className="mt-1 text-ink-lo">JPG, PNG or WEBP · max 5 MB</p>
        {error && <p className="mt-1 text-state-err">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
