"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const airlineLinks = [
  ["/dashboard/airline", "Airline profile"],
  ["/dashboard/airline/flights", "Flight schedules"],
  ["/dashboard/airline/flights/create", "Schedule new flight"],
  ["/dashboard/airline/policies", "Baggage & cancellation"],
] as const;

export function AirlineNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Airline operations">
      <span className="section-kicker">AIRLINE OPERATIONS</span>
      {airlineLinks.map(([href, label]) => (
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
