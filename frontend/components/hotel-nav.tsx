"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const hotelLinks = [
  ["/dashboard/hotel", "Hotel profile & photos"],
  ["/dashboard/hotel/rooms", "Rooms & availability"],
  ["/dashboard/hotel/policies", "Check-in & cancellation"],
  ["/dashboard/hotel/reservations", "Guest reservations"],
] as const;

export function HotelNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Hotel operations">
      <span className="section-kicker">HOTEL OPERATIONS</span>
      {hotelLinks.map(([href, label]) => (
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
