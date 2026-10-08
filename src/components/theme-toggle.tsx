'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark';

/** Sun/moon button. The initial theme is set before paint by the script in app/layout.tsx. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private mode or blocked storage: the choice just won't persist.
    }
    setTheme(next);
  }

  const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn('rounded-xl p-2 text-ink-mid transition hover:bg-bg-elev hover:text-ink-hi', className)}
    >
      {theme === 'light' ? <Moon className="size-5" /> : <Sun className={cn('size-5', theme === null && 'opacity-0')} />}
    </button>
  );
}
