import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const font = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = {
  title: { default: 'LinkMarket', template: '%s · LinkMarket' },
  description: 'Browse fresh listings, confirm in real time, and talk directly with the seller.',
};

export const viewport: Viewport = { themeColor: '#0a1226' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="font-[family-name:var(--font-sans)]">{children}</body>
    </html>
  );
}
