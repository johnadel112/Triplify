import type { Metadata } from 'next';
import { DM_Sans, Manrope } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

const body = DM_Sans({ subsets: ['latin'], variable: '--font-body' });
const display = Manrope({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: { default: 'Triplify — Plan beyond the map', template: '%s — Triplify' },
  description: 'A thoughtful place to search, book and shape your next journey.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${body.variable} ${display.variable}`}><AuthProvider><SiteHeader /><main>{children}</main></AuthProvider></body></html>;
}
