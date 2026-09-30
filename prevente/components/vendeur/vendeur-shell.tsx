import AppHeader from "@/components/app-header";

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
    { href: "/vendeur/dashboard", label: "Ma journée", key: "dashboard" },
    ...(dayId
      ? [
          { href: `/vendeur/jour/${dayId}/clients`, label: "Clients", key: "clients" },
          { href: `/vendeur/jour/${dayId}/commandes`, label: "Commandes", key: "orders" },
        ]
      : []),
  ];
  return (
    <div className="min-h-dvh bg-slate-50">
      <AppHeader space="Espace pré-vendeur" nav={nav} navLabel="Espace pré-vendeur" current={current} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <div className="space-y-5">{children}</div>
      </main>
    </div>
  );
}
