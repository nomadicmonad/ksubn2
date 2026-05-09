import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function BannedPage() {
  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="card p-8 text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.14)', color: 'var(--color-danger)' }}>
            <ShieldAlert size={24} />
          </div>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Account restricted</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          This account is currently restricted from using protected features. If you think this is a mistake, contact support.
        </p>
        <div className="pt-2">
          <Link href="/" className="btn-primary">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
