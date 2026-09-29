import DashboardShell from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth/session";

export const metadata = {
  title: "Espace livreur · Grossiste Pro",
};

export default async function Page() {
  const profile = await requireRole("livreur");

  return <DashboardShell title="Espace livreur" profile={profile} />;
}
