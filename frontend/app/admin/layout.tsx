import { ProtectedRoute } from "@/components/protected-route";
import { AdminNav } from "@/components/admin-nav";
import { Breadcrumbs } from "@/components/ui";
export const dynamic = "force-dynamic";
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute roles={["ADMIN"]}>
      <div className="admin-layout">
        <AdminNav />
        <section className="admin-content">
          <Breadcrumbs
            items={[
              { label: "Triplify", href: "/" },
              { label: "Administration" },
            ]}
          />
          {children}
        </section>
      </div>
    </ProtectedRoute>
  );
}
