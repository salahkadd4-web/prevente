"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import ProductThumb from "@/components/product-thumb";
import PhotoSourceButtons from "@/components/photo-source-buttons";
import { checkPickedImage, shrink } from "@/components/image-shrink";
import { badgeCls, badgeTone, btnGhost, btnPrimary, inputCls, labelCls, summaryCls } from "@/components/ui";
import type { ActionResult } from "@/lib/form";
import { parseMoney } from "@/lib/money";
import { formatMoney } from "@/lib/orders";
import { removeProductImage, removeVariantImage, saveProduct, setProductImage, setVariantImage } from "./actions";

const priceInputProps = { type: "text", inputMode: "decimal", pattern: "[0-9]+([.,][0-9]{1,2})?", title: "Nombre positif, 2 décimales maximum" } as const;
const qtyInputProps = { type: "number", inputMode: "numeric", min: 0, max: 1000000, step: 1 } as const;

export type EditorFlavor = {
  id: string;
  name: string;
  salePrice: string;
  quantity: number;
  imageUrl: string | null;
  isActive: boolean;
  /** Parfum « Sans parfum » d'un ancien produit : son nom n'est pas modifiable. */
  technical: boolean;
};

export type EditorProduct = {
  id: string;
  name: string;
  saleUnit: string;
  salePrice: string;
  description: string;
  imageUrl: string | null;
  /** Stock du produit sans parfum (parfum technique « Sans parfum »). */
  quantity: number;
  flavors: EditorFlavor[];
};

/** Photo : celle déjà enregistrée, une nouvelle à envoyer, ou retirée. */
type Photo = { saved: string | null; staged: { blob: Blob; url: string } | null; removed: boolean };
type FlavorValues = { name: string; price: string; qty: string; isActive: boolean; photo: Photo };
type Row = {
  key: string;
  id?: string;
  technical: boolean;
  initialQty: number;
  saved: FlavorValues | null; // null = parfum jamais enregistré
  draft: FlavorValues | null; // non null = formulaire du parfum ouvert
  error?: string;
};

const photoOf = (url: string | null): Photo => ({ saved: url, staged: null, removed: false });
const shownUrl = (p: Photo) => p.staged?.url ?? (p.removed ? null : p.saved);
const toQty = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) <= 1000000 ? Number(s) : null);

/**
 * Formulaire produit unique : ajout (« Ajouter un produit ») et modification (« Détails »).
 * Infos du produit + photo, puis une ligne par parfum (photo, nom, prix, quantité) ;
 * « Modifier le parfum » rouvre sa ligne. Tout est enregistré d'un coup, puis les photos sont envoyées.
 */
export default function ProductEditor({
  product,
  units,
  onSaved,
}: {
  product?: EditorProduct;
  units: { value: string; label: string }[];
  /** Mode ajout : appelé après l'enregistrement, avec le message à afficher. */
  onSaved?: (message: ActionResult) => void;
}) {
  const router = useRouter();
  const uid = useId();
  const editing = !!product;
  const [name, setName] = useState(product?.name ?? "");
  const [unit, setUnit] = useState(product?.saleUnit ?? "");
  const [price, setPrice] = useState(product?.salePrice ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [qty, setQty] = useState(String(product?.quantity ?? 0));
  const [photo, setPhoto] = useState<Photo>(photoOf(product?.imageUrl ?? null));
  const [rows, setRows] = useState<Row[]>(() =>
    (product?.flavors ?? []).map((f) => {
      const values = { name: f.name, price: f.salePrice, qty: String(f.quantity), isActive: f.isActive, photo: photoOf(f.imageUrl) };
      return { key: f.id, id: f.id, technical: f.technical, initialQty: f.quantity, saved: values, draft: null };
    }),
  );
  const [message, setMessage] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const nextKey = useRef(0);

  // Libère les aperçus locaux (URL blob) à la fermeture du formulaire.
  const blobUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = blobUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  async function stage(files: FileList | null): Promise<Photo["staged"] | string> {
    const file = files?.[0];
    if (!file) return "";
    const problem = checkPickedImage(file);
    if (problem) return problem;
    try {
      const blob = await shrink(file);
      const url = URL.createObjectURL(blob);
      blobUrls.current.add(url);
      return { blob, url };
    } catch (e) {
      return e instanceof Error ? e.message : "Image illisible.";
    }
  }

  const unitLabel = (units.find((u) => u.value === unit)?.label ?? "").toLowerCase();
  const productPrice = parseMoney(price, "Prix");
  const productPriceText = "value" in productPrice && productPrice.value !== null ? formatMoney(Number(productPrice.value)) : null;

  function updateRow(key: string, change: (r: Row) => Row) {
    setRows((all) => all.map((r) => (r.key === key ? change(r) : r)));
  }

  function validate(values: FlavorValues, row: Row, all: Row[]): string | null {
    const n = values.name.trim();
    if (!n || n.length > 80) return "Nom du parfum obligatoire (80 caractères max).";
    if (!row.technical && n.toLowerCase() === "sans parfum") return "« Sans parfum » est réservé : choisissez un autre nom.";
    const taken = all.some((o) => o.key !== row.key && (o.draft ?? o.saved)?.name.trim().toLowerCase() === n.toLowerCase());
    if (taken) return `Un autre parfum s'appelle déjà « ${n} ».`;
    const p = parseMoney(values.price, "Prix du parfum");
    if ("error" in p) return p.error;
    if (toQty(values.qty) === null) return "Quantité : nombre entier de 0 à 1 000 000.";
    return null;
  }

  function addFlavor() {
    const key = `new-${nextKey.current++}`;
    const empty = { name: "", price: "", qty: "0", isActive: true, photo: photoOf(null) };
    setRows((all) => [...all, { key, technical: false, initialQty: 0, saved: null, draft: empty }]);
  }

  function saveFlavor(key: string) {
    setRows((all) =>
      all.map((r) => {
        if (r.key !== key || !r.draft) return r;
        const error = validate(r.draft, r, all);
        return error ? { ...r, error } : { ...r, saved: { ...r.draft, name: r.draft.name.trim() }, draft: null, error: undefined };
      }),
    );
  }

  function cancelFlavor(key: string) {
    setRows((all) => all.flatMap((r) => (r.key !== key ? [r] : r.saved ? [{ ...r, draft: null, error: undefined }] : [])));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage({});

    // Un parfum encore ouvert est enregistré avec le produit, s'il est valide.
    let invalid = false;
    const final = rows.map((r) => {
      if (!r.draft) return r;
      const error = validate(r.draft, r, rows);
      if (error) {
        invalid = true;
        return { ...r, error };
      }
      return { ...r, saved: { ...r.draft, name: r.draft.name.trim() }, draft: null, error: undefined };
    });
    setRows(final);
    if (invalid) return setMessage({ error: "Corrigez le parfum signalé avant d'enregistrer." });
    const productQty = final.length === 0 ? toQty(qty) : 0;
    if (productQty === null) return setMessage({ error: "Quantité : nombre entier de 0 à 1 000 000." });

    startTransition(async () => {
      try {
        const result = await saveProduct({
          id: product?.id,
          name,
          saleUnit: unit,
          salePrice: price,
          description,
          quantity: final.length === 0 ? productQty : 0,
          initialQuantity: final.length === 0 ? (product?.quantity ?? 0) : 0,
          flavors: final.map((r) => ({
            key: r.key,
            id: r.id,
            name: r.saved!.name,
            salePrice: r.saved!.price,
            isActive: r.saved!.isActive,
            quantity: toQty(r.saved!.qty) ?? r.initialQty,
            initialQuantity: r.initialQty,
          })),
        });
        if (result.error || !result.id) return setMessage({ error: result.error ?? "Enregistrement impossible. Réessayez." });

        // Photos : envoyées une par une (limite de taille du serveur), après l'enregistrement du produit.
        const failed: string[] = [];
        const send = async (label: string, run: () => Promise<ActionResult>) => {
          try {
            const r = await run();
            if (r.error) failed.push(label);
          } catch {
            failed.push(label);
          }
        };
        const productId = result.id;
        if (photo.staged) {
          const blob = photo.staged.blob;
          await send(name.trim(), () => setProductImage({}, form({ productId, image: blob })));
        } else if (photo.removed && photo.saved) {
          await send(name.trim(), () => removeProductImage({}, form({ id: productId })));
        }
        for (const r of final) {
          const variantId = result.variantIds?.[r.key];
          const p = r.saved!.photo;
          if (!variantId) continue;
          if (p.staged) {
            const blob = p.staged.blob;
            await send(r.saved!.name, () => setVariantImage({}, form({ variantId, image: blob })));
          } else if (p.removed && p.saved) {
            await send(r.saved!.name, () => removeVariantImage({}, form({ id: variantId })));
          }
        }

        const photoNote = failed.length > 0 ? ` Photo non enregistrée pour : ${failed.join(", ")}. Réessayez depuis « Détails ».` : "";
        if (editing) {
          router.replace(`/admin/products/${productId}?saved=${failed.length > 0 ? "photo-failed" : "1"}`, { scroll: false });
        } else {
          onSaved?.(failed.length > 0 ? { error: `Produit ajouté.${photoNote}` } : { ok: result.ok ?? "Produit ajouté." });
          router.refresh();
        }
      } catch {
        setMessage({ error: "Échec de l'enregistrement. Vérifiez la connexion et réessayez." });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset disabled={pending} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-name`} className={labelCls}>Nom (ex. Biscuit)</label>
            <input id={`${uid}-name`} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor={`${uid}-unit`} className={labelCls}>Unité de vente</label>
            <select id={`${uid}-unit`} required disabled={editing} value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
              <option value="" disabled>Choisir…</option>
              {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            {editing && <p className="mt-1 text-xs text-slate-500">L&apos;unité ne peut pas être modifiée (le stock en dépend).</p>}
          </div>
          <div>
            <label htmlFor={`${uid}-price`} className={labelCls}>Prix de vente (facultatif)</label>
            <input id={`${uid}-price`} {...priceInputProps} placeholder="ex. 1250,50" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor={`${uid}-desc`} className={labelCls}>Description (facultatif)</label>
            <input id={`${uid}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          </div>
          {rows.length === 0 && (
            <div>
              <label htmlFor={`${uid}-qty`} className={labelCls}>Quantité en stock{unitLabel && ` (${unitLabel})`}</label>
              <input id={`${uid}-qty`} {...qtyInputProps} required value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
            </div>
          )}
          <div className="sm:col-span-2">
            <span className={labelCls}>Photo du produit (facultatif)</span>
            <PhotoField
              photo={photo}
              alt={`Photo : ${name || "produit"}`}
              size={16}
              stage={stage}
              onChange={setPhoto}
              onError={(error) => setMessage({ error })}
              disabled={pending}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900">Parfums</h2>
          {rows.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600">Aucun parfum : la quantité ci-dessus est celle du produit.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {rows.map((r) =>
                r.draft ? (
                  <FlavorForm
                    key={r.key}
                    row={r}
                    values={r.draft}
                    unitLabel={unitLabel}
                    productPriceText={productPriceText}
                    stage={stage}
                    disabled={pending}
                    onChange={(draft) => updateRow(r.key, (x) => ({ ...x, draft }))}
                    onError={(error) => updateRow(r.key, (x) => ({ ...x, error }))}
                    onSave={() => saveFlavor(r.key)}
                    onCancel={() => cancelFlavor(r.key)}
                  />
                ) : (
                  <li key={r.key} className={`flex items-center gap-3 px-3 py-3 ${r.saved!.isActive ? "" : "opacity-70"}`}>
                    <Thumb photo={r.saved!.photo} alt={`Photo : ${r.saved!.name}`} size={12} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{r.saved!.name}</p>
                      <FlavorPrice price={r.saved!.price} productPriceText={productPriceText} />
                      <p className="text-sm text-slate-600">{r.saved!.qty} {unitLabel}</p>
                      {!r.saved!.isActive && <span className={`${badgeCls} ${badgeTone.none} mt-1`}>Désactivé</span>}
                    </div>
                    <button type="button" onClick={() => updateRow(r.key, (x) => ({ ...x, draft: x.saved }))} className={`${btnGhost} shrink-0`}>
                      Modifier le parfum
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
          <button type="button" onClick={addFlavor} className={`${summaryCls} mt-2`}>
            <span aria-hidden="true">+</span> Ajouter un parfum
          </button>
        </div>

        <div>
          <button type="submit" className={btnPrimary}>
            {pending ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Ajouter le produit"}
          </button>
        </div>
      </fieldset>
      {message.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">{message.error}</p>
      )}
    </form>
  );
}

/** Ligne d'un parfum ouverte : photo, nom, prix, quantité (et actif / désactivé pour un parfum existant). */
function FlavorForm({
  row,
  values,
  unitLabel,
  productPriceText,
  stage,
  disabled,
  onChange,
  onError,
  onSave,
  onCancel,
}: {
  row: Row;
  values: FlavorValues;
  unitLabel: string;
  productPriceText: string | null;
  stage: (files: FileList | null) => Promise<Photo["staged"] | string>;
  disabled: boolean;
  onChange: (values: FlavorValues) => void;
  onError: (error: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const id = `fl-${row.key}`;
  const set = (patch: Partial<FlavorValues>) => onChange({ ...values, ...patch });
  // Entrée dans un champ du parfum : enregistre le parfum, pas tout le produit.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    }
  };
  return (
    <li className="bg-slate-50 px-3 py-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_9rem]">
        <div>
          <label htmlFor={`${id}-name`} className={labelCls}>Nom du parfum</label>
          <input
            id={`${id}-name`}
            maxLength={80}
            autoFocus={!row.saved}
            readOnly={row.technical}
            placeholder="ex. Chocolat"
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            onKeyDown={onKeyDown}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`${id}-price`} className={labelCls}>Prix</label>
          <input
            id={`${id}-price`}
            {...priceInputProps}
            placeholder={productPriceText ? `${productPriceText}` : "Prix du produit"}
            value={values.price}
            onChange={(e) => set({ price: e.target.value })}
            onKeyDown={onKeyDown}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`${id}-qty`} className={labelCls}>Quantité{unitLabel && ` (${unitLabel})`}</label>
          <input id={`${id}-qty`} {...qtyInputProps} value={values.qty} onChange={(e) => set({ qty: e.target.value })} onKeyDown={onKeyDown} className={inputCls} />
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Prix vide = prix du produit.</p>

      <div className="mt-3">
        <span className={labelCls}>Photo du parfum (facultatif)</span>
        <PhotoField photo={values.photo} alt={`Photo : ${values.name || "parfum"}`} size={12} stage={stage} onChange={(photo) => set({ photo })} onError={onError} disabled={disabled} />
      </div>

      {row.id && (
        <label className="mt-3 flex min-h-10 items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={values.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4 accent-emerald-700" />
          Parfum actif (proposé à la vente)
        </label>
      )}

      {row.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">{row.error}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onSave} className={btnPrimary}>Enregistrer le parfum</button>
        <button type="button" onClick={onCancel} className={`${btnGhost} h-12`}>{row.saved ? "Annuler" : "Retirer ce parfum"}</button>
      </div>
    </li>
  );
}

/** Aperçu + « Prendre une photo » / « Choisir une photo » + « Retirer ». */
function PhotoField({
  photo,
  alt,
  size,
  stage,
  onChange,
  onError,
  disabled,
}: {
  photo: Photo;
  alt: string;
  size: 12 | 16;
  stage: (files: FileList | null) => Promise<Photo["staged"] | string>;
  onChange: (photo: Photo) => void;
  onError: (error: string) => void;
  disabled: boolean;
}) {
  async function onPick(files: FileList | null) {
    const staged = await stage(files);
    if (typeof staged === "string") {
      if (staged) onError(staged);
      return;
    }
    onChange({ ...photo, staged, removed: false });
  }
  const url = shownUrl(photo);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {url && <Thumb photo={photo} alt={alt} size={size} />}
      <PhotoSourceButtons onPick={onPick} disabled={disabled} />
      {url && (
        <button type="button" disabled={disabled} onClick={() => onChange({ ...photo, staged: null, removed: true })} className={`${btnGhost} text-red-700`}>
          Retirer
        </button>
      )}
    </div>
  );
}

/** Vignette : aperçu local d'une nouvelle photo, sinon miniature Cloudinary. */
function Thumb({ photo, alt, size }: { photo: Photo; alt: string; size: 12 | 16 }) {
  if (photo.staged) {
    const cls = size === 16 ? "h-16 w-16" : "h-12 w-12";
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo.staged.url} alt={alt} className={`${cls} shrink-0 rounded-lg object-cover ring-1 ring-slate-200`} />;
  }
  return <ProductThumb url={shownUrl(photo)} alt={alt} size={size} />;
}

function FlavorPrice({ price, productPriceText }: { price: string; productPriceText: string | null }) {
  const p = parseMoney(price, "Prix");
  if ("value" in p && p.value !== null) return <p className="text-sm text-slate-600">{formatMoney(Number(p.value))}</p>;
  if (productPriceText) return <p className="text-sm text-slate-600">{productPriceText} <span className="text-slate-500">(prix du produit)</span></p>;
  return <p className="text-sm font-medium text-amber-800">Prix à définir</p>;
}

function form(fields: Record<string, string | Blob>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) fd.set(k, v, "photo.jpg");
    else fd.set(k, v);
  }
  return fd;
}
