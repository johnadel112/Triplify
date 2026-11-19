'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';

const workspace = {
  USER: { kicker: 'TRAVELER WORKSPACE', title: 'Where will the story go next?', items: ['Flight and hotel discovery', 'Booking management', 'Itineraries and notifications'] },
  ADMIN: { kicker: 'ADMIN CONTROL ROOM', title: 'Keep every journey moving.', items: ['User and provider management', 'Booking oversight', 'Reports and moderation'] },
  HOTEL_MODERATOR: { kicker: 'HOTEL WORKSPACE', title: 'Make every stay feel considered.', items: ['Property and room management', 'Availability controls', 'Reservation operations'] },
  AIRLINE_MODERATOR: { kicker: 'AIRLINE WORKSPACE', title: 'Shape a smoother way to fly.', items: ['Flight management', 'Schedule and capacity controls', 'Booking operations'] },
} as const;

function DashboardContent() {
  const { user } = useAuth();
  if (!user) return null;
  const content = workspace[user.role];
  return <div className="container dashboard page-space"><section className="dashboard-hero"><div><span className="section-kicker">{content.kicker}</span><h1>Hello, {user.name.split(' ')[0]}.</h1><p>{content.title}</p></div><div className="passport-stamp"><span>{user.role.replace('_', ' ')}</span><strong>{user.preferredCurrency}</strong></div></section><section><div className="section-heading"><div><span className="section-kicker">YOUR SPACE</span><h2>The foundation is ready.</h2></div><p>Feature modules are being added against Triplify’s verified API contracts.</p></div><div className="workspace-grid">{content.items.map((item, index) => <article key={item}><span>0{index + 1}</span><h3>{item}</h3><p>Planned for the assigned module owner.</p><small>COMING NEXT</small></article>)}</div></section><section className="account-callout"><div><span className="section-kicker">ACCOUNT READY</span><h2>Keep your traveler details current.</h2><p>Your profile and security controls are connected to the live backend contract.</p></div><Link className="button" href="/account/profile">Open account <span>→</span></Link></section></div>;
}

export default function DashboardPage() { return <ProtectedRoute><DashboardContent /></ProtectedRoute>; }
