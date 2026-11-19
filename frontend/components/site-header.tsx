'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from './auth-provider';

const roleLabels = {
  USER: 'Traveler',
  ADMIN: 'Administrator',
  HOTEL_MODERATOR: 'Hotel partner',
  AIRLINE_MODERATOR: 'Airline partner',
} as const;

export function SiteHeader() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links = user
    ? [{ href: '/dashboard', label: 'Workspace' }, { href: '/account/profile', label: 'Account' }]
    : [{ href: '/', label: 'Discover' }, { href: '/login', label: 'Sign in' }];

  async function signOut() {
    await logout();
    setOpen(false);
    router.replace('/');
  }

  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link className="brand" href="/" aria-label="Triplify home">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>TRIPLIFY<small>Plan beyond the map</small></span>
        </Link>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>Menu</button>
        <nav id="main-navigation" className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
          {links.map((link) => <Link className={pathname === link.href ? 'active' : ''} href={link.href} key={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
          {!loading && user && <><span className="role-chip">{roleLabels[user.role]}</span><button className="nav-button" type="button" onClick={signOut}>Sign out</button></>}
          {!loading && !user && <Link className="button button-small" href="/register" onClick={() => setOpen(false)}>Join Triplify</Link>}
        </nav>
      </div>
    </header>
  );
}
