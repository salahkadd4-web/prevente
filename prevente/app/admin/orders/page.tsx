import Link from "next/link";
import AdminShell from "@/components/admin-shell";
import CollapsibleSection from "@/components/collapsible-section";
import LiveSearch from "@/components/live-search";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { PAGE_SIZE, buildOrderBy, buildOrderWhere, filtersToQuery, parseOrderFilters } from "@/lib/admin/orders-query";
import { requireRole } from "@/lib/auth/session";
import { DEFAULT_FLAVOR_NAME, itemLabel } from "@/lib/catalog";
import {
  ORDER_SORTS, ORDER_SORT_LABEL, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, formatDateTime, formatMoney, orderTotal,
} from "@/lib/orders";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Commandes · Grossiste Pro" };

export default async function Page({ searchParams }: PageProps<"/admin/orders">) {
  await requireRole("admin");
  const { filters, warnings } = parseOrderFilters(await searchParams);
  const where = buildOrderWhere(filters);

  const [total, customers, vendeurs, livreurs, products] = await Promise.all([
    prisma.order.count({ where }),
    prisma.customer.findMany({ select: { id: true, businessName: true }, orderBy: { businessName: "asc" }, take: 1000 }),
    prisma.profile.findMany({ where: { role: "vendeur" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.profile.findMany({ where: { role: "livreur" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.product.findMany({
      select: { id: true, name: true, variants: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const orders = await prisma.order.findMany({
    where,
    orderBy: buildOrderBy(filters.sort),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      customer: { select: { businessName: true, phone: true } },
      createdBy: { select: { fullName: true } },
      assignments: { where: { unassignedAt: null }, select: { driver: { select: { fullName: true } } } },
      items: { select: { unitPrice: true, quantity: true } },
    },
  });

  const hasFilters = Boolean(
    filters.q || filters.from || filters.to || filters.status || filters.customerId || filters.vendeurId || filters.livreurId || filters.item,
  );
  // Filtres actifs hors recherche (la recherche a sa propre barre, toujours visible).
  const activeFilters = [filters.from, filters.to, filters.status, filters.customerId, filters.vendeurId, filters.livreurId, filters.item].filter(Boolean).length;
  const back = filtersToQuery(filters, page > 1 ? { page } : {});

  return (
    <AdminShell current="orders" title="Commandes">
      <section className={cardCls}>
        <div className="mb-3">
          <LiveSearch id="o-q" label="Rechercher une commande" placeholder="Rechercher : n° de commande, client ou téléphone" />
        </div>
        {warnings.length > 0 && (
          <ul role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-300">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
        <CollapsibleSection label="Filtres" hint={activeFilters > 0 ? `${activeFilters} actif${activeFilters > 1 ? "s" : ""}` : undefined}>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="q" value={filters.q} />
          <div>
            <label htmlFor="o-from" className={labelCls}>Du</label>
            <input id="o-from" name="from" type="date" defaultValue={filters.from} className={inputCls} />
          </div>
          <div>
            <label htmlFor="o-to" className={labelCls}>Au (inclus)</label>
            <input id="o-to" name="to" type="date" defaultValue={filters.to} className={inputCls} />
          </div>
          <div>
            <label htmlFor="o-status" className={labelCls}>Statut</label>
            <select id="o-status" name="status" defaultValue={filters.status} className={inputCls}>
              <option value="">Tous</option>
              {Object.values(OrderStatus).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="o-customer" className={labelCls}>Client</label>
            <select id="o-customer" name="customer" defaultValue={filters.customerId} className={inputCls}>
              <option value="">Tous</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="o-vendeur" className={labelCls}>Pré-vendeur</label>
            <select id="o-vendeur" name="vendeur" defaultValue={filters.vendeurId} className={inputCls}>
              <option value="">Tous</option>
              {vendeurs.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="o-livreur" className={labelCls}>Livreur affecté</label>
            <select id="o-livreur" name="livreur" defaultValue={filters.livreurId} className={inputCls}>
              <option value="">Tous</option>
              {livreurs.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="o-item" className={labelCls}>Produit / parfum</label>
            <select id="o-item" name="item" defaultValue={filters.item} className={inputCls}>
              <option value="">Tous</option>
              {products.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  <option value={`p:${p.id}`}>{p.variants.length > 0 && !(p.variants.length === 1 && p.variants[0].name === DEFAULT_FLAVOR_NAME) ? `Tous les parfums — ${p.name}` : `${p.name} (tous)`}</option>
                  {p.variants.map((v) => <option key={v.id} value={`v:${v.id}`}>{itemLabel(p.name, v.name)}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="o-sort" className={labelCls}>Tri</label>
            <select id="o-sort" name="sort" defaultValue={filters.sort} className={inputCls}>
              {ORDER_SORTS.map((s) => <option key={s} value={s}>{ORDER_SORT_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className={btnPrimary}>Filtrer</button>
            {hasFilters && <Link href="/admin/orders" className={`${btnGhost} inline-flex h-12 items-center`}>Réinitialiser</Link>}
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">Les dates filtrent la date de création de la commande (heure d&apos;Algérie).</p>
        </CollapsibleSection>
      </section>

      <section className={cardCls}>
        <p className="text-sm text-slate-600">
          {total} commande{total > 1 ? "s" : ""}{hasFilters ? " correspondant aux filtres" : ""} · page {page} / {pages}
        </p>

        {orders.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            {hasFilters ? "Aucune commande ne correspond à ces filtres." : "Aucune commande pour le moment."}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">N°</th>
                  <th scope="col" className="px-3 py-2 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 font-medium">Client</th>
                  <th scope="col" className="px-3 py-2 font-medium">Pré-vendeur</th>
                  <th scope="col" className="px-3 py-2 font-medium">Livreur</th>
                  <th scope="col" className="px-3 py-2 font-medium">Statut</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-medium">
                      <Link href={`/admin/orders/${o.id}${back ? `?back=${encodeURIComponent(back)}` : ""}`} className="text-emerald-800 underline">#{o.number}</Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{formatDateTime(o.createdAt)}</td>
                    <td className="px-3 py-2 text-slate-900">{o.customer.businessName}</td>
                    <td className="px-3 py-2 text-slate-700">{o.createdBy.fullName}</td>
                    <td className="px-3 py-2 text-slate-700">{o.assignments[0]?.driver.fullName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`${badgeCls} ${badgeTone[ORDER_STATUS_TONE[o.status]]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                    </td>
                    <td className="py-2 pl-3 text-right font-semibold text-slate-900">{formatMoney(orderTotal(o.items))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2">
            {page > 1 ? (
              <Link href={`/admin/orders${filtersToQuery(filters, { page: page - 1 === 1 ? "" : page - 1 })}`} className={btnGhost + " inline-flex items-center"}>← Précédent</Link>
            ) : <span />}
            <span className="text-sm text-slate-600">Page {page} sur {pages}</span>
            {page < pages ? (
              <Link href={`/admin/orders${filtersToQuery(filters, { page: page + 1 })}`} className={btnGhost + " inline-flex items-center"}>Suivant →</Link>
            ) : <span />}
          </nav>
        )}
      </section>
    </AdminShell>
  );
}
