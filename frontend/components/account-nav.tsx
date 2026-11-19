'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/account/profile', label: 'Profile', detail: 'Personal details' },
  { href: '/account/security', label: 'Security', detail: 'Password & sessions' },
  { href: '/account/settings', label: 'Settings', detail: 'Account controls' },
];

export function AccountNav() {
  const pathname = usePathname();
  return <nav className="account-nav" aria-label="Account settings">{links.map((link) => <Link href={link.href} className={pathname === link.href ? 'active' : ''} key={link.href}><strong>{link.label}</strong><span>{link.detail}</span></Link>)}</nav>;
}
