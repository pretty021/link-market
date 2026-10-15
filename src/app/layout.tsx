import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Poppins } from 'next/font/google';
import './globals.css';

const font = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
// Headings on the first page.
const display = Poppins({ subsets: ['latin'], weight: ['600', '700'], display: 'swap', variable: '--font-display' });

export const metadata: Metadata = {
  title: 'inonlink',
  description: 'Reviewed LinkedIn, Google Voice, Gmail, WhatsApp and Telegram accounts from real sellers.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0d0f0e' },
    { media: '(prefers-color-scheme: light)', color: '#f8f9f7' },
  ],
};

// Runs before first paint so the page never flashes the wrong theme:
// the saved choice wins, otherwise the clean light theme.
const themeScript = `try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${font.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-[family-name:var(--font-sans)]">{children}</body>
    </html>
  );
}
