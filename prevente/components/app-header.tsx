import Link from "next/link";
import { logout } from "@/lib/auth/actions";

export type NavItem = { href: string; label: string; key: string; icon?: React.ReactNode };

/**
 * Classes à poser sur le conteneur d'un espace qui a la barre d'onglets du bas : réserve sa hauteur
 * sous le contenu et l'expose dans `--bottom-nav` (les barres collées en bas, comme celle de la
 * saisie de commande, se placent au-dessus). Sur grand écran, les onglets restent dans l'en-tête.
 */
export const bottomNavSpace = "[--bottom-nav:4rem] sm:[--bottom-nav:0px] pb-(--bottom-nav)";

/** Icône d'onglet (trait de 24 px) à partir de tracés SVG. */
export function navIcon(...paths: string[]) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/**
 * En-tête commun aux trois espaces (admin, pré-vendeur, livreur) : bande vert camion avec l'identité,
 * la déconnexion et les onglets ; l'onglet actif est repéré par un trait jaune étiquette. Avec
 * `bottomNav`, les onglets passent dans une barre fixe en bas de l'écran sur téléphone, à portée de pouce.
 */
export default function AppHeader({
  space,
  nav = [],
  navLabel,
  current,
  wide = false,
  bottomNav = false,
}: {
  /** Nom de l'espace affiché sous le logo (ex. « Administration »). */
  space: string;
  nav?: NavItem[];
  navLabel?: string;
  current?: string;
  wide?: boolean;
  bottomNav?: boolean;
}) {
  const width = wide ? "max-w-6xl" : "max-w-5xl";
  return (
    <>
      <header className="sticky top-0 z-30 bg-emerald-900 text-white">
        <div className={`mx-auto flex ${width} items-center justify-between gap-3 px-4 py-3`}>
          <div className="flex min-w-0 items-center gap-3">
            <div aria-hidden="true" className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-xl text-emerald-800">G</div>
            <div className="min-w-0 leading-tight">
              <p className="font-display truncate text-base">Grossiste Pro</p>
              <p className="truncate text-xs text-emerald-100/80">{space}</p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="h-10 rounded-[10px] border border-white/25 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              Déconnexion
            </button>
          </form>
        </div>
        {nav.length > 0 && (
          <div
            className={`relative mx-auto ${width} ${bottomNav ? "hidden sm:block" : ""} lg:after:hidden after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-gradient-to-l after:from-emerald-900 after:to-transparent`}
          >
            <nav aria-label={navLabel} className="flex gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {nav.map((item) => {
                const active = item.key === current;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative inline-flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 ${
                      active
                        ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-label"
                        : "text-emerald-100/75 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {bottomNav && nav.length > 0 && (
        <nav
          aria-label={navLabel}
          className="fixed inset-x-0 bottom-0 z-30 bg-emerald-900 pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
            {nav.map((item) => {
              const active = item.key === current;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center justify-center gap-1 px-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 ${
                    active
                      ? "text-white before:absolute before:inset-x-5 before:top-0 before:h-[3px] before:rounded-b-full before:bg-label"
                      : "text-emerald-100/70"
                  }`}
                >
                  {item.icon && <span aria-hidden="true" className={active ? "text-label" : ""}>{item.icon}</span>}
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
