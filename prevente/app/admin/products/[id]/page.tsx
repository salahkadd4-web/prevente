import { notFound } from "next/navigation";
import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import ToggleActiveForm from "@/components/admin/toggle-active-form";
import VariantImage from "@/components/variant-image";
import { alertCls, badgeCls, badgeTone, btnPrimary, cardCls, inputCls, labelCls, summaryCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { DEFAULT_FLAVOR_NAME, SALE_UNIT_LABEL, itemLabel } from "@/lib/catalog";
import { isUuid } from "@/lib/form";
import { moneyInputValue } from "@/lib/money";
import { formatMoney } from "@/lib/orders";
import { effectiveSalePrice } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { productQuantity, variantQuantity } from "@/lib/stock/quantity";
import {
  createVariant, removeProductImage, removeVariantImage, setProductActive, setProductImage, setVariantActive, setVariantImage, updateProduct, updateVariant,
} from "../actions";
import LotRow from "./lot-row";
import ReceiveLotForm from "./receive-lot-form";

export const metadata = { title: "Détails du produit · Grossiste Pro" };

const priceInputProps = { type: "text", inputMode: "decimal", pattern: "[0-9]+([.,][0-9]{1,2})?", title: "Nombre positif, 2 décimales maximum" } as const;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export default async function Page({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const photoFailed = (Array.isArray((await searchParams).photo) ? (await searchParams).photo?.[0] : (await searchParams).photo) === "failed";

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: { select: { name: true } }, variants: { orderBy: { name: "asc" } } },
  });
  if (!product) notFound();

  // Lots de ce produit, ordre FEFO : expiration la plus proche d'abord (sans date en dernier), puis réception la plus ancienne.
  const variantIds = product.variants.map((v) => v.id);
  const lots = variantIds.length
    ? await prisma.stockLot.findMany({
        where: { variantId: { in: variantIds } },
        orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
        take: 1000,
      })
    : [];
  const lotsByVariant = new Map<string, typeof lots>();
  for (const l of lots) lotsByVariant.set(l.variantId, [...(lotsByVariant.get(l.variantId) ?? []), l]);

  // Quantités : parfum = somme de ses lots ; produit = somme des parfums (même fonction que la liste).
  const qtyByVariant = new Map(product.variants.map((v) => [v.id, variantQuantity(lotsByVariant.get(v.id) ?? [])]));
  const totalQty = productQuantity(variantIds, qtyByVariant);

  const unit = SALE_UNIT_LABEL[product.saleUnit].toLowerCase();
  const receivedToday = new Date().toISOString().slice(0, 10);
  const canReceive = product.isActive;

  return (
    <AdminShell current="products" title={product.name} back={{ href: "/admin/products", label: "Produits et stock" }}>
      {photoFailed && (
        <p role="status" className={alertCls.warn}>Le produit a bien été ajouté, mais sa photo n&apos;a pas pu être enregistrée. Touchez la vignette pour la rajouter.</p>
      )}

      <section className={cardCls}>
        <div className="flex items-start gap-4">
          <VariantImage
            variantId={product.id}
            idField="productId"
            label={product.name}
            imageUrl={product.imageSecureUrl}
            hasImage={!!product.imageSecureUrl}
            size={16}
            uploadAction={setProductImage}
            removeAction={removeProductImage}
            removeConfirm="Retirer la photo de ce produit ?"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-600">{[product.category?.name, SALE_UNIT_LABEL[product.saleUnit]].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{totalQty} {unit}</p>
            <p className="text-xs text-slate-500">
              Quantité du produit = somme des quantités de ses parfums
              {product.variants.length > 1 && <> ({product.variants.map((v) => qtyByVariant.get(v.id) ?? 0).join(" + ")})</>}.
            </p>
            <p className="mt-2 flex flex-wrap gap-1">
              {!product.isActive && <span className={`${badgeCls} ${badgeTone.none}`}>Désactivé</span>}
              {product.isActive && product.variants.length > 0 && totalQty === 0 && <span className={`${badgeCls} ${badgeTone.expired}`}>Rupture</span>}
            </p>
          </div>
          <ToggleActiveForm action={setProductActive} id={product.id} active={product.isActive} what={`le produit « ${product.name} »`} />
        </div>

        <h2 className="mt-6 text-lg font-semibold text-slate-900">Informations du produit</h2>
        <ActionForm action={updateProduct} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={product.id} />
          <label className="block"><span className={labelCls}>Nom</span><input name="name" required maxLength={120} defaultValue={product.name} className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Prix de vente</span><input name="salePrice" {...priceInputProps} defaultValue={moneyInputValue(product.salePrice)} className={inputCls} /></label>
          <label className="block sm:col-span-2"><span className={labelCls}>Description <span className="font-normal text-slate-500">(facultatif)</span></span>
            <input name="description" defaultValue={product.description ?? ""} className={inputCls} /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Unité : {SALE_UNIT_LABEL[product.saleUnit]} — elle ne peut pas être modifiée (le stock en dépend). Changer le prix ne modifie pas les commandes déjà passées.
          </p>
          <button type="submit" className={`${btnPrimary} sm:col-span-2 sm:justify-self-start`}>Enregistrer le produit</button>
        </ActionForm>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Parfums, photos et quantités</h2>
        <p className="mt-1 text-sm text-slate-600">Touchez la vignette d&apos;un parfum pour changer sa photo. La quantité d&apos;un parfum vient de ses lots (classés FEFO : expiration la plus proche d&apos;abord).</p>

        {product.variants.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <p className="text-sm text-slate-700">Ce produit n&apos;a pas de parfum : ajoutez-en un ci-dessous, ou réceptionnez directement du stock pour le produit.</p>
            {canReceive ? (
              <details>
                <summary className={summaryCls}><span aria-hidden="true">+</span> Réceptionner un lot (sans parfum)</summary>
                <ReceiveLotForm target={`p:${product.id}`} idPrefix="bare" unit={unit} receivedToday={receivedToday} />
              </details>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Réactivez le produit pour réceptionner du stock.</p>
            )}
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {product.variants.map((v) => {
              const vLots = lotsByVariant.get(v.id) ?? [];
              const available = vLots.filter((l) => l.availableQuantity > 0);
              const empty = vLots.filter((l) => l.availableQuantity === 0);
              const qty = qtyByVariant.get(v.id) ?? 0;
              const eff = effectiveSalePrice(v, product);
              const technical = v.name === DEFAULT_FLAVOR_NAME;
              const vName = technical ? "Sans parfum" : v.name;
              return (
                <li key={v.id} className={`px-3 py-3 ${v.isActive ? "" : "opacity-70"}`}>
                  <div className="flex items-start gap-3">
                    <VariantImage
                      variantId={v.id}
                      label={itemLabel(product.name, v.name)}
                      imageUrl={v.imageSecureUrl}
                      hasImage={!!v.imageSecureUrl}
                      size={12}
                      uploadAction={setVariantImage}
                      removeAction={removeVariantImage}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{vName}</p>
                      <p className={`text-sm ${eff === null ? "font-medium text-amber-800" : "text-slate-600"}`}>{eff === null ? "Prix à définir" : formatMoney(Number(eff))}</p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {!v.isActive && <span className={`${badgeCls} ${badgeTone.none}`}>Désactivé</span>}
                        {qty === 0 && <span className={`${badgeCls} ${badgeTone.expired}`}>Rupture</span>}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-lg font-semibold text-slate-900">{qty} <span className="text-sm font-normal text-slate-600">{unit}</span></p>
                  </div>

                  <div className="mt-1">
                    <details>
                      <summary className={summaryCls}>Lots et quantités ({plural(vLots.length, "lot")})</summary>
                      {vLots.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-500">Aucun lot reçu pour ce parfum.</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                          {[...available, ...empty].map((lot) => <LotRow key={lot.id} lot={lot} unit={unit} />)}
                        </ul>
                      )}
                    </details>
                    <details>
                      <summary className={summaryCls}><span aria-hidden="true">+</span> Réceptionner un lot</summary>
                      {v.isActive && canReceive ? (
                        <ReceiveLotForm target={v.id} idPrefix={`rl-${v.id}`} unit={unit} receivedToday={receivedToday} />
                      ) : (
                        <p className="mt-1 text-sm text-slate-500">Réactivez le produit et le parfum pour réceptionner du stock.</p>
                      )}
                    </details>
                    <details>
                      <summary className={summaryCls}>Modifier le parfum</summary>
                      <div className="mt-2 space-y-3 border-t border-slate-100 pt-3">
                        <ActionForm action={updateVariant} className="grid gap-3 sm:grid-cols-3">
                          <input type="hidden" name="id" value={v.id} />
                          <label className="block"><span className={labelCls}>Parfum</span><input name="name" required maxLength={80} defaultValue={v.name} readOnly={technical} className={inputCls} /></label>
                          <label className="block"><span className={labelCls}>Prix de vente {v.salePrice === null && <span className="font-normal text-slate-500">(vide = prix du produit)</span>}</span><input name="salePrice" {...priceInputProps} defaultValue={moneyInputValue(v.salePrice)} className={inputCls} /></label>
                          <label className="block"><span className={labelCls}>Référence <span className="font-normal text-slate-500">(facultatif)</span></span><input name="sku" defaultValue={v.sku ?? ""} className={inputCls} /></label>
                          <button type="submit" className={`${btnPrimary} sm:col-span-3 sm:justify-self-start`}>Enregistrer</button>
                        </ActionForm>
                        <div className="flex justify-end">
                          <ToggleActiveForm action={setVariantActive} id={v.id} active={v.isActive} what={`le parfum « ${vName} »`} />
                        </div>
                      </div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <details className="mt-4">
          <summary className={summaryCls}><span aria-hidden="true">+</span> Ajouter un parfum</summary>
          <ActionForm action={createVariant} className="mt-2 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="productId" value={product.id} />
            <input name="name" required maxLength={80} placeholder="Nom du parfum (ex. Chocolat)" aria-label="Nom du parfum" className={inputCls} />
            <input name="salePrice" {...priceInputProps} placeholder="Prix (vide = prix du produit)" aria-label="Prix de vente du parfum" className={inputCls} />
            <input name="sku" placeholder="Référence (facultatif)" aria-label="Référence" className={inputCls} />
            <p className="text-xs text-slate-500 sm:col-span-3">La photo et la quantité s&apos;ajoutent ensuite sur la ligne du parfum.</p>
            <button type="submit" className={`${btnPrimary} sm:col-span-3 sm:justify-self-start`}>Ajouter le parfum</button>
          </ActionForm>
        </details>
      </section>
    </AdminShell>
  );
}
