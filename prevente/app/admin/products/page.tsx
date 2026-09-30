import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import CollapsibleSection from "@/components/collapsible-section";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import ConfirmButton from "@/components/confirm-button";
import ExpandableRow from "@/components/expandable-row";
import LiveSearch from "@/components/live-search";
import type { Prisma } from "@/app/generated/prisma/client";
import { moneyInputValue } from "@/lib/money";
import { formatMoney } from "@/lib/orders";
import { effectiveSalePrice } from "@/lib/pricing";
import { expiryInfo, formatDate } from "@/lib/stock/expiry";
import VariantImage from "@/components/variant-image";
import { DEFAULT_FLAVOR_NAME, SALE_UNITS, SALE_UNIT_LABEL, thumbUrl } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import {
  createProduct, createVariant, removeProductImage, removeVariantImage, setProductActive, setProductImage, setVariantActive, setVariantImage, updateProduct, updateVariant,
} from "./actions";

export const metadata = { title: "Produits · Grossiste Pro" };

function ToggleForm({ action, id, active, what }: { action: typeof setProductActive; id: string; active: boolean; what: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      {active ? (
        <ConfirmButton message={`Désactiver ${what} ? Il n'apparaîtra plus pour de nouvelles commandes ni de nouveaux lots ; l'historique est conservé.`} className={btnGhost}>
          Désactiver
        </ConfirmButton>
      ) : (
        <button type="submit" className={btnGhost}>Réactiver</button>
      )}
    </ActionForm>
  );
}

const PRODUCT_LIMIT = 100;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const money = (v: { toString(): string } | null) => (v === null ? null : formatMoney(Number(v.toString())));

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

  // Lots en stock des produits affichés (une seule requête, pas de N+1) : quantités, prix d'achat, expirations.
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const lots = variantIds.length
    ? await prisma.stockLot.findMany({
        where: { variantId: { in: variantIds }, availableQuantity: { gt: 0 } },
        orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
        select: { id: true, variantId: true, lotNumber: true, availableQuantity: true, unitCost: true, expiresAt: true },
        take: 3000,
      })
    : [];
  const lotsByVariant = new Map<string, typeof lots>();
  for (const l of lots) lotsByVariant.set(l.variantId, [...(lotsByVariant.get(l.variantId) ?? []), l]);
  const qtyOfVariant = (id: string) => (lotsByVariant.get(id) ?? []).reduce((n, l) => n + l.availableQuantity, 0);

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
            <input id="p-price" name="salePrice" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" title="Nombre positif, 2 décimales maximum" placeholder="ex. 1250,50" className={inputCls} />
          </div>
          <div>
            <label htmlFor="p-desc" className={labelCls}>Description (facultatif)</label>
            <input id="p-desc" name="description" className={inputCls} />
          </div>
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
          <p className="mt-4 text-sm text-slate-500">{q ? `Aucun produit ne correspond à « ${q} ».` : "Aucun produit pour le moment."}</p>
        )}

        <ul className="mt-2 divide-y divide-slate-100">
          {products.map((p) => {
            const stockQty = p.variants.reduce((n, v) => n + qtyOfVariant(v.id), 0);
            const unit = SALE_UNIT_LABEL[p.saleUnit].toLowerCase();
            const priceLabel = money(p.salePrice);
            return (
              <li key={p.id} className={p.isActive ? "" : "opacity-70"}>
                <ExpandableRow
                  label={p.name}
                  summary={
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="min-w-40 flex-1">
                        <span className="block font-medium text-slate-900">{p.name}</span>
                        <span className="block text-xs text-slate-500">{p.category?.name ?? "Sans catégorie"}</span>
                      </span>
                      <span className="text-sm text-slate-700">
                        <span className="text-xs text-slate-500">Vente </span>
                        {priceLabel ?? <span className="text-slate-500">non défini</span>}
                      </span>
                      <span className="text-sm text-slate-700">
                        <span className="text-xs text-slate-500">Stock </span>
                        {stockQty > 0 ? `${stockQty} ${unit}` : <span className={`${badgeCls} ${badgeTone.expired}`}>Rupture</span>}
                      </span>
                      {!p.isActive && <span className={`${badgeCls} ${badgeTone.expired}`}>Désactivé</span>}
                    </span>
                  }
                  actions={<ToggleForm action={setProductActive} id={p.id} active={p.isActive} what={`le produit « ${p.name} »`} />}
                >
                  <div className="space-y-4 border-l-2 border-slate-100 pl-3">
                    <div className="flex items-start gap-3">
                      {p.imageSecureUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbUrl(p.imageSecureUrl)} alt={p.name} width={64} height={64} className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400" aria-hidden>Photo</div>
                      )}
                      <dl className="grid flex-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        <div><dt className="inline text-slate-500">Catégorie : </dt><dd className="inline text-slate-900">{p.category?.name ?? "—"}</dd></div>
                        <div><dt className="inline text-slate-500">Unité de vente : </dt><dd className="inline text-slate-900">{SALE_UNIT_LABEL[p.saleUnit]}</dd></div>
                        <div><dt className="inline text-slate-500">Prix de vente : </dt><dd className="inline text-slate-900">{priceLabel ?? "non défini"}</dd></div>
                        {p.description && <div className="sm:col-span-2"><dt className="inline text-slate-500">Description : </dt><dd className="inline text-slate-900">{p.description}</dd></div>}
                      </dl>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Parfums, stock et prix d&apos;achat</h3>
                      <ul className="mt-2 divide-y divide-slate-100">
                        {p.variants.length === 0 && <li className="py-2 text-sm text-slate-500">Produit sans parfum : réceptionnez directement du stock dans la page Stock (ou ajoutez un parfum).</li>}
                        {p.variants.map((v) => {
                          const vLots = lotsByVariant.get(v.id) ?? [];
                          const eff = effectiveSalePrice(v, p);
                          return (
                            <li key={v.id} className={`py-3 ${v.isActive ? "" : "opacity-60"}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-3">
                                  {v.imageSecureUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={thumbUrl(v.imageSecureUrl)} alt={`${p.name} ${v.name}`} width={56} height={56} className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
                                  ) : (
                                    <div aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">Photo</div>
                                  )}
                                  <div>
                                    <span className="font-medium text-slate-900">{v.name === DEFAULT_FLAVOR_NAME ? `${v.name} (parfum technique)` : v.name}</span>
                                    {v.sku && <span className="ml-2 text-xs text-slate-500">réf. {v.sku}</span>}
                                    {!v.isActive && <span className={`${badgeCls} ${badgeTone.expired} ml-2`}>Désactivé</span>}
                                    <p className="text-xs text-slate-600">
                                      Vente : {eff === null ? "non défini" : formatMoney(Number(eff))}{v.salePrice !== null && " (prix propre au parfum)"} · En stock : {qtyOfVariant(v.id)} {unit}
                                    </p>
                                  </div>
                                </div>
                                <ToggleForm action={setVariantActive} id={v.id} active={v.isActive} what={`le parfum « ${v.name} »`} />
                              </div>

                              {vLots.length > 0 && (
                                <div className="mt-2 overflow-x-auto">
                                  <table className="w-full min-w-[440px] text-left text-xs">
                                    <thead className="text-slate-500">
                                      <tr>
                                        <th scope="col" className="py-1 pr-2 font-medium">Lot</th>
                                        <th scope="col" className="px-2 py-1 text-right font-medium">Dispo.</th>
                                        <th scope="col" className="px-2 py-1 text-right font-medium">Prix d&apos;achat</th>
                                        <th scope="col" className="py-1 pl-2 font-medium">Expiration</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {vLots.map((l) => {
                                        const info = expiryInfo(l.expiresAt);
                                        return (
                                          <tr key={l.id}>
                                            <td className="py-1 pr-2 text-slate-800">{l.lotNumber ?? "—"}</td>
                                            <td className="px-2 py-1 text-right text-slate-800">{l.availableQuantity}</td>
                                            <td className="px-2 py-1 text-right text-slate-800">{money(l.unitCost) ?? <span className="text-slate-500">inconnu</span>}</td>
                                            <td className="py-1 pl-2 text-slate-800">
                                              {formatDate(l.expiresAt)} <span className={`${badgeCls} ${badgeTone[info.tone]} ml-1`}>{info.label}</span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <div className="mt-2">
                                <VariantImage variantId={v.id} hasImage={!!v.imageSecureUrl} uploadAction={setVariantImage} removeAction={removeVariantImage} />
                              </div>
                              <details className="mt-1">
                                <summary className="cursor-pointer text-xs font-medium text-emerald-800">Modifier le parfum</summary>
                                <ActionForm action={updateVariant} className="mt-2 grid gap-3 sm:grid-cols-2">
                                  <input type="hidden" name="id" value={v.id} />
                                  <input name="name" required maxLength={80} defaultValue={v.name} aria-label="Parfum" className={inputCls} />
                                  <input name="sku" defaultValue={v.sku ?? ""} placeholder="Référence (facultatif)" aria-label="Référence" className={inputCls} />
                                  <input name="salePrice" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" title="Nombre positif, 2 décimales maximum" defaultValue={moneyInputValue(v.salePrice)} placeholder="Prix de vente du parfum (vide = prix du produit)" aria-label="Prix de vente du parfum" className={inputCls} />
                                  <button type="submit" className={btnGhost}>Enregistrer</button>
                                </ActionForm>
                              </details>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-1 text-xs text-slate-500">Le prix d&apos;achat est propre à chaque lot : il se saisit à la réception dans la page Stock.</p>

                      <ActionForm action={createVariant} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="productId" value={p.id} />
                        <input name="name" required maxLength={80} placeholder="Nouveau parfum (ex. Chocolat)" aria-label="Nouveau parfum" className={inputCls} />
                        <input name="sku" placeholder="Référence (facultatif)" aria-label="Référence" className={inputCls} />
                        <input name="salePrice" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" title="Nombre positif, 2 décimales maximum" placeholder="Prix de vente (vide = prix du produit)" aria-label="Prix de vente du parfum" className={inputCls} />
                        <button type="submit" className={btnPrimary}>Ajouter</button>
                      </ActionForm>
                    </div>

                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-emerald-800">Modifier le produit</summary>
                      <ActionForm action={updateProduct} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input name="name" required maxLength={120} defaultValue={p.name} aria-label="Nom" className={inputCls} />
                        <input name="salePrice" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" title="Nombre positif, 2 décimales maximum" defaultValue={moneyInputValue(p.salePrice)} placeholder="Prix de vente" aria-label="Prix de vente" className={inputCls} />
                        <input name="description" defaultValue={p.description ?? ""} placeholder="Description" aria-label="Description" className={`${inputCls} sm:col-span-2`} />
                        <p className="text-xs text-slate-500 sm:col-span-2">
                          L&apos;unité ne peut pas être modifiée (le stock en dépend). Changer le prix de vente ne modifie pas les commandes déjà passées : leur prix est figé.
                        </p>
                        <button type="submit" className={btnGhost}>Enregistrer</button>
                      </ActionForm>
                    </details>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Photo du produit</h3>
                      <p className="mb-2 text-xs text-slate-500">Pour un produit sans parfum, ou comme photo générale du produit.</p>
                      <VariantImage
                        variantId={p.id}
                        idField="productId"
                        hasImage={!!p.imageSecureUrl}
                        uploadAction={setProductImage}
                        removeAction={removeProductImage}
                        removeConfirm="Retirer la photo de ce produit ?"
                      />
                    </div>
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
