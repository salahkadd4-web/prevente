"use client";

import Link from "next/link";
import { useState } from "react";
import ActionForm from "@/components/action-form";
import LiveSearch from "@/components/live-search";
import SubmitButton from "@/components/submit-button";
import { badgeCls, badgeTone, btnPrimary, cardCls } from "@/components/ui";
import { saveOrderDraft } from "@/app/vendeur/actions";
import { thumbUrl } from "@/lib/catalog";
import { formatMoney } from "@/lib/orders";

export type FormVariant = {
  id: string;
  name: string;
  /** Produit sans parfum : une seule ligne « technique » (le parfum « Sans parfum » n'est pas affiché). */
  isDefault: boolean;
  imageUrl: string | null;
  price: string | null;
  stock: number;
};
export type FormProduct = {
  id: string;
  name: string;
  unitLabel: string;
  imageUrl: string | null;
  variants: FormVariant[];
};

function Thumb({ url, size = 48 }: { url: string | null; size?: number }) {
  if (!url) {
    return (
      <span aria-hidden="true" style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
        —
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniature Cloudinary déjà optimisée
    <img src={thumbUrl(url, size * 2)} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} />
  );
}

/**
 * Saisie de commande. L'état des quantités vit ici (composant client) et n'est PAS réinitialisé
 * quand la recherche serveur change la liste affichée : un produit saisi puis masqué par une
 * recherche garde sa quantité. Seuls variantId + quantité sont envoyés ; prix, noms et unités
 * sont relus par le serveur. Les quantités sont aussi enregistrées en base à « Vérifier la
 * commande », d'où la récupération intacte au « Retour à la commande ».
 */
export default function OrderForm({
  dayId,
  customerId,
  products,
  initial,
  total,
  moreHref,
  readOnly,
}: {
  dayId: string;
  customerId: string;
  products: FormProduct[];
  initial: Record<string, number>;
  total: number;
  moreHref: string | null;
  readOnly: boolean;
}) {
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])),
  );

  const selected = Object.entries(qty)
    .map(([variantId, raw]) => ({ variantId, quantity: /^\d+$/.test(raw) ? Number(raw) : 0 }))
    .filter((l) => l.quantity > 0);
  // Total estimé : uniquement si le prix de chaque ligne sélectionnée est connu (les articles masqués par une recherche n'ont pas de prix ici).
  const priceOf = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, v.price === null ? null : Number(v.price)] as const)));
  const knownTotal = selected.every((l) => priceOf.get(l.variantId) != null)
    ? selected.reduce((sum, l) => sum + (priceOf.get(l.variantId) ?? 0) * l.quantity, 0)
    : null;
  const hasInvalid = Object.values(qty).some((raw) => raw.trim() !== "" && !/^\d+$/.test(raw.trim()));

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <LiveSearch id="p-q" label="Rechercher un produit ou un parfum" placeholder="Rechercher un produit ou un parfum" />
      </div>

      <ActionForm action={saveOrderDraft} className="space-y-4">
        <input type="hidden" name="dayId" value={dayId} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="lines" value={JSON.stringify(selected)} />

        {products.length === 0 ? (
          <p className={`${cardCls} text-sm text-slate-500`}>Aucun produit ne correspond à cette recherche.</p>
        ) : (
          <ul className="space-y-3">
            {products.map((p) => {
              const single = p.variants.length === 1 && p.variants[0].isDefault;
              return (
                <li key={p.id} className={cardCls}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Thumb url={p.imageUrl ?? (single ? p.variants[0].imageUrl : null)} />
                    <div className="min-w-0 flex-1 basis-32">
                      <p className="truncate font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.unitLabel}</p>
                    </div>
                    {single && <VariantInput v={p.variants[0]} unit={p.unitLabel} qty={qty} setQty={setQty} readOnly={readOnly} compact />}
                  </div>
                  {!single && (
                    <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                      {p.variants.map((v) => (
                        <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                          <Thumb url={v.imageUrl ?? p.imageUrl} size={40} />
                          <span className="min-w-0 flex-1 basis-24 truncate text-sm font-medium text-slate-800">{v.name}</span>
                          <VariantInput v={v} unit={p.unitLabel} qty={qty} setQty={setQty} readOnly={readOnly} compact />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {moreHref && (
          <div className="text-center">
            <Link href={moreHref} scroll={false} className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">
              Afficher plus de produits ({total - products.length} restants)
            </Link>
          </div>
        )}

        {!readOnly && (
          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-700" aria-live="polite">
                {selected.length} ligne{selected.length > 1 ? "s" : ""} sélectionnée{selected.length > 1 ? "s" : ""}
                {selected.length > 0 && knownTotal !== null && <span className="ml-2 font-semibold tabular-nums text-slate-900">· ≈ {formatMoney(knownTotal)}</span>}
                {hasInvalid && <span className="ml-2 text-red-700">· une quantité est invalide</span>}
              </p>
              <SubmitButton pendingLabel="Enregistrement…" className={`${btnPrimary} w-full sm:w-auto`}>Vérifier la commande</SubmitButton>
            </div>
          </div>
        )}
      </ActionForm>
    </div>
  );
}

function VariantInput({
  v, unit, qty, setQty, readOnly,
}: {
  v: FormVariant;
  unit: string;
  qty: Record<string, string>;
  setQty: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  readOnly: boolean;
  compact?: boolean;
}) {
  const value = qty[v.id] ?? "";
  const n = /^\d+$/.test(value) ? Number(value) : 0;
  const noPrice = v.price === null;
  // Rupture : on n'empêche pas de corriger une ligne déjà saisie, seulement d'en ajouter une nouvelle.
  const soldOut = v.stock <= 0 && n === 0;
  const disabled = readOnly || noPrice || soldOut;

  return (
    <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <div className="text-right text-xs leading-tight text-slate-600">
          {v.price !== null ? <span className="font-medium text-slate-900">{formatMoney(Number(v.price))}</span> : <span>—</span>}
          <span className="block">/ {unit.toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Retirer une unité — ${v.name}`}
            disabled={disabled || n <= 0}
            onClick={() => setQty((prev) => ({ ...prev, [v.id]: n - 1 <= 0 ? "" : String(n - 1) }))}
            className="flex h-12 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:opacity-40"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            aria-label={`Quantité — ${v.name}`}
            value={value}
            disabled={disabled}
            placeholder="0"
            onChange={(e) => setQty((prev) => ({ ...prev, [v.id]: e.target.value }))}
            className="block h-12 w-16 rounded-xl border border-slate-300 bg-white px-1 text-center text-base tabular-nums text-slate-900 [appearance:textfield] focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 disabled:bg-slate-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label={`Ajouter une unité — ${v.name}`}
            disabled={disabled}
            onClick={() => setQty((prev) => ({ ...prev, [v.id]: String(n + 1) }))}
            className="flex h-12 w-11 items-center justify-center rounded-xl border border-emerald-700 bg-emerald-700 text-xl font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
      {noPrice ? (
        <span className={`${badgeCls} ${badgeTone.expired}`}>Prix non défini</span>
      ) : v.stock <= 0 ? (
        <span className={`${badgeCls} ${badgeTone.expired}`}>Stock épuisé</span>
      ) : n > v.stock ? (
        <span className={`${badgeCls} ${badgeTone.soon}`}>Stock : {v.stock}</span>
      ) : null}
    </div>
  );
}
