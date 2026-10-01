// Rayons hiérarchisés : champs et boutons 10 px, cartes 16 px, pastilles arrondies. Pas d'ombre sur les cartes :
// une bordure suffit sur le fond béton. Seul le bouton principal a un relief (bord bas), pour qu'on le trouve au pouce.
export const inputCls =
  "block h-12 w-full rounded-[10px] border border-slate-300 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:bg-slate-100";
export const labelCls = "mb-1.5 block text-sm font-medium text-slate-800";
export const btnPrimary =
  "h-12 rounded-[10px] bg-emerald-700 px-5 text-base font-semibold text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)] transition-colors hover:bg-emerald-800 active:bg-emerald-900 active:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 focus-visible:ring-offset-2 disabled:opacity-60";
export const btnGhost =
  "h-10 rounded-[10px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 active:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 disabled:opacity-60";
export const cardCls = "rounded-2xl border border-slate-200 bg-white p-4 sm:p-6";
export const badgeCls = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset";
export const badgeTone = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  soon: "bg-amber-100 text-amber-900 ring-amber-300",
  expired: "bg-red-50 text-red-800 ring-red-200",
  none: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

/** Lien textuel cohérent dans toute l'application. */
export const linkCls = "font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-900";
/** Résumé cliquable d'un <details> : zone tactile d'au moins 40 px (l'ancien « text-xs » était trop petit au doigt). */
export const summaryCls =
  "inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-[10px] px-1 text-sm font-semibold text-emerald-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 [&::-webkit-details-marker]:hidden";
/** Bandeaux de message. */
export const alertCls = {
  warn: "rounded-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900",
  error: "rounded-xl border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800",
  info: "rounded-xl border-l-4 border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900",
} as const;
/** Pastille de filtre / onglet (active = remplie du vert des bandes). */
export const chipCls = (active: boolean) =>
  `inline-flex h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 ${
    active ? "bg-emerald-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
  }`;
