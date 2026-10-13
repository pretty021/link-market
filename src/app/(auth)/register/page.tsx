'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { ImageUpload } from '@/components/post-bits';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo } from '@/lib/client/types';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ resendIn: number }>('/api/auth/register/code', { json: { email: form.email } });
      setResendIn(res.resendIn);
      setCode('');
      setStep('code');
    } catch (err) {
      if (err instanceof ApiError && typeof err.data.resendIn === 'number') {
        // A code was sent less than a minute ago: it is still valid, so go enter it.
        setResendIn(err.data.resendIn);
        setStep('code');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not send the code.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function createAccount() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/register', { json: { ...form, code, image } });
      window.location.href = '/feed';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account.');
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void (step === 'details' ? sendCode() : createAccount());
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const errorBox = error && (
    <p className="rounded-xl border border-state-err/40 bg-state-err/10 px-3 py-2 text-sm text-state-err">{error}</p>
  );

  if (step === 'code') {
    return (
      <form onSubmit={submit} className="space-y-4">
        <div>
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-mint/10 text-brand-mint">
            <MailCheck className="size-5" />
          </span>
          <h1 className="mt-3 text-2xl font-bold">Check your email</h1>
          <p className="mt-1 text-sm text-ink-mid">
            We sent a 6-digit code to <span className="font-semibold text-ink-hi">{form.email}</span>.
          </p>
        </div>
        <Field label="Code" htmlFor="code">
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            maxLength={6}
            pattern="\d{6}"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-center font-mono text-2xl tracking-[0.5em]"
          />
        </Field>
        {errorBox}
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={code.length !== 6}>
          Create account
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => (setStep('details'), setError(null))}
            className="font-semibold text-ink-mid hover:text-ink-hi"
          >
            Change email
          </button>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={busy || resendIn > 0}
            className="font-semibold text-brand-mint hover:underline disabled:cursor-not-allowed disabled:text-ink-lo disabled:no-underline"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
          </button>
        </div>
        <p className="text-center text-xs text-ink-lo">No email? Check spam. The code expires in 10 minutes.</p>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-1 text-sm text-ink-mid">Free. We email you a code to confirm.</p>
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
      {errorBox}
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        Send code
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
