import Link from "next/link";
import AdminShell from "@/components/admin-shell";
import { alertCls, badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, chipCls, inputCls, labelCls, summaryCls } from "@/components/ui";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { getActiveCounts, getMarginSummary, getOrderCountsByStatus, getStockStats, getVendorRevenue } from "@/lib/admin/dashboard";
import { requireRole } from "@/lib/auth/session";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, formatMoney } from "@/lib/orders";
import { PERIOD_LABEL, resolvePeriod, type PeriodKey } from "@/lib/period";

export const metadata = {
  title: "Administration · Grossiste Pro",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: PageProps<"/admin/dashboard">) {
  const profile = await requireRole("admin");
  const sp = await searchParams;
  const period = resolvePeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) });

  const [vendors, margin, statusCounts, stock, counts] = await Promise.all([
    getVendorRevenue(period),
    getMarginSummary(period),
    getOrderCountsByStatus(period),
    getStockStats(),
    getActiveCounts(),
  ]);

  const totalRevenue = vendors.reduce((sum, v) => sum + v.revenue, 0);
  const totalDelivered = vendors.reduce((sum, v) => sum + v.deliveredOrders, 0);
  const alerts = stock.expired + stock.expiringSoon;

  return (
    <AdminShell current="dashboard" title={`Bonjour ${profile.full_name}`}>
      {alerts > 0 && (
        <Link href="/admin/stock?filter=soon" className={`${alertCls.warn} flex items-center gap-3`}>
          <span aria-hidden="true" className="text-xl">⚠</span>
          <span className="flex-1">
            {stock.expired > 0 && (
              <>
                <strong>{stock.expired}</strong> lot{stock.expired > 1 ? "s" : ""} expiré{stock.expired > 1 ? "s" : ""} encore en stock.{" "}
              </>
            )}
            {stock.expiringSoon > 0 && (
              <>
                <strong>{stock.expiringSoon}</strong> lot{stock.expiringSoon > 1 ? "s" : ""} expire{stock.expiringSoon > 1 ? "nt" : ""} dans moins de 3 mois.
              </>
            )}
          </span>
          <span className="shrink-0 font-semibold">Voir →</span>
        </Link>
      )}

      <section className={cardCls} aria-label="Période">
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "7d", "month"] as PeriodKey[]).map((k) => (
            <Link key={k} href={`/admin/dashboard?period=${k}`} aria-current={period.key === k ? "page" : undefined} className={chipCls(period.key === k)}>
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
        <p className="mt-2 text-xs text-slate-500">Affichage : {period.label} (heure d&apos;Algérie).</p>
        {period.error && (
          <p role="alert" className={`mt-3 ${alertCls.error}`}>{period.error}</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cardCls} aria-labelledby="kpi-revenue">
          <p id="kpi-revenue" className="text-sm text-slate-600">Chiffre d&apos;affaires — {period.label}</p>
          <p className="mt-1 font-display text-3xl text-slate-900">{formatMoney(totalRevenue)}</p>
          <p className="mt-1 text-sm text-slate-600">
            {totalDelivered} commande{totalDelivered > 1 ? "s" : ""} livrée{totalDelivered > 1 ? "s" : ""}
          </p>
          <details className="mt-2">
            <summary className={summaryCls}>Comment c&apos;est calculé ?</summary>
            <p className="text-xs text-slate-500">
              Somme des lignes (prix × quantité enregistrés sur la commande) des commandes livrées durant la période.
              Les brouillons, commandes en cours et annulées sont exclus.
            </p>
          </details>
        </section>

        <section className={cardCls} aria-labelledby="kpi-margin">
          <p id="kpi-margin" className="text-sm text-slate-600">Marge brute (CA − coût d&apos;achat) — {period.label}</p>
          {!margin.available ? (
            <p className="mt-2 text-sm text-amber-900">
              Indisponible : la migration 005 (prix d&apos;achat) n&apos;est pas appliquée sur la base.
            </p>
          ) : margin.costedLines === 0 ? (
            <>
              <p className="mt-1 text-3xl font-semibold text-slate-400">—</p>
              <p className="mt-1 text-sm text-slate-600">
                {margin.uncostedLines > 0
                  ? `Non calculable : le coût d'achat est inconnu pour ${margin.uncostedLines} ligne${margin.uncostedLines > 1 ? "s" : ""} livrée${margin.uncostedLines > 1 ? "s" : ""}.`
                  : "Aucune vente livrée sur la période."}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{formatMoney(margin.margin)}</p>
              <p className="mt-1 text-sm text-slate-600">
                sur {formatMoney(margin.costedRevenue)} de ventes, coût d&apos;achat {formatMoney(margin.cost)}
              </p>
            </>
          )}
          {margin.available && margin.uncostedLines > 0 && margin.costedLines > 0 && (
            <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-300">
              Marge partielle : {margin.uncostedLines} ligne{margin.uncostedLines > 1 ? "s" : ""} livrée{margin.uncostedLines > 1 ? "s" : ""} ({formatMoney(margin.uncostedRevenue)} de ventes)
              exclue{margin.uncostedLines > 1 ? "s" : ""} faute de prix d&apos;achat connu. Renseignez-le dans la page Stock.
            </p>
          )}
          <details className="mt-2">
            <summary className={summaryCls}>Comment c&apos;est calculé ?</summary>
            <p className="text-xs text-slate-500">
              Coût réel des lots prélevés (FEFO) pour chaque ligne. Il s&apos;agit d&apos;une marge brute, pas d&apos;un bénéfice net :
              aucun frais, remise ou remboursement n&apos;est enregistré.
            </p>
          </details>
        </section>
      </div>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Chiffre d&apos;affaires par pré-vendeur</h2>
        {vendors.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun pré-vendeur.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Pré-vendeur</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Livrées</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v.id} className={v.isActive ? "" : "opacity-60"}>
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {v.fullName}
                      {!v.isActive && <span className={`${badgeCls} ${badgeTone.expired} ml-2`}>Désactivé</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{v.deliveredOrders}</td>
                    <td className="py-2 pl-3 text-right font-semibold text-slate-900">{formatMoney(v.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200">
                <tr>
                  <th scope="row" className="py-2 pr-3 text-left font-semibold text-slate-900">Total</th>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">{totalDelivered}</td>
                  <td className="py-2 pl-3 text-right font-semibold text-slate-900">{formatMoney(totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Commandes par statut</h2>
          <Link href="/admin/orders" className={`${btnGhost} inline-flex items-center`}>Toutes les commandes</Link>
        </div>
        <p className="mt-1 text-xs text-slate-500">Commandes créées durant la période.</p>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.values(OrderStatus).map((s) => (
            <li key={s}>
              <Link
                href={`/admin/orders?status=${s}`}
                className={`block rounded-xl border border-slate-200 p-3 hover:bg-slate-50 ${statusCounts[s] === 0 ? "opacity-60" : ""}`}
              >
                <p className="text-2xl font-semibold text-slate-900">{statusCounts[s]}</p>
                <span className={`${badgeCls} ${badgeTone[ORDER_STATUS_TONE[s]]}`}>{ORDER_STATUS_LABEL[s]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Raccourcis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/admin/customers" className={`${cardCls} hover:bg-slate-50`}>
          <p className="font-display text-3xl text-slate-900">{counts.customers}</p>
          <p className="mt-1 text-sm text-slate-600">clients actifs</p>
        </Link>
        <Link href="/admin/products" className={`${cardCls} hover:bg-slate-50`}>
          <p className="font-display text-3xl text-slate-900">{counts.products}</p>
          <p className="mt-1 text-sm text-slate-600">produits actifs</p>
        </Link>
        <Link href="/admin/users" className={`${cardCls} hover:bg-slate-50`}>
          <p className="font-display text-3xl text-slate-900">{counts.users}</p>
          <p className="mt-1 text-sm text-slate-600">vendeurs et livreurs actifs</p>
        </Link>
        <Link href="/admin/stock" className={`${cardCls} hover:bg-slate-50`}>
          <p className="font-display text-3xl text-slate-900">{stock.inStock}</p>
          <p className="mt-1 text-sm text-slate-600">parfums en stock</p>
          <p className="mt-2 flex flex-wrap gap-1">
            {stock.outOfStock > 0 && <span className={`${badgeCls} ${badgeTone.expired}`}>{stock.outOfStock} en rupture</span>}
            {stock.expiringSoon > 0 && <span className={`${badgeCls} ${badgeTone.soon}`}>{stock.expiringSoon} bientôt expiré{stock.expiringSoon > 1 ? "s" : ""}</span>}
            {stock.expired > 0 && <span className={`${badgeCls} ${badgeTone.expired}`}>{stock.expired} expiré{stock.expired > 1 ? "s" : ""}</span>}
          </p>
        </Link>
      </section>
    </AdminShell>
  );
}
