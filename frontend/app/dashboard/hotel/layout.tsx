"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { HotelNav } from "@/components/hotel-nav";
import { Breadcrumbs } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";

export default function HotelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  return (
    <ProtectedRoute roles={["HOTEL_MODERATOR"]}>
      <div className="admin-layout">
        <HotelNav />
        <section className="admin-content">
          <Breadcrumbs
            items={[
              { label: "Triplify", href: "/" },
              { label: "Dashboard", href: "/dashboard" },
              { label: "Hotel operations" },
            ]}
          />
          {!user?.providerId && (
            <p className="form-notice error-notice" role="alert">
              Your account does not have an assigned hotel provider ID. Please contact an administrator.
            </p>
          )}
          {children}
        </section>
      </div>
    </ProtectedRoute>
  );
}
