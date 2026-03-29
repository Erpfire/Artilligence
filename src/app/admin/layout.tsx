import { requireAuth } from "@/lib/auth-check";
import AdminShell from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth("ADMIN");

  return (
    <AdminShell userName={session.user.name || "Admin"}>
      {children}
    </AdminShell>
  );
}
