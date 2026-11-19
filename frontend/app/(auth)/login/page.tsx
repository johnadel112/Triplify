'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FormField } from '@/components/form-field';
import { useAuth } from '@/components/auth-provider';
import { ApiError } from '@/lib/api';
import { safeReturnPath } from '@/lib/redirects';
import { loginSchema, validationErrors, type FieldErrors } from '@/lib/validation';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState(search.get('registered') ? 'Account created. Sign in to continue.' : '');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({}); setNotice('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) return setErrors(validationErrors(parsed.error));
    setSubmitting(true);
    try {
      const user = await login(parsed.data);
      router.replace(user.mustChangePassword ? '/account/security' : safeReturnPath(search.get('next')));
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : 'Unable to sign in. Please try again.' });
    } finally { setSubmitting(false); }
  }

  return <AuthFrame eyebrow="Welcome back" title="Your next journey is waiting." intro="Sign in to return to your bookings, saved plans and travel workspace.">
    <form className="auth-form" onSubmit={submit} noValidate>
      {notice && <p className="form-notice success-notice">{notice}</p>}
      {errors.form && <p className="form-notice error-notice" role="alert">{errors.form}</p>}
      <FormField label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={errors.email} required />
      <FormField label="Password" name="password" type="password" autoComplete="current-password" placeholder="Your password" error={errors.password} required />
      <button className="button button-wide" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} <span>→</span></button>
      <p className="form-foot">New here? <Link href="/register">Create your account</Link></p>
    </form>
  </AuthFrame>;
}

function AuthFrame({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return <div className="auth-page"><section className="auth-story"><span className="eyebrow light"><i /> {eyebrow}</span><h1>{title}</h1><p>{intro}</p><blockquote>“The world is wide, and the details should feel simple.”</blockquote></section><section className="auth-panel">{children}<p className="secure-note">Protected by secure, HttpOnly session cookies.</p></section></div>;
}

export default function LoginPage() { return <Suspense fallback={<div className="auth-page" />}><LoginForm /></Suspense>; }
