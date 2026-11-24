"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [
  ["/account", "Overview"],
  ["/account/profile", "Profile settings"],
  ["/account/security", "Security settings"],
  ["/account/settings", "Account controls"],
] as const;
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="account-nav" aria-label="Account settings">
      {links.map(([href, label]) => (
        <Link
          href={href}
          className={pathname === href ? "active" : ""}
          aria-current={pathname === href ? "page" : undefined}
          key={href}
        >
          {label}
        </Link>
      ))}
      {["My bookings", "My itineraries", "Notifications"].map((label) => (
        <div key={label} className="unavailable">
          {label}
          <span>Not available yet</span>
        </div>
      ))}
    </nav>
  );
}
