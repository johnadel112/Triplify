"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { StatusPanel } from "./status-panel";
import type { UserRole } from "@/lib/types";
import { accessDecision } from "@/lib/access";

export function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: UserRole[];
}) {
  const { user, loading, sessionError, reload, exitPath } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const decision = accessDecision(user, pathname, roles);

  useEffect(() => {
    if (!loading && !user && !sessionError)
      router.replace(exitPath || `/login?next=${encodeURIComponent(pathname)}`);
    if (!loading && decision === "password")
      router.replace("/account/security");
  }, [loading, pathname, router, user, decision, sessionError, exitPath]);

  if (loading)
    return (
      <StatusPanel
        tone="loading"
        title="Checking your session"
        message="Securely reconnecting to Triplify…"
      />
    );
  if (sessionError)
    return (
      <StatusPanel
        tone="error"
        title="Session unavailable"
        message={sessionError}
        action={<button onClick={() => void reload()}>Try again</button>}
      />
    );
  if (!user)
    return (
      <StatusPanel
        tone="loading"
        title="Taking you to sign in"
        message="Your session is no longer active."
      />
    );
  if (decision === "password")
    return (
      <StatusPanel
        tone="loading"
        title="Password update required"
        message="Opening your security settings."
      />
    );
  if (decision === "denied")
    return (
      <StatusPanel
        tone="error"
        title="Access denied"
        message="Your account does not have permission to use this area."
      />
    );
  return children;
}
