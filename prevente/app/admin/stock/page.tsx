import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { SALE_UNIT_LABEL } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { expiryInfo, formatDate } from "@/lib/stock/expiry";
import { correctLotQuantity, createLot } from "./actions";

export const metadata = { title: "Stock · Grossiste Pro" };

export default async function Page() {
  await requireRole("admin");

  const [variants, lots] = await Promise.all([
    prisma.productVariant.findMany({
      where: { isActive: true, product: { isActive: true } },
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
    }),
    // Ordre FEFO : expiration la plus proche d'abord, puis réception la plus ancienne.
    prisma.stockLot.findMany({
      include: { variant: { include: { product: true } } },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
      take: 200,
    }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AdminShell current="stock" title="Stock par lot">
      <section className={cardCls}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Réception d&apos;un lot</h2>
        {variants.length === 0 ? (
          <p className="text-sm text-slate-600">Ajoutez d&apos;abord un produit avec au moins un parfum (page Produits).</p>
        ) : (
          <ActionForm action={createLot} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="l-variant" className={labelCls}>Produit et parfum</label>
              <select id="l-variant" name="variantId" required defaultValue="" className={inputCls}>
                <option value="" disabled>Choisir…</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.product.name} — {v.name} ({SALE_UNIT_LABEL[v.product.saleUnit]})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="l-qty" className={labelCls}>Quantité reçue</label>
              <input id="l-qty" name="quantity" type="number" inputMode="numeric" min={1} step={1} required className={inputCls} />
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
              <input id="l-rec" name="receivedAt" type="date" defaultValue={today} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className={btnPrimary}>Ajouter au stock</button>
            </div>
          </ActionForm>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Lots en stock</h2>
        <p className="mt-1 text-sm text-slate-600">
          Classés par expiration la plus proche. Signalement à partir de 3 mois avant la date.
        </p>
        {lots.length === 0 && <p className="mt-4 text-sm text-slate-500">Aucun lot pour le moment.</p>}
        <ul className="mt-2 divide-y divide-slate-100">
          {lots.map((lot) => {
            const info = expiryInfo(lot.expiresAt);
            const unit = SALE_UNIT_LABEL[lot.variant.product.saleUnit].toLowerCase();
            const empty = lot.availableQuantity === 0;
            return (
              <li key={lot.id} className={`py-3 ${empty ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {lot.variant.product.name} — {lot.variant.name}
                    </p>
                    <p className="text-sm text-slate-600">
                      {lot.availableQuantity} / {lot.initialQuantity} {unit}
                      {lot.lotNumber && ` · lot ${lot.lotNumber}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-800">{formatDate(lot.expiresAt)}</p>
                    {!empty && <span className={`${badgeCls} ${badgeTone[info.tone]}`}>{info.label}</span>}
                    {empty && <span className={`${badgeCls} ${badgeTone.none}`}>Épuisé</span>}
                  </div>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-emerald-800">Corriger la quantité</summary>
                  <ActionForm action={correctLotQuantity} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={lot.id} />
                    <input
                      name="quantity" type="number" inputMode="numeric" min={0} max={lot.initialQuantity} step={1}
                      defaultValue={lot.availableQuantity} aria-label="Quantité disponible" required
                      className={`${inputCls} max-w-40`}
                    />
                    <button type="submit" className={btnGhost}>Enregistrer</button>
                  </ActionForm>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </AdminShell>
  );
}
