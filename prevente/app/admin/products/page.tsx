import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import VariantImage from "@/components/variant-image";
import { SALE_UNITS, SALE_UNIT_LABEL, thumbUrl } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import {
  createProduct, createVariant, removeVariantImage, setProductActive, setVariantActive, setVariantImage, updateProduct, updateVariant,
} from "./actions";

export const metadata = { title: "Produits · Grossiste Pro" };

function ToggleForm({ action, id, active }: { action: typeof setProductActive; id: string; active: boolean }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <button type="submit" className={btnGhost}>{active ? "Désactiver" : "Réactiver"}</button>
    </ActionForm>
  );
}

export default async function Page() {
  await requireRole("admin");
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: { variants: { orderBy: { name: "asc" } } },
  });

  return (
    <AdminShell current="products" title="Produits et parfums">
      <section className={cardCls}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Nouveau produit</h2>
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
          <div className="sm:col-span-2">
            <label htmlFor="p-desc" className={labelCls}>Description (facultatif)</label>
            <input id="p-desc" name="description" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}>Ajouter le produit</button>
          </div>
        </ActionForm>
      </section>

      {products.length === 0 && <p className="text-sm text-slate-500">Aucun produit pour le moment.</p>}

      {products.map((p) => (
        <section key={p.id} className={`${cardCls} ${p.isActive ? "" : "opacity-70"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
              <p className="mt-1 flex flex-wrap gap-2">
                <span className={`${badgeCls} ${badgeTone.none}`}>{SALE_UNIT_LABEL[p.saleUnit]}</span>
                {!p.isActive && <span className={`${badgeCls} ${badgeTone.expired}`}>Désactivé</span>}
              </p>
              {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
            </div>
            <ToggleForm action={setProductActive} id={p.id} active={p.isActive} />
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-emerald-800">Modifier le produit</summary>
            <ActionForm action={updateProduct} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={p.id} />
              <input name="name" required maxLength={120} defaultValue={p.name} aria-label="Nom" className={inputCls} />
              <input name="description" defaultValue={p.description ?? ""} placeholder="Description" aria-label="Description" className={inputCls} />
              <p className="text-xs text-slate-500 sm:col-span-2">L&apos;unité ne peut pas être modifiée (le stock en dépend).</p>
              <button type="submit" className={btnGhost}>Enregistrer</button>
            </ActionForm>
          </details>

          <h3 className="mt-5 text-sm font-semibold text-slate-800">Parfums</h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {p.variants.length === 0 && <li className="py-2 text-sm text-slate-500">Aucun parfum : ajoutez-en un pour pouvoir mettre du stock.</li>}
            {p.variants.map((v) => (
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
                    <span className="font-medium text-slate-900">{v.name}</span>
                    {v.sku && <span className="ml-2 text-xs text-slate-500">réf. {v.sku}</span>}
                    {!v.isActive && <span className={`${badgeCls} ${badgeTone.expired} ml-2`}>Désactivé</span>}
                    </div>
                  </div>
                  <ToggleForm action={setVariantActive} id={v.id} active={v.isActive} />
                </div>
                <div className="mt-2">
                  <VariantImage variantId={v.id} hasImage={!!v.imageSecureUrl} uploadAction={setVariantImage} removeAction={removeVariantImage} />
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-emerald-800">Modifier</summary>
                  <ActionForm action={updateVariant} className="mt-2 grid gap-3 sm:grid-cols-3">
                    <input type="hidden" name="id" value={v.id} />
                    <input name="name" required maxLength={80} defaultValue={v.name} aria-label="Parfum" className={inputCls} />
                    <input name="sku" defaultValue={v.sku ?? ""} placeholder="Référence (facultatif)" aria-label="Référence" className={inputCls} />
                    <button type="submit" className={btnGhost}>Enregistrer</button>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>

          <ActionForm action={createVariant} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="productId" value={p.id} />
            <input name="name" required maxLength={80} placeholder="Nouveau parfum (ex. Chocolat)" aria-label="Nouveau parfum" className={inputCls} />
            <input name="sku" placeholder="Référence (facultatif)" aria-label="Référence" className={inputCls} />
            <button type="submit" className={btnPrimary}>Ajouter</button>
          </ActionForm>
        </section>
      ))}
    </AdminShell>
  );
}
