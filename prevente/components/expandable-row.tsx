"use client";

import { useId, useState } from "react";

/**
 * Ligne repliable accessible. `summary` (toujours visible) est DANS le bouton ; les actions
 * (modifier, désactiver…) sont passées à part dans `actions`, hors du bouton : un clic dessus
 * n'ouvre ni ne ferme les détails. `children` = détails, rendus côté serveur puis affichés/masqués.
 */
export default function ExpandableRow({
  summary,
  actions,
  children,
  label,
}: {
  summary: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Nom accessible de l'élément (ex. le nom du produit). */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Masquer" : "Afficher"} les détails : ${label}`}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
        >
          <svg
            aria-hidden="true" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
            className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="min-w-0 flex-1">{summary}</span>
        </button>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div id={panelId} hidden={!open} className="px-2 pb-3 pt-1">
        {open && children}
      </div>
    </div>
  );
}
