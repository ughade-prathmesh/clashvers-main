import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'clashvers — 1v1 Coding PvP',
  description: 'Real-time 1v1 competitive coding battles. Solve problems faster than your opponent.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="h-full">{children}</body>
    </html>
  );
}
