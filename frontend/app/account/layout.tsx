import { AccountNav } from '@/components/account-nav';
import { ProtectedRoute } from '@/components/protected-route';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute><div className="container account-page page-space"><header className="account-heading"><span className="section-kicker">MY TRIPLIFY</span><h1>Account settings</h1><p>The practical details behind smoother journeys.</p></header><div className="account-layout"><AccountNav /><section className="account-content">{children}</section></div></div></ProtectedRoute>;
}
