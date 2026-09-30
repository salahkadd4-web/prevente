import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import CollapsibleSection from "@/components/collapsible-section";
import ConfirmButton from "@/components/confirm-button";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls, summaryCls } from "@/components/ui";
import FilterChips from "@/components/filter-chips";
import EmptyState from "@/components/empty-state";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireRole } from "@/lib/auth/session";
import { SALE_UNIT_LABEL, itemLabel } from "@/lib/catalog";
import { formatDateTime } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { alertLimitDate, expiryInfo, formatDate } from "@/lib/stock/expiry";
import LiveSearch from "@/components/live-search";
import { moneyInputValue } from "@/lib/money";
import { formatMoney } from "@/lib/orders";
import { correctLotQuantity, createLot, setLotCost } from "./actions";

export const metadata = { title: "Stock · Grossiste Pro" };

const FILTERS = [
  { key: "all", label: "Tous les lots" },
  { key: "available", label: "Avec stock" },
  { key: "soon", label: "Expirent sous 3 mois" },
  { key: "expired", label: "Expirés" },
  { key: "empty", label: "Épuisés" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
const LOT_LIMIT = 200;

export default async function Page({ searchParams }: PageProps<"/admin/stock">) {
  await requireRole("admin");
  const sp = await searchParams;
  const rawFilter = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as FilterKey) : "all";
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = rawQ?.trim().slice(0, 80) ?? "";

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const limit = alertLimitDate(now);

  const filterWhere: Prisma.StockLotWhereInput =
    filter === "available" ? { availableQuantity: { gt: 0 } }
    : filter === "empty" ? { availableQuantity: 0 }
    : filter === "expired" ? { availableQuantity: { gt: 0 }, expiresAt: { lt: today } }
    : filter === "soon" ? { availableQuantity: { gt: 0 }, expiresAt: { gte: today, lte: limit } }
    : {};
  const searchWhere: Prisma.StockLotWhereInput = q
    ? {
        OR: [
          { lotNumber: { contains: q, mode: "insensitive" } },
          { variant: { name: { contains: q, mode: "insensitive" } } },
          { variant: { sku: { contains: q, mode: "insensitive" } } },
          { variant: { product: { name: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};
  // Même recherche sur le tableau « Disponible par produit et parfum ».
  const variantSearch: Prisma.ProductVariantWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { product: { name: { contains: q, mode: "insensitive" } } },
          { stockLots: { some: { lotNumber: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};
  const lotWhere: Prisma.StockLotWhereInput = { AND: [filterWhere, searchWhere] };

  const [variants, availability, lots, lotCount, bareProducts] = await Promise.all([
    prisma.productVariant.findMany({
      where: { isActive: true, product: { isActive: true }, ...variantSearch },
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.stockLot.groupBy({
      by: ["variantId"],
      where: { availableQuantity: { gt: 0 } },
      _sum: { availableQuantity: true },
      _min: { expiresAt: true },
      _count: { _all: true },
    }),
    // Ordre FEFO : expiration la plus proche d'abord (sans date en dernier), puis réception la plus ancienne.
    prisma.stockLot.findMany({
      where: lotWhere,
      include: { variant: { include: { product: true } } },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
      take: LOT_LIMIT,
    }),
    prisma.stockLot.count({ where: lotWhere }),
    // Produits actifs sans aucun parfum : réceptionnables directement (un parfum technique est créé à la 1re réception).
    prisma.product.findMany({
      where: { isActive: true, variants: { none: {} }, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
      select: { id: true, name: true, saleUnit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Journal des corrections : dépend de la migration 003 — la page reste utilisable sans elle.
  let adjustments:
    | Awaited<ReturnType<typeof loadAdjustments>>
    | null = null;
  try {
    adjustments = await loadAdjustments();
  } catch {
    adjustments = null;
  }

  const stockByVariant = new Map(availability.map((a) => [a.variantId, a]));
  const receivedToday = today.toISOString().slice(0, 10);

  return (
    <AdminShell current="stock" title="Stock par lot">
      <section className={cardCls}>
        <CollapsibleSection label="Réception d&apos;un lot">
        {variants.length === 0 && bareProducts.length === 0 ? (
          <p className="text-sm text-slate-600">Ajoutez d&apos;abord un produit (page Produits).</p>
        ) : (
          <ActionForm action={createLot} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="l-variant" className={labelCls}>Produit et parfum</label>
              <select id="l-variant" name="variantId" required defaultValue="" className={inputCls}>
                <option value="" disabled>Choisir…</option>
                {bareProducts.map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>{p.name} — sans parfum ({SALE_UNIT_LABEL[p.saleUnit]})</option>
                ))}
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>{itemLabel(v.product.name, v.name)} ({SALE_UNIT_LABEL[v.product.saleUnit]})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="l-qty" className={labelCls}>Quantité reçue</label>
              <input id="l-qty" name="quantity" type="number" inputMode="numeric" min={1} max={1000000} step={1} required className={inputCls} />
            </div>
            <div>
              <label htmlFor="l-exp" className={labelCls}>Date d&apos;expiration</label>
              <input id="l-exp" name="expiresAt" type="date" required className={inputCls} />
            </div>
            <div>
              <label htmlFor="l-num" className={labelCls}>N° de lot (facultatif)</label>
              <input id="l-num" name="lotNumber" maxLength={60} className={inputCls} />
            </div>
            <div>
              <label htmlFor="l-rec" className={labelCls}>Date de réception</label>
              <input id="l-rec" name="receivedAt" type="date" defaultValue={receivedToday} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="l-cost" className={labelCls}>Prix d&apos;achat unitaire de ce lot (facultatif)</label>
              <input id="l-cost" name="unitCost" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" title="Nombre positif, 2 décimales maximum" placeholder="ex. 980,00" className={inputCls} />
              <p className="mt-1 text-xs text-slate-500">
                Chaque réception est un lot distinct : un nouveau prix d&apos;achat s&apos;enregistre sur un nouveau lot et ne modifie jamais les anciens. Laissé vide, le coût du lot est « inconnu » et la marge du dashboard l&apos;indiquera.
              </p>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className={btnPrimary}>Ajouter au stock</button>
            </div>
          </ActionForm>
        )}
        </CollapsibleSection>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Disponible par produit et parfum</h2>
        {variants.length === 0 && bareProducts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun produit actif.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Produit — parfum</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Disponible</th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Lots</th>
                  <th scope="col" className="py-2 pl-3 font-medium">Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bareProducts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3 text-slate-900">{p.name} <span className="text-slate-500">(sans parfum)</span></td>
                    <td className="px-3 py-2 text-right"><span className={`${badgeCls} ${badgeTone.expired}`}>Rupture</span></td>
                    <td className="hidden px-3 py-2 text-right text-slate-700 sm:table-cell">0</td>
                    <td className="py-2 pl-3 text-slate-700">—</td>
                  </tr>
                ))}
                {variants.map((v) => {
                  const s = stockByVariant.get(v.id);
                  const qty = s?._sum.availableQuantity ?? 0;
                  const info = s ? expiryInfo(s._min.expiresAt) : null;
                  return (
                    <tr key={v.id}>
                      <td className="py-2 pr-3 text-slate-900">{itemLabel(v.product.name, v.name)}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {qty === 0 ? <span className={`${badgeCls} ${badgeTone.expired}`}>Rupture</span> : `${qty} ${SALE_UNIT_LABEL[v.product.saleUnit].toLowerCase()}`}
                      </td>
                      <td className="hidden px-3 py-2 text-right text-slate-700 sm:table-cell">{s?._count._all ?? 0}</td>
                      <td className="py-2 pl-3 text-slate-700">
                        {s ? <>{formatDate(s._min.expiresAt)} {info && <span className={`${badgeCls} ${badgeTone[info.tone]} ml-1`}>{info.label}</span>}</> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Lots</h2>
        <p className="mt-1 text-sm text-slate-600">
          Classés par expiration la plus proche, puis réception la plus ancienne (FEFO). Signalement à partir de 3 mois avant la date.
        </p>

        <div className="mt-3">
          <FilterChips
            label="Filtrer les lots"
            basePath="/admin/stock"
            param="filter"
            current={filter}
            params={{ q: q || undefined, filter }}
            options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
          />
        </div>
        <div className="mt-3">
          <LiveSearch id="s-search" label="Rechercher un lot" placeholder="Produit, parfum, référence ou n° de lot" />
        </div>

        {lots.length === 0 && (
          <EmptyState
            title={filter === "all" && !q ? "Aucun lot pour le moment." : "Aucun lot ne correspond."}
            hint={filter === "all" && !q ? "Enregistrez une réception avec « Réception d'un lot » en haut de page." : "Changez de filtre ou modifiez la recherche."}
            action={filter === "all" && !q ? undefined : { href: "/admin/stock", label: "Réinitialiser" }}
          />
        )}
        {lotCount > LOT_LIMIT && (
          <p className="mt-3 text-xs text-slate-500">{LOT_LIMIT} premiers lots affichés sur {lotCount} : affinez avec un filtre ou une recherche.</p>
        )}

        <ul className="mt-2 divide-y divide-slate-100">
          {lots.map((lot) => {
            const info = expiryInfo(lot.expiresAt);
            const unit = SALE_UNIT_LABEL[lot.variant.product.saleUnit].toLowerCase();
            const empty = lot.availableQuantity === 0;
            return (
              <li key={lot.id} className={`py-3 ${empty ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{itemLabel(lot.variant.product.name, lot.variant.name)}</p>
                    <p className="text-sm text-slate-600">
                      {lot.availableQuantity} / {lot.initialQuantity} {unit}
                      {lot.lotNumber && ` · lot ${lot.lotNumber}`} · reçu le {formatDate(lot.receivedAt)}
                    </p>
                    <p className="text-sm text-slate-600">
                      Prix d&apos;achat : {lot.unitCost === null ? <span className="font-medium text-amber-900">inconnu</span> : formatMoney(Number(lot.unitCost.toString()))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-800">{formatDate(lot.expiresAt)}</p>
                    {!empty && <span className={`${badgeCls} ${badgeTone[info.tone]}`}>{info.label}</span>}
                    {empty && <span className={`${badgeCls} ${badgeTone.none}`}>Épuisé</span>}
                  </div>
                </div>
                <details className="mt-1">
                  <summary className={summaryCls}>{lot.unitCost === null ? "Renseigner le prix d'achat" : "Modifier le prix d'achat"}</summary>
                  <ActionForm action={setLotCost} className="mt-2 grid gap-2 sm:grid-cols-[12rem_auto] sm:items-end">
                    <input type="hidden" name="id" value={lot.id} />
                    <div>
                      <label htmlFor={`c-c-${lot.id}`} className="mb-1 block text-xs font-medium text-slate-700">Prix d&apos;achat unitaire</label>
                      <input id={`c-c-${lot.id}`} name="unitCost" type="text" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" title="Nombre positif, 2 décimales maximum" defaultValue={moneyInputValue(lot.unitCost)} className={inputCls} />
                    </div>
                    <ConfirmButton message="Enregistrer ce prix d'achat pour ce lot uniquement ? Il sert au calcul de la marge des ventes prélevées sur ce lot." className={btnGhost + " h-12"}>
                      Enregistrer
                    </ConfirmButton>
                  </ActionForm>
                </details>
                <details className="mt-1">
                  <summary className={summaryCls}>Corriger la quantité (inventaire)</summary>
                  <ActionForm action={correctLotQuantity} className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                    <input type="hidden" name="id" value={lot.id} />
                    <div>
                      <label htmlFor={`c-q-${lot.id}`} className="mb-1 block text-xs font-medium text-slate-700">Quantité disponible</label>
                      <input
                        id={`c-q-${lot.id}`} name="quantity" type="number" inputMode="numeric" min={0} max={lot.initialQuantity} step={1}
                        defaultValue={lot.availableQuantity} required className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor={`c-r-${lot.id}`} className="mb-1 block text-xs font-medium text-slate-700">Motif (obligatoire)</label>
                      <input id={`c-r-${lot.id}`} name="reason" required minLength={3} maxLength={200} placeholder="Ex. inventaire, casse, péremption…" className={inputCls} />
                    </div>
                    <ConfirmButton message="Enregistrer cette correction d'inventaire ? Elle sera inscrite dans le journal." className={btnGhost + " h-12"}>
                      Enregistrer
                    </ConfirmButton>
                  </ActionForm>
                  <p className="mt-1 text-xs text-slate-500">
                    Maximum : quantité initiale ({lot.initialQuantity}) moins les unités déjà prélevées par des commandes. Pour ajouter du stock, créez un lot.
                  </p>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Journal des corrections</h2>
        {adjustments === null ? (
          <p className="mt-3 text-sm text-amber-900">
            Journal indisponible : la migration 003 (traçabilité du stock) n&apos;est pas encore appliquée sur la base.
          </p>
        ) : adjustments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucune correction enregistrée.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {adjustments.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="text-slate-900">
                  {itemLabel(a.lot.variant.product.name, a.lot.variant.name)}{a.lot.lotNumber ? ` · lot ${a.lot.lotNumber}` : ""} :{" "}
                  <strong>{a.previousQuantity} → {a.newQuantity}</strong>
                </p>
                <p className="text-xs text-slate-500">{formatDateTime(a.createdAt)} · {a.changedBy.fullName}</p>
                <p className="mt-1 text-slate-600">Motif : {a.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

function loadAdjustments() {
  return prisma.stockAdjustment.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      changedBy: { select: { fullName: true } },
      lot: { select: { lotNumber: true, variant: { select: { name: true, product: { select: { name: true } } } } } },
    },
  });
}
