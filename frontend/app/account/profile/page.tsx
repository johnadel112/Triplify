'use client';

import { useEffect, useState } from 'react';
import { FormField } from '@/components/form-field';
import { useAuth } from '@/components/auth-provider';
import { ApiError } from '@/lib/api';
import { profileSchema, validationErrors, type FieldErrors } from '@/lib/validation';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setNotice(''); }, [user?.id]);
  if (!user) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setErrors({}); setNotice('');
    const parsed = profileSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) return setErrors(validationErrors(parsed.error));
    setSubmitting(true);
    try { await updateProfile({ ...parsed.data, phoneNumber: parsed.data.phoneNumber || undefined }); setNotice('Profile saved.'); }
    catch (error) { setErrors({ form: error instanceof ApiError ? error.message : 'Unable to save your profile.' }); }
    finally { setSubmitting(false); }
  }

  return <><div className="content-heading"><span className="section-kicker">PROFILE</span><h2>Your traveler details</h2><p>Used to personalize your account and booking experience.</p></div><form className="settings-form" onSubmit={submit} noValidate>
    {notice && <p className="form-notice success-notice">{notice}</p>}{errors.form && <p className="form-notice error-notice">{errors.form}</p>}
    <FormField label="Full name" name="name" defaultValue={user.name} autoComplete="name" error={errors.name} required />
    <FormField label="Email address" value={user.email} readOnly disabled hint="Email changes are not supported by the current API." />
    <div className="field-row"><FormField label="Phone number" name="phoneNumber" defaultValue={user.phoneNumber ?? ''} autoComplete="tel" placeholder="+20 100 000 0000" error={errors.phoneNumber} /><FormField label="Preferred currency" name="preferredCurrency" defaultValue={user.preferredCurrency} maxLength={3} error={errors.preferredCurrency} required /></div>
    <button className="button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save profile'} <span>→</span></button>
  </form></>;
}
