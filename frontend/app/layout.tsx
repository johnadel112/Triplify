import type { Metadata } from "next";
import Link from "next/link";
import { AuthProvider } from "@/components/auth-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";
import "@fontsource-variable/geist";
export const metadata: Metadata = {
  title: {
    default: "Triplify — Explore exceptionally",
    template: "%s — Triplify",
  },
  description: "A considered way to plan your next journey.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AuthProvider>
          <SiteHeader />
          <main id="main">{children}</main>
          <footer className="site-footer">
            <Link className="brand" href="/">
              TRIPLIFY
            </Link>
            <p>A world of possibilities. A journey of your own.</p>
            <nav aria-label="Footer">
              <Link href="/">Discover</Link>
              <Link href="/account">Your account</Link>
              <Link href="/login">Sign in</Link>
            </nav>
            <small>
              Destination imagery is editorial inspiration, not an availability
              offer.
            </small>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
