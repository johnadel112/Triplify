'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ApiError } from '@/lib/api';

export default function SettingsPage() {
  const { user, deactivate } = useAuth();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (!user) return null;
  if (user.role !== 'USER') return <div className="content-heading"><span className="section-kicker">SETTINGS</span><h2>Provider account controls</h2><p>Moderator and administrator lifecycle changes are managed by an authorized administrator.</p></div>;
  async function deactivateAccount() {
    setError(''); setSubmitting(true);
    try { await deactivate(); router.replace('/?account=deactivated'); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Unable to deactivate this account.'); }
    finally { setSubmitting(false); }
  }
  return <><div className="content-heading"><span className="section-kicker">SETTINGS</span><h2>Account controls</h2><p>Account deactivation is permanent and ends every active session.</p></div><section className="danger-zone"><h3>Deactivate account</h3><p>You cannot deactivate while you have an upcoming confirmed booking. Type <strong>DEACTIVATE</strong> to confirm.</p>{error && <p className="form-notice error-notice">{error}</p>}<FormField label="Confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="DEACTIVATE" /><button className="danger-button" type="button" disabled={confirmation !== 'DEACTIVATE' || submitting} onClick={deactivateAccount}>{submitting ? 'Deactivating…' : 'Deactivate my account'}</button></section></>;
}
