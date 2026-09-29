export const inputCls =
  "block h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 disabled:bg-slate-100";
export const labelCls = "mb-1.5 block text-sm font-medium text-slate-800";
export const btnPrimary =
  "h-12 rounded-xl bg-emerald-700 px-5 text-base font-semibold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:opacity-60";
export const btnGhost =
  "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:opacity-60";
export const cardCls = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
export const badgeCls = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";
export const badgeTone = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  soon: "bg-amber-50 text-amber-900 ring-amber-300",
  expired: "bg-red-50 text-red-800 ring-red-200",
  none: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;
