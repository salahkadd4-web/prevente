import Link from "next/link";
import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import CollapsibleSection from "@/components/collapsible-section";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls, linkCls, summaryCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import ConfirmButton from "@/components/confirm-button";
import EmptyState from "@/components/empty-state";
import ExpandableRow from "@/components/expandable-row";
import LiveSearch from "@/components/live-search";
import type { Prisma } from "@/app/generated/prisma/client";
import { moneyInputValue } from "@/lib/money";
import { formatMoney } from "@/lib/orders";
import { effectiveSalePrice } from "@/lib/pricing";
import VariantImage from "@/components/variant-image";
import { DEFAULT_FLAVOR_NAME, SALE_UNITS, SALE_UNIT_LABEL, itemLabel } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import {
  createProduct, createVariant, removeProductImage, removeVariantImage, setProductActive, setProductImage, setVariantActive, setVariantImage, updateProduct, updateVariant,
} from "./actions";

export const metadata = { title: "Produits · Grossiste Pro" };

function ToggleForm({ action, id, active, what, menu = false }: { action: typeof setProductActive; id: string; active: boolean; what: string; menu?: boolean }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      {active ? (
        <ConfirmButton
          message={`Désactiver ${what} ? Il n'apparaîtra plus pour de nouvelles commandes ni de nouveaux lots ; l'historique est conservé.`}
          className={menu ? "block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50" : btnGhost}
        >
          Désactiver
        </ConfirmButton>
      ) : (
        <button type="submit" className={menu ? "block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-100" : btnGhost}>Réactiver</button>
      )}
    </ActionForm>
  );
}

/** Menu « ⋯ » sans JavaScript (details/summary) : regroupe les actions rares et sensibles. */
function MoreMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary
        aria-label={label}
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-300 bg-white text-lg font-bold leading-none text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">{children}</div>
    </details>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const priceInputProps = { type: "text", inputMode: "decimal", pattern: "[0-9]+([.,][0-9]{1,2})?", title: "Nombre positif, 2 décimales maximum" } as const;

const PRODUCT_LIMIT = 100;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function Page({ searchParams }: PageProps<"/admin/products">) {
  await requireRole("admin");
  const q = one((await searchParams).q).slice(0, 80);

  // Recherche côté serveur : nom, description, catégorie, nom / référence (SKU) des parfums.
  const where: Prisma.ProductWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { category: { name: { contains: q, mode: "insensitive" } } },
          { variants: { some: { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } } },
        ],
      }
    : {};

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: PRODUCT_LIMIT,
      include: { category: { select: { name: true } }, variants: { orderBy: { name: "asc" } } },
    }),
  ]);

  // Quantité disponible par parfum (une seule requête) : le détail des lots vit dans la page Stock.
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const stock = variantIds.length
    ? await prisma.stockLot.groupBy({
        by: ["variantId"],
        where: { variantId: { in: variantIds }, availableQuantity: { gt: 0 } },
        _sum: { availableQuantity: true },
      })
    : [];
  const qtyByVariant = new Map(stock.map((s) => [s.variantId, s._sum.availableQuantity ?? 0]));
  const qtyOfVariant = (id: string) => qtyByVariant.get(id) ?? 0;

  return (
    <AdminShell current="products" title="Produits et parfums">
      <section className={cardCls}>
        <CollapsibleSection label="Ajouter un produit">
        <ActionForm action={createProduct} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-name" className={labelCls}>Nom (ex. Biscuit)</label>
            <input id="p-name" name="name" required maxLength={120} className={inputCls} />
          </div>
          <div>
            <label htmlFor="p-unit" className={labelCls}>Unité de vente</label>
            <select id="p-unit" name="saleUnit" required defaultValue="" className={inputCls}>
              <option value="" disabled>Choisir…</option>
              {SALE_UNITS.map((u) => (
                <option key={u} value={u}>{SALE_UNIT_LABEL[u]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="p-price" className={labelCls}>Prix de vente (facultatif)</label>
            <input id="p-price" name="salePrice" {...priceInputProps} placeholder="ex. 1250,50" className={inputCls} />
          </div>
          <div>
            <label htmlFor="p-desc" className={labelCls}>Description (facultatif)</label>
            <input id="p-desc" name="description" className={inputCls} />
          </div>
          <p className="text-xs text-slate-500 sm:col-span-2">La photo s&apos;ajoute ensuite en touchant la vignette du produit dans la liste.</p>
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}>Ajouter le produit</button>
          </div>
        </ActionForm>
        </CollapsibleSection>
      </section>

      <section className={cardCls}>
        <LiveSearch id="p-search" label="Rechercher un produit" placeholder="Rechercher : produit, parfum, référence, catégorie…" />
        <p className="mt-3 text-sm text-slate-600" aria-live="polite">
          {total} produit{total > 1 ? "s" : ""}{q ? " correspondant à la recherche" : ""}
          {total > PRODUCT_LIMIT && ` · ${PRODUCT_LIMIT} premiers affichés : affinez la recherche`}
        </p>

        {products.length === 0 && (
          <EmptyState
            title={q ? `Aucun produit ne correspond à « ${q} ».` : "Aucun produit pour le moment."}
            hint={q ? "Modifiez la recherche." : "Ajoutez votre premier produit avec « Ajouter un produit » en haut de page."}
            action={q ? { href: "/admin/products", label: "Réinitialiser" } : undefined}
          />
        )}

        <ul className="mt-2 divide-y divide-slate-100">
          {products.map((p) => {
            const unit = SALE_UNIT_LABEL[p.saleUnit].toLowerCase();
            const stockQty = p.variants.reduce((n, v) => n + qtyOfVariant(v.id), 0);
            const flavors = p.variants.filter((v) => v.name !== DEFAULT_FLAVOR_NAME);
            const activeVariants = p.variants.filter((v) => v.isActive);
            const priceMissing = activeVariants.length > 0
              ? activeVariants.some((v) => effectiveSalePrice(v, p) === null)
              : p.salePrice === null;
            const showOutOfStock = p.isActive && p.variants.length > 0 && stockQty === 0;

            return (
              <li key={p.id} className={p.isActive ? "" : "opacity-70"}>
                <ExpandableRow
                  label={p.name}
                  leading={
                    <VariantImage
                      variantId={p.id}
                      idField="productId"
                      label={p.name}
                      imageUrl={p.imageSecureUrl ?? p.variants.find((v) => v.imageSecureUrl)?.imageSecureUrl ?? null}
                      hasImage={!!p.imageSecureUrl}
                      size={12}
                      uploadAction={setProductImage}
                      removeAction={removeProductImage}
                      removeConfirm="Retirer la photo de ce produit ?"
                    />
                  }
                  summary={
                    <span className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{p.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[p.category?.name, p.description].filter(Boolean).join(" · ") || SALE_UNIT_LABEL[p.saleUnit]}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right text-sm text-slate-700 sm:block">
                        <span className="block">{stockQty > 0 ? plural(stockQty, unit) : "0 en stock"}</span>
                        <span className="block text-xs text-slate-500">{flavors.length > 0 ? plural(flavors.length, "parfum") : "Sans parfum"}</span>
                      </span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        {!p.isActive && <span className={`${badgeCls} ${badgeTone.none}`}>Désactivé</span>}
                        {p.isActive && priceMissing && <span className={`${badgeCls} ${badgeTone.soon}`}>Prix à définir</span>}
                        {showOutOfStock && <span className={`${badgeCls} ${badgeTone.expired}`}>Rupture</span>}
                      </span>
                    </span>
                  }
                  actions={
                    p.isActive ? (
                      <MoreMenu label={`Actions pour ${p.name}`}>
                        <ToggleForm action={setProductActive} id={p.id} active={p.isActive} what={`le produit « ${p.name} »`} menu />
                      </MoreMenu>
                    ) : (
                      <ToggleForm action={setProductActive} id={p.id} active={p.isActive} what={`le produit « ${p.name} »`} />
                    )
                  }
                >
                  <div className="space-y-3 border-l-2 border-slate-100 pl-3">
                    {/* Une ligne par parfum : vignette (photo) + résumé ; « Modifier » ouvre le formulaire du parfum. */}
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {p.variants.length === 0 && (
                        <li className="px-3 py-3 text-sm text-slate-500">Aucun parfum : ajoutez-en un ci-dessous, ou réceptionnez directement du stock (page Stock).</li>
                      )}
                      {p.variants.map((v) => {
                        const qty = qtyOfVariant(v.id);
                        const eff = effectiveSalePrice(v, p);
                        const vName = v.name === DEFAULT_FLAVOR_NAME ? "Sans parfum" : v.name;
                        return (
                          <li key={v.id} className={`flex items-start gap-3 px-3 py-2 ${v.isActive ? "" : "opacity-60"}`}>
                            <VariantImage
                              variantId={v.id}
                              label={itemLabel(p.name, v.name)}
                              imageUrl={v.imageSecureUrl}
                              hasImage={!!v.imageSecureUrl}
                              size={10}
                              uploadAction={setVariantImage}
                              removeAction={removeVariantImage}
                            />
                            <details className="group min-w-0 flex-1">
                              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-[10px] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 [&::-webkit-details-marker]:hidden">
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium text-slate-900">{vName}</span>
                                  <span className="block text-xs text-slate-500">{qty > 0 ? `${plural(qty, unit)} en stock` : "0 en stock"}</span>
                                </span>
                                <span className={`shrink-0 text-sm ${eff === null ? "font-medium text-amber-800" : "text-slate-800"}`}>
                                  {eff === null ? "Prix à définir" : formatMoney(Number(eff))}
                                </span>
                                {!v.isActive && <span className={`${badgeCls} ${badgeTone.none} shrink-0`}>Désactivé</span>}
                                <span className="shrink-0 text-sm font-semibold text-emerald-800 group-open:hidden" aria-hidden="true">Modifier</span>
                                <span className="hidden shrink-0 text-sm font-semibold text-slate-500 group-open:inline" aria-hidden="true">Fermer</span>
                                <span className="sr-only">Modifier le parfum {vName}</span>
                              </summary>

                              <div className="mt-2 space-y-3 border-t border-slate-100 pt-3">
                                <ActionForm action={updateVariant} className="grid gap-3 sm:grid-cols-3">
                                  <input type="hidden" name="id" value={v.id} />
                                  <label className="block"><span className={labelCls}>Parfum</span><input name="name" required maxLength={80} defaultValue={v.name} className={inputCls} /></label>
                                  <label className="block"><span className={labelCls}>Prix de vente {v.salePrice === null && <span className="font-normal text-slate-500">(vide = prix du produit)</span>}</span><input name="salePrice" {...priceInputProps} defaultValue={moneyInputValue(v.salePrice)} className={inputCls} /></label>
                                  <label className="block"><span className={labelCls}>Référence <span className="font-normal text-slate-500">(facultatif)</span></span><input name="sku" defaultValue={v.sku ?? ""} className={inputCls} /></label>
                                  <button type="submit" className={`${btnPrimary} sm:col-span-3 sm:justify-self-start`}>Enregistrer</button>
                                </ActionForm>
                                <div className="flex justify-end">
                                  <ToggleForm action={setVariantActive} id={v.id} active={v.isActive} what={`le parfum « ${v.name} »`} />
                                </div>
                              </div>
                            </details>
                          </li>
                        );
                      })}
                    </ul>

                    <p className="text-sm text-slate-700">
                      {stockQty > 0 ? `${plural(stockQty, unit)} en stock` : "Aucun stock"} ·{" "}
                      <Link href={`/admin/stock?q=${encodeURIComponent(p.name)}`} className={linkCls}>Voir le stock →</Link>
                    </p>

                    <details>
                      <summary className={summaryCls}><span aria-hidden="true">+</span> Ajouter un parfum</summary>
                      <ActionForm action={createVariant} className="mt-2 grid gap-3 sm:grid-cols-3">
                        <input type="hidden" name="productId" value={p.id} />
                        <input name="name" required maxLength={80} placeholder="Nom du parfum (ex. Chocolat)" aria-label="Nom du parfum" className={inputCls} />
                        <input name="salePrice" {...priceInputProps} placeholder="Prix (vide = prix du produit)" aria-label="Prix de vente du parfum" className={inputCls} />
                        <input name="sku" placeholder="Référence (facultatif)" aria-label="Référence" className={inputCls} />
                        <button type="submit" className={`${btnPrimary} sm:col-span-3 sm:justify-self-start`}>Ajouter le parfum</button>
                      </ActionForm>
                    </details>

                    <details>
                      <summary className={summaryCls}>
                        Modifier le produit <span className="font-normal text-slate-500">· {SALE_UNIT_LABEL[p.saleUnit]}</span>
                      </summary>
                      <ActionForm action={updateProduct} className="mt-2 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={p.id} />
                        <label className="block"><span className={labelCls}>Nom</span><input name="name" required maxLength={120} defaultValue={p.name} className={inputCls} /></label>
                        <label className="block"><span className={labelCls}>Prix de vente</span><input name="salePrice" {...priceInputProps} defaultValue={moneyInputValue(p.salePrice)} className={inputCls} /></label>
                        <label className="block sm:col-span-2"><span className={labelCls}>Description <span className="font-normal text-slate-500">(facultatif)</span></span>
                          <input name="description" defaultValue={p.description ?? ""} className={inputCls} /></label>
                        <p className="text-xs text-slate-500 sm:col-span-2">
                          L&apos;unité ne peut pas être modifiée (le stock en dépend). Changer le prix ne modifie pas les commandes déjà passées.
                        </p>
                        <button type="submit" className={`${btnPrimary} sm:col-span-2 sm:justify-self-start`}>Enregistrer le produit</button>
                      </ActionForm>
                    </details>
                  </div>
                </ExpandableRow>
              </li>
            );
          })}
        </ul>
      </section>
    </AdminShell>
  );
}
