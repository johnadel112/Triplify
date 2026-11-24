"use client";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <span className="section-kicker">WELCOME BACK</span>
      <h2>{user.name}</h2>
      <p>Your personal details and security, in one place.</p>
      <dl className="profile-summary">
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Preferred currency</dt>
        <dd>{user.preferredCurrency}</dd>
        <dt>Account status</dt>
        <dd>{user.status}</dd>
      </dl>
      <div className="actions">
        <Link className="button" href="/account/profile">
          Edit profile
        </Link>
        <Link className="text-link" href="/account/security">
          Security settings
        </Link>
      </div>
    </>
  );
}
