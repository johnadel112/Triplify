"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { Notice } from "./ui";
export function SiteHeader() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const links = user
    ? [
        { href: "/", label: "Discover" },
        { href: "/account", label: "My account" },
        ...(user.role === "ADMIN"
          ? [{ href: "/admin", label: "Administration" }]
          : []),
          ...(["AIRLINE_MODERATOR", "HOTEL_MODERATOR"].includes(user.role)
          ? [
              {
                href: "/dashboard",
                label:
                  user.role === "AIRLINE_MODERATOR"
                    ? "Airline workspace"
                    : "Hotel workspace",
              },
            ]
          : []),
      ]
    : [
        { href: "/", label: "Discover" },
        { href: "/login", label: "Sign in" },
      ];
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await logout();
      setOpen(false);
      router.replace("/");
      router.refresh();
    } catch {
      setError("Sign out failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <div className="nav-wrap">
        <Link className="brand" href="/" aria-label="Triplify home">
          TRIPLIFY
          <span className="brand-rule" />
        </Link>
        <button
          className="menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
        <nav
          id="main-navigation"
          className={open ? "main-nav is-open" : "main-nav"}
          aria-label="Main navigation"
        >
          {links.map((link) => (
            <Link
              aria-current={pathname === link.href ? "page" : undefined}
              href={link.href}
              key={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {!loading && user && (
            <button className="nav-button" disabled={busy} onClick={signOut}>
              {busy ? "Signing out…" : "Sign out"}
            </button>
          )}
          {!loading && !user && (
            <Link
              className="button button-small"
              href="/register"
              onClick={() => setOpen(false)}
            >
              Join Triplify
            </Link>
          )}
        </nav>
      </div>
      <Notice error>{error}</Notice>
    </header>
  );
}
