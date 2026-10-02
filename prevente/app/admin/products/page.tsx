import Link from "next/link";
import AdminShell from "@/components/admin-shell";
import EmptyState from "@/components/empty-state";
import FilterChips from "@/components/filter-chips";
import LiveSearch from "@/components/live-search";
import ProductThumb from "@/components/product-thumb";
import ToggleActiveForm from "@/components/admin/toggle-active-form";
import { badgeCls, badgeTone, btnGhost, cardCls } from "@/components/ui";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireRole } from "@/lib/auth/session";
import { DEFAULT_FLAVOR_NAME, SALE_UNITS, SALE_UNIT_LABEL } from "@/lib/catalog";
import { effectiveSalePrice } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { alertLimitDate, expiryInfo } from "@/lib/stock/expiry";
import { productQuantity } from "@/lib/stock/quantity";
import { setProductActive } from "./actions";
import NewProductForm from "./new-product-form";

export const metadata = { title: "Produits et stock · Grossiste Pro" };

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "available", label: "Avec stock" },
  { key: "empty", label: "Rupture" },
  { key: "soon", label: "Expirent sous 3 mois" },
  { key: "expired", label: "Expirés" },
  { key: "inactive", label: "Désactivés" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const PRODUCT_LIMIT = 100;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export default async function Page({ searchParams }: PageProps<"/admin/products">) {
  await requireRole("admin");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 80);
  const rawFilter = one(sp.filter);
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as FilterKey) : "all";

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const limit = alertLimitDate(now);

  const inStock: Prisma.StockLotWhereInput = { availableQuantity: { gt: 0 } };
  const filterWhere: Prisma.ProductWhereInput =
    filter === "available" ? { variants: { some: { stockLots: { some: inStock } } } }
    : filter === "empty" ? { isActive: true, variants: { none: { stockLots: { some: inStock } } } }
    : filter === "expired" ? { variants: { some: { stockLots: { some: { ...inStock, expiresAt: { lt: today } } } } } }
    : filter === "soon" ? { variants: { some: { stockLots: { some: { ...inStock, expiresAt: { gte: today, lte: limit } } } } } }
    : filter === "inactive" ? { isActive: false }
    : {};

  // Recherche côté serveur : produit, description, catégorie, parfum, référence (SKU), n° de lot.
  const searchWhere: Prisma.ProductWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { category: { name: { contains: q, mode: "insensitive" } } },
          { variants: { some: { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { stockLots: { some: { lotNumber: { contains: q, mode: "insensitive" } } } }] } } },
        ],
      }
    : {};
  const where: Prisma.ProductWhereInput = { AND: [filterWhere, searchWhere] };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: PRODUCT_LIMIT,
      include: { category: { select: { name: true } }, variants: { orderBy: { name: "asc" } } },
    }),
  ]);

  // Quantité disponible et plus proche expiration par parfum (une seule requête pour toute la liste).
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const stock = variantIds.length
    ? await prisma.stockLot.groupBy({
        by: ["variantId"],
        where: { variantId: { in: variantIds }, availableQuantity: { gt: 0 } },
        _sum: { availableQuantity: true },
        _min: { expiresAt: true },
      })
    : [];
  const qtyByVariant = new Map(stock.map((s) => [s.variantId, s._sum.availableQuantity ?? 0]));
  const expiryByVariant = new Map(stock.map((s) => [s.variantId, s._min.expiresAt]));

  const filtered = filter !== "all" || q !== "";

  return (
    <AdminShell current="products" title="Produits et stock">
      <section className={cardCls}>
        <NewProductForm units={SALE_UNITS.map((u) => ({ value: u, label: SALE_UNIT_LABEL[u] }))} />

        <div className="mt-4">
          <FilterChips
            label="Filtrer les produits"
            basePath="/admin/products"
            param="filter"
            current={filter}
            params={{ q: q || undefined, filter }}
            options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
          />
        </div>
        <div className="mt-3">
          <LiveSearch id="p-search" label="Rechercher un produit" placeholder="Produit, parfum, référence, n° de lot, catégorie…" />
        </div>
        <p className="mt-3 text-sm text-slate-600" aria-live="polite">
          {plural(total, "produit")}{filtered ? " correspondant" + (total > 1 ? "s" : "") : ""}
          {total > PRODUCT_LIMIT && ` · ${PRODUCT_LIMIT} premiers affichés : affinez la recherche`}
        </p>

        {products.length === 0 ? (
          <EmptyState
            title={filtered ? "Aucun produit ne correspond." : "Aucun produit pour le moment."}
            hint={filtered ? "Changez de filtre ou modifiez la recherche." : "Ajoutez votre premier produit avec « Ajouter un produit »."}
            action={filtered ? { href: "/admin/products", label: "Réinitialiser" } : undefined}
          />
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-20 py-2 pr-2"><span className="sr-only">Photo</span></th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Produit</th>
                  <th scope="col" className="hidden py-2 pr-3 font-semibold sm:table-cell">Parfums</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Quantité</th>
                  <th scope="col" className="py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const unit = SALE_UNIT_LABEL[p.saleUnit].toLowerCase();
                  const ids = p.variants.map((v) => v.id);
                  const qty = productQuantity(ids, qtyByVariant); // somme des parfums : voir lib/stock/quantity.ts
                  const flavors = p.variants.filter((v) => v.name !== DEFAULT_FLAVOR_NAME);
                  const activeVariants = p.variants.filter((v) => v.isActive);
                  const priceMissing = activeVariants.length > 0
                    ? activeVariants.some((v) => effectiveSalePrice(v, p) === null)
                    : p.salePrice === null;
                  const dates = ids.map((id) => expiryByVariant.get(id)).filter((d): d is Date => !!d);
                  const next = dates.length > 0 ? expiryInfo(new Date(Math.min(...dates.map((d) => d.getTime())))) : null;
                  const photo = p.imageSecureUrl ?? p.variants.find((v) => v.imageSecureUrl)?.imageSecureUrl ?? null;
                  const flavorsLabel = flavors.length > 0 ? plural(flavors.length, "parfum") : "Sans parfum";
                  return (
                    <tr key={p.id} className={p.isActive ? "" : "opacity-70"}>
                      <td className="py-2 pr-2"><ProductThumb url={photo} alt={`Photo : ${p.name}`} size={16} /></td>
                      <td className="py-2 pr-3">
                        <Link href={`/admin/products/${p.id}`} className="block font-medium text-slate-900 hover:underline">{p.name}</Link>
                        <span className="block text-xs text-slate-500">{[p.category?.name, SALE_UNIT_LABEL[p.saleUnit]].filter(Boolean).join(" · ")}</span>
                        <span className="block text-xs text-slate-500 sm:hidden">{flavorsLabel}</span>
                      </td>
                      <td className="hidden py-2 pr-3 text-slate-700 sm:table-cell">{flavorsLabel}</td>
                      <td className="py-2 pr-3">
                        <span className="block font-medium text-slate-900">{qty} {unit}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {!p.isActive && <span className={`${badgeCls} ${badgeTone.none}`}>Désactivé</span>}
                          {p.isActive && qty === 0 && <span className={`${badgeCls} ${badgeTone.expired}`}>Rupture</span>}
                          {qty > 0 && next && next.tone !== "ok" && <span className={`${badgeCls} ${badgeTone[next.tone]}`}>{next.label}</span>}
                          {p.isActive && priceMissing && <span className={`${badgeCls} ${badgeTone.soon}`}>Prix à définir</span>}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          <Link href={`/admin/products/${p.id}`} className={`${btnGhost} inline-flex items-center`}>Détails</Link>
                          <ToggleActiveForm action={setProductActive} id={p.id} active={p.isActive} what={`le produit « ${p.name} »`} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
