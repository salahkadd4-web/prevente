import DashboardShell from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth/session";

export const metadata = {
  title: "Espace pré-vendeur · Grossiste Pro",
};

export default async function Page() {
  const profile = await requireRole("vendeur");

  return <DashboardShell title="Espace pré-vendeur" profile={profile} />;
}
