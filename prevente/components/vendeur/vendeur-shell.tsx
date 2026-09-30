import Link from "next/link";
import { logout } from "@/lib/auth/actions";
import { btnGhost } from "@/components/ui";

export type VendeurSection = "dashboard" | "clients" | "orders";

export default function VendeurShell({
  current,
  title,
  dayId,
  children,
}: {
  current: VendeurSection;
  title: string;
  /** Journée affichée : active les onglets Clients / Commandes du jour. */
  dayId?: string;
  children: React.ReactNode;
}) {
  const nav = [
    { href: "/vendeur/dashboard", label: "Tableau de bord", key: "dashboard" as const },
    ...(dayId
      ? [
          { href: `/vendeur/jour/${dayId}/clients`, label: "Clients du jour", key: "clients" as const },
          { href: `/vendeur/jour/${dayId}/commandes`, label: "Commandes du jour", key: "orders" as const },
        ]
      : []),
  ];
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">G</div>
            <span className="text-base font-semibold text-slate-900">Grossiste Pro</span>
          </div>
          <form action={logout}>
            <button type="submit" className={btnGhost}>Se déconnecter</button>
          </form>
        </div>
        <nav aria-label="Espace pré-vendeur" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {nav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                item.key === current ? "bg-emerald-700 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <div className="space-y-5">{children}</div>
      </main>
    </div>
  );
}
