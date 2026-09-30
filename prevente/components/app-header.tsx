import Link from "next/link";
import { logout } from "@/lib/auth/actions";
import { btnGhost } from "@/components/ui";

export type NavItem = { href: string; label: string; key: string };

/**
 * En-tête commun aux trois espaces (admin, pré-vendeur, livreur) : identité, déconnexion et navigation.
 * Il reste collé en haut de l'écran pour que la navigation soit toujours à portée de pouce, et un
 * dégradé signale qu'il y a des onglets à faire défiler sur petit écran.
 */
export default function AppHeader({
  space,
  nav = [],
  navLabel,
  current,
  wide = false,
}: {
  /** Nom de l'espace affiché sous le logo (ex. « Administration »). */
  space: string;
  nav?: NavItem[];
  navLabel?: string;
  current?: string;
  wide?: boolean;
}) {
  const width = wide ? "max-w-6xl" : "max-w-5xl";
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className={`mx-auto flex ${width} items-center justify-between gap-3 px-4 py-2.5`}>
        <div className="flex min-w-0 items-center gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">G</div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-base font-semibold text-slate-900">Grossiste Pro</p>
            <p className="truncate text-xs text-slate-500">{space}</p>
          </div>
        </div>
        <form action={logout}>
          <button type="submit" className={btnGhost}>Déconnexion</button>
        </form>
      </div>
      {nav.length > 0 && (
        <div className={`relative mx-auto ${width} lg:after:hidden after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-gradient-to-l after:from-white after:to-transparent`}>
          <nav aria-label={navLabel} className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === current ? "page" : undefined}
                className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 ${
                  item.key === current ? "bg-emerald-700 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
