'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { useAuth } from '@/components/auth-provider';
import { ApiError } from '@/lib/api';
import { registerSchema, validationErrors, type FieldErrors } from '@/lib/validation';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setErrors({});
    const form = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({ name: form.get('name'), email: form.get('email'), password: form.get('password'), consent: form.get('consent') === 'on' });
    if (!parsed.success) return setErrors(validationErrors(parsed.error));
    setSubmitting(true);
    try { await register(parsed.data); router.replace('/login?registered=1'); }
    catch (error) { setErrors({ form: error instanceof ApiError ? error.message : 'Unable to create your account.' }); }
    finally { setSubmitting(false); }
  }

  return <div className="auth-page register-page"><section className="auth-story"><span className="eyebrow light"><i /> Begin here</span><h1>Make room for somewhere new.</h1><p>Create one account for the flights, stays and ideas that shape your trip.</p><div className="auth-steps"><span><b>01</b> Your details</span><span><b>02</b> Explore</span><span><b>03</b> Take off</span></div></section><section className="auth-panel"><form className="auth-form" onSubmit={submit} noValidate>
    <div><span className="section-kicker">CREATE ACCOUNT</span><h2>Tell us who’s traveling.</h2></div>
    {errors.form && <p className="form-notice error-notice" role="alert">{errors.form}</p>}
    <FormField label="Full name" name="name" autoComplete="name" placeholder="Your name" error={errors.name} required />
    <FormField label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={errors.email} required />
    <FormField label="Password" name="password" type="password" autoComplete="new-password" placeholder="8–72 characters" hint="Include at least one letter and number." error={errors.password} required />
    <label className="check-field"><input type="checkbox" name="consent" /><span>I accept the terms and consent to account processing.</span></label>{errors.consent && <span className="field-error">{errors.consent}</span>}
    <button className="button button-wide" type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'} <span>→</span></button>
    <p className="form-foot">Already a member? <Link href="/login">Sign in</Link></p>
  </form><p className="secure-note">We only ask for what your account needs.</p></section></div>;
}
