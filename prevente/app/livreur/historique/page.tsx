import Link from "next/link";
import LivreurShell from "@/components/livreur/livreur-shell";
import Pager from "@/components/vendeur/pager";
import EmptyState from "@/components/empty-state";
import FilterChips from "@/components/filter-chips";
import LiveSearch from "@/components/live-search";
import { alertCls, badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/orders";
import { listHistory } from "@/lib/livreur/queries";
import { ATTEMPT_RESULT_LABEL, ATTEMPT_RESULT_TONE, FAILURE_REASON_LABEL, parseHistoryParams } from "@/lib/livreur/rules";

export const metadata = { title: "Historique des livraisons · Grossiste Pro" };

export default async function Page({ searchParams }: PageProps<"/livreur/historique">) {
  const profile = await requireRole("livreur");
  const f = parseHistoryParams(await searchParams);
  const { total, pages, page, rows } = await listHistory(profile.id, f);
  const params = { q: f.q, status: f.status, from: f.from, to: f.to };
  const hasFilters = Boolean(f.q || f.status || f.from || f.to);

  return (
    <LivreurShell current="history" title="Historique des livraisons">
      <section className={cardCls}>
        <div className="mb-3"><LiveSearch id="h-q" label="Rechercher dans l'historique" placeholder="Rechercher : n° de commande, client, téléphone ou adresse" /></div>
        <FilterChips
          label="Filtrer par statut"
          basePath="/livreur/historique"
          param="status"
          options={[{ value: "", label: "Toutes" }, { value: "livree", label: "Livrées" }, { value: "echec", label: "Échecs" }]}
          current={f.status}
          params={params}
        />
        <form method="get" className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="q" value={f.q} />
          <input type="hidden" name="status" value={f.status} />
          <div>
            <label htmlFor="h-from" className={labelCls}>Du</label>
            <input id="h-from" name="from" type="date" defaultValue={f.from} className={inputCls} />
          </div>
          <div>
            <label htmlFor="h-to" className={labelCls}>Au (inclus)</label>
            <input id="h-to" name="to" type="date" defaultValue={f.to} className={inputCls} />
          </div>
          <button type="submit" className={btnPrimary}>Filtrer</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Les dates filtrent l&apos;heure de la livraison ou de la tentative (heure d&apos;Algérie).</p>
        {f.warnings.length > 0 && (
          <ul role="alert" className={`mt-3 ${alertCls.warn}`}>{f.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}
      </section>

      <section className={cardCls}>
        <p className="text-sm text-slate-600">
          {total} tentative{total > 1 ? "s" : ""}{hasFilters ? " correspondant aux filtres" : ""}{pages > 1 ? ` · page ${page} / ${pages}` : ""}
        </p>
        {rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? "Aucune livraison ne correspond à ces filtres." : "Aucune livraison dans votre historique."}
            hint={hasFilters ? "Essayez d'élargir la période ou d'effacer la recherche." : "Vos livraisons et tentatives apparaîtront ici."}
            action={hasFilters ? { href: "/livreur/historique", label: "Réinitialiser les filtres" } : undefined}
          />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium text-slate-900">
                    <Link href={`/livreur/commandes/${r.orderId}`} className="text-emerald-800 underline">#{r.number}</Link> · {r.customerName}
                  </p>
                  <span className={`${badgeCls} ${badgeTone[ATTEMPT_RESULT_TONE[r.result]]} shrink-0`}>{ATTEMPT_RESULT_LABEL[r.result]}</span>
                </div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {formatDateTime(r.endedAt)}
                    {r.failureReason && ` · ${FAILURE_REASON_LABEL[r.failureReason]}`}
                    {r.comment && ` — ${r.comment}`}
                  </p>
                  <p className="shrink-0 font-semibold tabular-nums text-slate-900">{formatMoney(Number(r.total))}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pager basePath="/livreur/historique" params={params} page={page} pages={pages} />
        {hasFilters && <div className="mt-3"><Link href="/livreur/historique" className={`${btnGhost} inline-flex items-center`}>Réinitialiser</Link></div>}
      </section>
    </LivreurShell>
  );
}
