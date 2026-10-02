import Link from "next/link";
import AppHeader from "@/components/app-header";

const NAV = [
  { href: "/admin/dashboard", label: "Tableau de bord", key: "dashboard" },
  { href: "/admin/orders", label: "Commandes", key: "orders" },
  { href: "/admin/customers", label: "Clients", key: "customers" },
  { href: "/admin/products", label: "Produits et stock", key: "products" },
  { href: "/admin/planning", label: "Planning", key: "planning" },
  { href: "/admin/workdays", label: "Journées", key: "workdays" },
  { href: "/admin/users", label: "Utilisateurs", key: "users" },
] as const;

export type AdminSection = (typeof NAV)[number]["key"];

export default function AdminShell({
  current,
  title,
  back,
  children,
}: {
  current: AdminSection;
  title: string;
  /** Lien de retour affiché au-dessus du titre (pages de détail). */
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <AppHeader space="Administration" nav={[...NAV]} navLabel="Administration" current={current} wide />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-800 hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="font-display mb-5 text-[1.75rem] leading-tight text-slate-900 sm:text-3xl">{title}</h1>
        <div className="space-y-5">{children}</div>
      </main>
    </div>
  );
}
