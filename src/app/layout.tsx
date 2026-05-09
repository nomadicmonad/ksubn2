import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'ksubn — The Knowledge Graph', template: '%s | ksubn' },
  description: 'Map the hidden connections between people, organizations, and events.',
  openGraph: {
    title: 'ksubn — The Knowledge Graph',
    description: 'Map the hidden connections between people, organizations, and events.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
