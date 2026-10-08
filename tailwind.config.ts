import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: '#0a1226',
          base: '#0f1a33',
          card: '#162041',
          elev: '#1b2651',
        },
        line: '#243160',
        ink: {
          hi: '#eef2ff',
          mid: '#b7c0e0',
          lo: '#7f8ab0',
        },
        brand: {
          mint: '#4de3b4',
          mintSoft: '#8bf0cf',
          purple: '#8a7dff',
          purpleSoft: '#b2a9ff',
        },
        state: {
          ok: '#36d399',
          warn: '#fbbf24',
          err: '#f87171',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(77,227,180,0.18), 0 10px 30px -10px rgba(77,227,180,0.25)',
        soft: '0 10px 30px -12px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'grad-mint': 'linear-gradient(135deg,#4de3b4 0%,#2bb98d 100%)',
        'grad-purple': 'linear-gradient(135deg,#8a7dff 0%,#5d4fe0 100%)',
        'grad-hero': 'radial-gradient(1200px 500px at 10% -10%, rgba(138,125,255,0.25), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(77,227,180,0.18), transparent 55%), linear-gradient(180deg,#0a1226 0%,#0b1a3a 100%)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
