"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export const adminLinks = [
  ["/admin", "Operations"],
  ["/admin/accounts", "User accounts"],
  ["/admin/moderators", "Moderators"],
  ["/admin/providers", "Providers"],
  ["/admin/bookings", "Bookings"],
  ["/admin/reports", "Content reports"],
  ["/admin/audit-logs", "Audit logs"],
] as const;
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Administration">
      <span className="section-kicker">TRIPLIFY OPERATIONS</span>
      {adminLinks.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
      <Link href="/account/security">Account security</Link>
    </nav>
  );
}
