"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { AirlineNav } from "@/components/airline-nav";
import { Breadcrumbs } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";

export default function AirlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  return (
    <ProtectedRoute roles={["AIRLINE_MODERATOR"]}>
      <div className="admin-layout">
        <AirlineNav />
        <section className="admin-content">
          <Breadcrumbs
            items={[
              { label: "Triplify", href: "/" },
              { label: "Dashboard", href: "/dashboard" },
              { label: "Airline operations" },
            ]}
          />
          {!user?.providerId && (
            <p className="form-notice error-notice" role="alert">
              Your account does not have an assigned airline provider ID. Please contact an administrator.
            </p>
          )}
          {children}
        </section>
      </div>
    </ProtectedRoute>
  );
}
