"use client";

import { useId, useRef, useState } from "react";

/**
 * Bloc repliable (fermé par défaut) : un bouton libellé + flèche ouvre/ferme le contenu.
 * Le contenu reste monté quand il est masqué (attribut `hidden`) : une saisie en cours n'est pas perdue
 * si on replie le bloc, et les messages de succès / d'erreur d'un formulaire restent cohérents.
 * À l'ouverture, le focus va sur le premier champ du contenu.
 */
export default function CollapsibleSection({
  label,
  hint,
  defaultOpen = false,
  children,
}: {
  /** Texte du bouton, ex. « Ajouter un client ». */
  label: string;
  /** Précision discrète à droite du libellé, ex. « 2 filtres actifs ». */
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Après l'affichage du panneau, place le curseur sur le premier champ saisissable.
      requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus());
    }
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left text-base font-semibold text-emerald-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
      >
        <span>
          {label}
          {hint && <span className="ml-2 text-sm font-normal text-slate-500">{hint}</span>}
        </span>
        <svg
          aria-hidden="true" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={panelId} ref={panel} hidden={!open} className="pt-4">
        {children}
      </div>
    </div>
  );
}
