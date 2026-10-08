'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import { homePath } from '@/lib/home';
import type { Me } from '@/lib/client/types';

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('blocked') ? 'Your session ended because your account was blocked or signed out.' : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { me } = await api<{ me: Me }>('/api/auth/login', { json: { email, password } });
      window.location.href = homePath(me.kind === 'admin' ? me : { kind: 'user', role: me.role });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-mid">Log in as an admin, seller or buyer.</p>
      </div>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="rounded-xl border border-state-err/40 bg-state-err/10 px-3 py-2 text-sm text-state-err">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        Log in
      </Button>
      <p className="text-center text-sm text-ink-mid">
        New buyer?{' '}
        <Link href="/register" className="font-semibold text-brand-mint hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
