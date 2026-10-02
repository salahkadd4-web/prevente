import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import CollapsibleSection from "@/components/collapsible-section";
import ConfirmButton from "@/components/confirm-button";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls, summaryCls } from "@/components/ui";
import ExpandableRow from "@/components/expandable-row";
import FilterChips from "@/components/filter-chips";
import EmptyState from "@/components/empty-state";
import ProductThumb from "@/components/product-thumb";
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
  { key: "all", label: "Tous" },
  { key: "available", label: "Avec stock" },
  { key: "empty", label: "Rupture" },
  { key: "soon", label: "Expirent sous 3 mois" },
  { key: "expired", label: "Expirés" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
const VARIANT_LIMIT = 150;
const LOT_LIMIT = 3000;

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

  // Une ligne par parfum : les parfums actifs, plus ceux désactivés qui ont encore du stock (à écouler ou corriger).
  const inStock: Prisma.StockLotWhereInput = { availableQuantity: { gt: 0 } };
  const filterWhere: Prisma.ProductVariantWhereInput =
    filter === "available" ? { stockLots: { some: inStock } }
    : filter === "empty" ? { stockLots: { none: inStock } }
    : filter === "expired" ? { stockLots: { some: { ...inStock, expiresAt: { lt: today } } } }
    : filter === "soon" ? { stockLots: { some: { ...inStock, expiresAt: { gte: today, lte: limit } } } }
    : {};
  const searchWhere: Prisma.ProductVariantWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { product: { name: { contains: q, mode: "insensitive" } } },
          { stockLots: { some: { lotNumber: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};
  const variantWhere: Prisma.ProductVariantWhereInput = {
    AND: [{ OR: [{ isActive: true, product: { isActive: true } }, { stockLots: { some: inStock } }] }, filterWhere, searchWhere],
  };
  // Produits actifs sans aucun parfum : en rupture par définition, réceptionnables directement.
  const showBare = filter === "all" || filter === "empty";

  const [variants, variantCount, bareProducts, receivable] = await Promise.all([
    prisma.productVariant.findMany({
      where: variantWhere,
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
      take: VARIANT_LIMIT,
    }),
    prisma.productVariant.count({ where: variantWhere }),
    showBare
      ? prisma.product.findMany({
          where: { isActive: true, variants: { none: {} }, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
          select: { id: true, name: true, saleUnit: true, imageSecureUrl: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Liste du formulaire de réception : indépendante de la recherche et des filtres.
    Promise.all([
      prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        select: { id: true, name: true, product: { select: { name: true, saleUnit: true } } },
        orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.product.findMany({
        where: { isActive: true, variants: { none: {} } },
        select: { id: true, name: true, saleUnit: true },
        orderBy: { name: "asc" },
      }),
    ]),
  ]);
  const [receivableVariants, receivableBare] = receivable;

  // Lots des parfums affichés, ordre FEFO : expiration la plus proche d'abord (sans date en dernier), puis réception la plus ancienne.
  const lots = variants.length
    ? await prisma.stockLot.findMany({
        where: { variantId: { in: variants.map((v) => v.id) } },
        orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
        take: LOT_LIMIT,
      })
    : [];
  const lotsByVariant = new Map<string, typeof lots>();
  for (const l of lots) lotsByVariant.set(l.variantId, [...(lotsByVariant.get(l.variantId) ?? []), l]);

  // Journal des corrections : dépend de la migration 003 — la page reste utilisable sans elle.
  let adjustments:
    | Awaited<ReturnType<typeof loadAdjustments>>
    | null = null;
  try {
    adjustments = await loadAdjustments();
  } catch {
    adjustments = null;
  }

  const receivedToday = today.toISOString().slice(0, 10);
  const filtered = filter !== "all" || q !== "";
  const rowCount = variants.length + bareProducts.length;

  return (
    <AdminShell current="stock" title="Stock par lot">
      <section className={cardCls}>
        <CollapsibleSection label="Réception d&apos;un lot">
        {receivableVariants.length === 0 && receivableBare.length === 0 ? (
          <p className="text-sm text-slate-600">Ajoutez d&apos;abord un produit (page Produits).</p>
        ) : (
          <ActionForm action={createLot} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="l-variant" className={labelCls}>Produit et parfum</label>
              <select id="l-variant" name="variantId" required defaultValue="" className={inputCls}>
                <option value="" disabled>Choisir…</option>
                {receivableBare.map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>{p.name} — sans parfum ({SALE_UNIT_LABEL[p.saleUnit]})</option>
                ))}
                {receivableVariants.map((v) => (
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
              <p className="mt-1 text-xs text-slate-500">Propre à ce lot ; vide = coût inconnu, signalé dans la marge du tableau de bord.</p>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className={btnPrimary}>Ajouter au stock</button>
            </div>
          </ActionForm>
        )}
        </CollapsibleSection>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Stock par produit et parfum</h2>
        <p className="mt-1 text-sm text-slate-600">
          Touchez une ligne pour voir ses lots, classés FEFO (expiration la plus proche d&apos;abord). Signalement 3 mois avant la date.
        </p>

        <div className="mt-3">
          <FilterChips
            label="Filtrer le stock"
            basePath="/admin/stock"
            param="filter"
            current={filter}
            params={{ q: q || undefined, filter }}
            options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
          />
        </div>
        <div className="mt-3">
          <LiveSearch id="s-search" label="Rechercher dans le stock" placeholder="Produit, parfum, référence ou n° de lot" />
        </div>

        {rowCount === 0 && (
          <EmptyState
            title={filtered ? "Aucun produit ne correspond." : "Aucun produit actif."}
            hint={filtered ? "Changez de filtre ou modifiez la recherche." : "Ajoutez d'abord un produit (page Produits)."}
            action={filtered ? { href: "/admin/stock", label: "Réinitialiser" } : undefined}
          />
        )}
        {variantCount > VARIANT_LIMIT && (
          <p className="mt-3 text-xs text-slate-500">{VARIANT_LIMIT} premiers parfums affichés sur {variantCount} : affinez avec un filtre ou une recherche.</p>
        )}

        <ul className="mt-2 divide-y divide-slate-100">
          {bareProducts.map((p) => (
            <li key={p.id}>
              <ExpandableRow
                label={p.name}
                leading={<ProductThumb url={p.imageSecureUrl} size={10} />}
                summary={
                  <span className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{p.name}</span>
                    <span className={`${badgeCls} ${badgeTone.expired} shrink-0`}>Rupture</span>
                  </span>
                }
              >
                <p className="text-sm text-slate-500">Aucun lot reçu. Utilisez « Réception d&apos;un lot » en haut de page.</p>
              </ExpandableRow>
            </li>
          ))}
          {variants.map((v) => {
            const vLots = lotsByVariant.get(v.id) ?? [];
            const available = vLots.filter((l) => l.availableQuantity > 0);
            const empty = vLots.filter((l) => l.availableQuantity === 0);
            const qty = available.reduce((n, l) => n + l.availableQuantity, 0);
            const unit = SALE_UNIT_LABEL[v.product.saleUnit].toLowerCase();
            const next = available[0] ? expiryInfo(available[0].expiresAt) : null; // FEFO : le premier lot expire le plus tôt
            const label = itemLabel(v.product.name, v.name);
            const inactive = !v.isActive || !v.product.isActive;
            return (
              <li key={v.id} className={inactive ? "opacity-70" : ""}>
                <ExpandableRow
                  label={label}
                  leading={<ProductThumb url={v.imageSecureUrl ?? v.product.imageSecureUrl} size={10} />}
                  summary={
                    <span className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-500">
                          {available.length > 0 ? `${available.length} lot${available.length > 1 ? "s" : ""} · expire le ${formatDate(available[0].expiresAt)}` : "Aucun lot en stock"}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        {inactive && <span className={`${badgeCls} ${badgeTone.none}`}>Désactivé</span>}
                        {qty === 0 ? (
                          <span className={`${badgeCls} ${badgeTone.expired}`}>Rupture</span>
                        ) : (
                          <>
                            <span className="text-sm font-medium text-slate-900">{qty} {unit}</span>
                            {next && next.tone !== "ok" && <span className={`${badgeCls} ${badgeTone[next.tone]}`}>{next.label}</span>}
                          </>
                        )}
                      </span>
                    </span>
                  }
                >
                  {vLots.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun lot reçu. Utilisez « Réception d&apos;un lot » en haut de page.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {[...available, ...empty].map((lot) => (
                        <LotRow key={lot.id} lot={lot} unit={unit} />
                      ))}
                    </ul>
                  )}
                </ExpandableRow>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={cardCls}>
        <CollapsibleSection label="Journal des corrections" hint="20 dernières">
        {adjustments === null ? (
          <p className="text-sm text-amber-900">
            Journal indisponible : la migration 003 (traçabilité du stock) n&apos;est pas encore appliquée sur la base.
          </p>
        ) : adjustments.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune correction enregistrée.</p>
        ) : (
          <ul className="space-y-2">
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
        </CollapsibleSection>
      </section>
    </AdminShell>
  );
}

type Lot = Awaited<ReturnType<typeof prisma.stockLot.findMany>>[number];

/** Un lot d'un parfum : quantités, dates, prix d'achat, et ses deux corrections repliées. */
function LotRow({ lot, unit }: { lot: Lot; unit: string }) {
  const info = expiryInfo(lot.expiresAt);
  const empty = lot.availableQuantity === 0;
  return (
    <li className={`px-3 py-3 ${empty ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {lot.availableQuantity} / {lot.initialQuantity} {unit}{lot.lotNumber && ` · lot ${lot.lotNumber}`}
          </p>
          <p className="text-sm text-slate-600">
            Reçu le {formatDate(lot.receivedAt)} · prix d&apos;achat :{" "}
            {lot.unitCost === null ? <span className="font-medium text-amber-900">inconnu</span> : formatMoney(Number(lot.unitCost.toString()))}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-800">{formatDate(lot.expiresAt)}</p>
          {!empty && <span className={`${badgeCls} ${badgeTone[info.tone]}`}>{info.label}</span>}
          {empty && <span className={`${badgeCls} ${badgeTone.none}`}>Épuisé</span>}
        </div>
      </div>
      <div className="mt-1">
        <details>
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
        <details>
          <summary className={summaryCls}>Corriger la quantité</summary>
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
      </div>
    </li>
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
