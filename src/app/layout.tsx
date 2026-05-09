import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
