import Link from "next/link";
import { alertCls, btnPrimary, cardCls, chipCls, inputCls, labelCls, summaryCls } from "@/components/ui";
import { PERIOD_LABEL, type Period, type PeriodKey } from "@/lib/period";

/** Même sélecteur de période que le tableau de bord admin (pastilles + période personnalisée repliée). */
export default function PeriodPicker({ basePath, period }: { basePath: string; period: Period & { error?: string } }) {
  return (
    <section className={cardCls} aria-label="Période">
      <div className="flex flex-wrap items-center gap-2">
        {(["today", "7d", "month"] as PeriodKey[]).map((k) => (
          <Link key={k} href={`${basePath}?period=${k}`} aria-current={period.key === k ? "page" : undefined} className={chipCls(period.key === k)}>
            {PERIOD_LABEL[k]}
          </Link>
        ))}
      </div>
      <details className="mt-2" open={period.key === "custom" || Boolean(period.error)}>
        <summary className={summaryCls}>{PERIOD_LABEL.custom}</summary>
        <form method="get" className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="period" value="custom" />
          <div>
            <label htmlFor="d-from" className={labelCls}>Du</label>
            <input id="d-from" name="from" type="date" defaultValue={period.fromDay} className={inputCls} />
          </div>
          <div>
            <label htmlFor="d-to" className={labelCls}>Au (inclus)</label>
            <input id="d-to" name="to" type="date" defaultValue={period.toDay} className={inputCls} />
          </div>
          <button type="submit" className={btnPrimary}>Afficher</button>
        </form>
      </details>
      <p className="mt-2 text-xs text-slate-500">Période affichée : {period.label} (heure d&apos;Algérie).</p>
      {period.error && <p role="alert" className={`mt-3 ${alertCls.error}`}>{period.error}</p>}
    </section>
  );
}
