import DashboardShell from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth/session";

export const metadata = {
  title: "Tableau de bord administrateur · Grossiste Pro",
};

export default async function Page() {
  const profile = await requireRole("admin");

  return <DashboardShell title="Tableau de bord administrateur" profile={profile} />;
}
