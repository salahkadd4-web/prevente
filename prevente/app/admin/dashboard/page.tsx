import Link from "next/link";
import AdminShell from "@/components/admin-shell";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { getActiveCounts, getOrderCountsByStatus, getStockStats, getVendorRevenue } from "@/lib/admin/dashboard";
import { requireRole } from "@/lib/auth/session";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, formatMoney } from "@/lib/orders";
import { PERIODS, PERIOD_LABEL, resolvePeriod } from "@/lib/period";

export const metadata = {
  title: "Administration · Grossiste Pro",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: PageProps<"/admin/dashboard">) {
  const profile = await requireRole("admin");
  const sp = await searchParams;
  const period = resolvePeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) });

  const [vendors, statusCounts, stock, counts] = await Promise.all([
    getVendorRevenue(period),
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
        <Link
          href="/admin/stock"
          className="block rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-inset ring-amber-300"
        >
          {stock.expired > 0 && (
            <>
              <strong>{stock.expired}</strong> lot{stock.expired > 1 ? "s" : ""} expiré{stock.expired > 1 ? "s" : ""} encore en stock.{" "}
            </>
          )}
          {stock.expiringSoon > 0 && (
            <>
              <strong>{stock.expiringSoon}</strong> lot{stock.expiringSoon > 1 ? "s" : ""} expire{stock.expiringSoon > 1 ? "nt" : ""} dans moins de 3 mois.{" "}
            </>
          )}
          Voir le stock →
        </Link>
      )}

      <section className={cardCls}>
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="d-period" className={labelCls}>Période</label>
            <select id="d-period" name="period" defaultValue={period.key} className={inputCls}>
              {PERIODS.map((k) => (
                <option key={k} value={k}>{PERIOD_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="d-from" className={labelCls}>Du (période personnalisée)</label>
            <input id="d-from" name="from" type="date" defaultValue={period.fromDay} className={inputCls} />
          </div>
          <div>
            <label htmlFor="d-to" className={labelCls}>Au (inclus)</label>
            <input id="d-to" name="to" type="date" defaultValue={period.toDay} className={inputCls} />
          </div>
          <button type="submit" className={btnPrimary}>Afficher</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Affichage : {period.label} (heure d&apos;Algérie). Les dates « Du / Au » ne sont utilisées que pour la période personnalisée.
        </p>
        {period.error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
            {period.error}
          </p>
        )}
      </section>

      <section className={cardCls}>
        <p className="text-sm text-slate-600">Chiffre d&apos;affaires réalisé — {period.label}</p>
        <p className="mt-1 text-3xl font-semibold text-slate-900">{formatMoney(totalRevenue)}</p>
        <p className="mt-1 text-sm text-slate-600">
          {totalDelivered} commande{totalDelivered > 1 ? "s" : ""} livrée{totalDelivered > 1 ? "s" : ""}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Règle : somme des lignes (prix × quantité enregistrés sur la commande) des commandes livrées durant la période.
          Les brouillons, commandes en cours et annulées sont exclus.
        </p>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Chiffre d&apos;affaires par pré-vendeur</h2>
        {vendors.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun pré-vendeur.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Pré-vendeur</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Commandes livrées</th>
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
                className="block rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
              >
                <p className="text-2xl font-semibold text-slate-900">{statusCounts[s]}</p>
                <span className={`${badgeCls} ${badgeTone[ORDER_STATUS_TONE[s]]}`}>{ORDER_STATUS_LABEL[s]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/customers" className={cardCls}>
          <p className="text-3xl font-semibold text-slate-900">{counts.customers}</p>
          <p className="mt-1 text-sm text-slate-600">clients actifs — fiches et historique</p>
        </Link>
        <Link href="/admin/products" className={cardCls}>
          <p className="text-3xl font-semibold text-slate-900">{counts.products}</p>
          <p className="mt-1 text-sm text-slate-600">produits actifs — gérer le catalogue</p>
        </Link>
        <Link href="/admin/users" className={cardCls}>
          <p className="text-3xl font-semibold text-slate-900">{counts.users}</p>
          <p className="mt-1 text-sm text-slate-600">vendeurs et livreurs actifs — gérer les comptes</p>
        </Link>
        <Link href="/admin/stock" className={cardCls}>
          <p className="text-3xl font-semibold text-slate-900">{stock.inStock}</p>
          <p className="mt-1 text-sm text-slate-600">
            parfums en stock · {stock.outOfStock} en rupture · {stock.expiringSoon} lot{stock.expiringSoon > 1 ? "s" : ""} bientôt expiré{stock.expiringSoon > 1 ? "s" : ""} · {stock.expired} expiré{stock.expired > 1 ? "s" : ""}
          </p>
        </Link>
      </div>
    </AdminShell>
  );
}
