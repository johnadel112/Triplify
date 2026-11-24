"use client";
import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
function Workspace() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="container page-space">
      <h1>Welcome, {user.name}</h1>
      {user.role === "ADMIN" ? (
        <Link className="button" href="/admin">
          Open administration
        </Link>
      ) : (
        <>
          <p>
            {user.role === "USER"
              ? "Manage your details and account security."
              : `Your ${user.role === "AIRLINE_MODERATOR" ? "airline" : "hotel"} operations workspace is not available yet. Your assigned provider is ${user.providerId ?? "not provided"}.`}
          </p>
          <Link className="button" href="/account">
            Open account
          </Link>
        </>
      )}
    </div>
  );
}
export default function Page() {
  return (
    <ProtectedRoute>
      <Workspace />
    </ProtectedRoute>
  );
}
