import AppHeader, { bottomNavSpace, navIcon } from "@/components/app-header";

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
    { href: "/vendeur/dashboard", label: "Ma journée", key: "dashboard", icon: navIcon("M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z") },
    ...(dayId
      ? [
          { href: `/vendeur/jour/${dayId}/clients`, label: "Clients", key: "clients", icon: navIcon("M4 10h16l-1.5-5h-13z", "M5 10v10h14V10", "M10 20v-5h4v5") },
          { href: `/vendeur/jour/${dayId}/commandes`, label: "Commandes", key: "orders", icon: navIcon("M9 4h6v3H9z", "M9 5.5H6v15h12v-15h-3", "M9 12h6M9 16h4") },
        ]
      : []),
  ];
  // Sans journée ouverte, un seul onglet : pas de barre du bas.
  const bottomNav = nav.length > 1;
  return (
    <div className={`min-h-dvh bg-slate-50 ${bottomNav ? bottomNavSpace : ""}`}>
      <AppHeader space="Espace pré-vendeur" nav={nav} navLabel="Espace pré-vendeur" current={current} bottomNav={bottomNav} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <h1 className="font-display mb-5 text-[1.75rem] leading-tight text-slate-900 sm:text-3xl">{title}</h1>
        <div className="space-y-5">{children}</div>
      </main>
    </div>
  );
}
