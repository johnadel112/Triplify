'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';
import { StatusPanel } from './status-panel';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, pathname, router, user]);

  if (loading) return <StatusPanel tone="loading" title="Checking your session" message="Securely reconnecting to Triplify…" />;
  if (!user) return <StatusPanel tone="loading" title="Taking you to sign in" message="Your session is no longer active." />;
  return children;
}
