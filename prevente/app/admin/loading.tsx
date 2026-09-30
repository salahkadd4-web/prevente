export default function Loading() {
  return (
    <div className="min-h-dvh bg-slate-50" role="status" aria-live="polite">
      <div className="border-b border-slate-200 bg-white px-4 py-6">
        <div className="mx-auto h-8 max-w-6xl animate-pulse rounded-lg bg-slate-200" />
      </div>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="h-8 w-1/3 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
        <span className="sr-only">Chargement…</span>
      </div>
    </div>
  );
}
