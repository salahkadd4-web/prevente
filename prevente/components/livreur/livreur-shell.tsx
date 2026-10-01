import Link from "next/link";
import AppHeader from "@/components/app-header";

const NAV = [
  { href: "/livreur/dashboard", label: "Tableau de bord", key: "dashboard" },
  { href: "/livreur/commandes", label: "À livrer", key: "orders" },
  { href: "/livreur/livraisons", label: "Livraisons du jour", key: "today" },
  { href: "/livreur/historique", label: "Historique", key: "history" },
] as const;

export type LivreurSection = (typeof NAV)[number]["key"];

/** Même structure que VendeurShell / AdminShell : en-tête commun, onglets, titre, contenu en cartes. */
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
    <div className="min-h-dvh bg-slate-50">
      <AppHeader space="Espace livreur" nav={[...NAV]} navLabel="Espace livreur" current={current} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex min-h-10 items-center text-sm font-medium text-emerald-800 hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <div className="space-y-5">{children}</div>
      </main>
    </div>
  );
}
