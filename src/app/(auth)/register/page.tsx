'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ImageUpload } from '@/components/post-bits';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo } from '@/lib/client/types';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/register', { json: { ...form, image } });
      window.location.href = '/feed';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account.');
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-1 text-sm text-ink-mid">Free. No approval needed.</p>
      </div>
      <ImageUpload value={image} onChange={setImage} label="Add a photo" round />
      <Field label="Name" htmlFor="name">
        <Input id="name" required maxLength={100} value={form.name} onChange={set('name')} autoComplete="name" />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
      </Field>
      <Field label="Password (at least 8 characters)" htmlFor="password">
        <Input id="password" type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      {error && <p className="rounded-xl border border-state-err/40 bg-state-err/10 px-3 py-2 text-sm text-state-err">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        Create account
      </Button>
      <p className="text-center text-sm text-ink-mid">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-mint hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
