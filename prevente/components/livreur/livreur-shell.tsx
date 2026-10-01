import Link from "next/link";
import AppHeader, { bottomNavSpace, navIcon } from "@/components/app-header";

const NAV = [
  { href: "/livreur/dashboard", label: "Accueil", key: "dashboard", icon: navIcon("M4 11 12 4l8 7", "M6 9.5V20h12V9.5", "M10 20v-5h4v5") },
  { href: "/livreur/commandes", label: "À livrer", key: "orders", icon: navIcon("M4 8l8-4 8 4-8 4z", "M4 8v8l8 4 8-4V8", "M12 12v8") },
  { href: "/livreur/livraisons", label: "Aujourd'hui", key: "today", icon: navIcon("M3 6h11v10H3z", "M14 10h4l3 3v3h-7", "M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z") },
  { href: "/livreur/historique", label: "Historique", key: "history", icon: navIcon("M12 7v5l3 2", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z") },
] as const;

export type LivreurSection = (typeof NAV)[number]["key"];

/** Même structure que VendeurShell / AdminShell : en-tête commun, onglets (en bas sur téléphone), titre, contenu en cartes. */
export default function LivreurShell({
  current,
  title,
  back,
  children,
}: {
  current: LivreurSection;
  title: string;
  /** Lien de retour affiché au-dessus du titre (pages de détail). */
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className={`min-h-dvh bg-slate-50 ${bottomNavSpace}`}>
      <AppHeader space="Espace livreur" nav={[...NAV]} navLabel="Espace livreur" current={current} bottomNav />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
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
