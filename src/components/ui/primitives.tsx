import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn, initials } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn('field', className)} {...props} />,
);
Input.displayName = 'Input';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-xs font-medium text-ink-mid', className)} {...props} />
));
Label.displayName = 'Label';

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-state-err">{error}</p>}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel', className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-brand-mint">{icon}</div>}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink-hi">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-lo">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type Tone = 'mint' | 'purple' | 'amber' | 'red' | 'slate';
const tones: Record<Tone, string> = {
  mint: 'border-brand-mint/40 bg-brand-mint/10 text-brand-mint',
  purple: 'border-brand-purple/50 bg-brand-purple/15 text-brand-purpleSoft',
  amber: 'border-state-warn/40 bg-state-warn/10 text-state-warn',
  red: 'border-state-err/40 bg-state-err/10 text-state-err',
  slate: 'border-line bg-bg-elev text-ink-mid',
};

export function Badge({ tone = 'slate', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Avatar({ name, src, size = 36, online }: { name: string | null | undefined; src?: string | null; size?: number; online?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full rounded-full object-cover ring-2 ring-brand-purple/40" />
      ) : (
        <span
          className="flex size-full items-center justify-center rounded-full bg-grad-purple font-semibold text-white ring-2 ring-brand-purple/30"
          style={{ fontSize: size * 0.36 }}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-bg-card',
            online ? 'bg-state-ok' : 'bg-ink-lo',
          )}
        />
      )}
    </span>
  );
}

export function Empty({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-ink-lo [&_svg]:size-8">{icon}</div>}
      <p className="text-sm font-medium text-ink-mid">{title}</p>
      {hint && <p className="max-w-sm text-xs text-ink-lo">{hint}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-5 animate-spin rounded-full border-2 border-brand-mint/30 border-t-brand-mint', className)} />;
}
