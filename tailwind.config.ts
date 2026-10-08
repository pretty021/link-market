import type { Config } from 'tailwindcss';

// Colors are CSS variables (RGB channels) so every class works in both themes and keeps
// opacity modifiers like bg-bg-card/80. Values live in globals.css (light default + dark).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: v('bg-deep'),
          base: v('bg-base'),
          card: v('bg-card'),
          elev: v('bg-elev'),
        },
        line: v('line'),
        ink: {
          hi: v('ink-hi'),
          mid: v('ink-mid'),
          lo: v('ink-lo'),
        },
        brand: {
          mint: v('mint'),
          mintSoft: v('mint-soft'),
          purple: v('purple'),
          purpleSoft: v('purple-soft'),
        },
        'on-mint': v('on-mint'),
        // Active/primary buttons: LinkedIn blue #0A66C2 in both themes.
        primary: { DEFAULT: v('primary'), hover: v('primary-hover') },
        'on-primary': v('on-primary'),
        state: {
          ok: v('ok'),
          warn: v('warn'),
          err: v('err'),
        },
      },
      boxShadow: {
        glow: 'none',
        soft: '0 1px 2px rgb(var(--shadow) / var(--shadow-alpha)), 0 1px 1px rgb(var(--shadow) / calc(var(--shadow-alpha) / 2))',
        lift: '0 12px 32px -12px rgb(var(--shadow) / calc(var(--shadow-alpha) * 2.5))',
      },
      backgroundImage: {
        // Kept as flat fills: the redesign uses no gradients.
        'grad-mint': 'linear-gradient(rgb(var(--mint)), rgb(var(--mint)))',
        'grad-purple': 'linear-gradient(rgb(var(--purple)), rgb(var(--purple)))',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
