"use client";

import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/form";
import { btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { checkPickedImage, shrink } from "@/components/image-shrink";
import PhotoSourceButtons from "@/components/photo-source-buttons";
import type { CreateProductResult } from "./actions";

const priceInputProps = { type: "text", inputMode: "decimal", pattern: "[0-9]+([.,][0-9]{1,2})?", title: "Nombre positif, 2 décimales maximum" } as const;

/**
 * Bouton « Ajouter un produit » + son formulaire. La photo est facultative : « Prendre une photo » (appareil photo
 * du téléphone) ou « Choisir une photo » (depuis l'appareil), puis aperçu avant l'enregistrement.
 * Après création, ouvre directement les détails du produit pour ajouter ses parfums et son stock.
 */
export default function NewProductForm({
  action,
  units,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<CreateProductResult>;
  units: { value: string; label: string }[];
}) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<ActionResult>({});
  const [staged, setStaged] = useState<{ blob: Blob; url: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => { if (staged) URL.revokeObjectURL(staged.url); }, [staged]);

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setMessage({});
    const problem = checkPickedImage(file);
    if (problem) return setMessage({ error: problem });
    try {
      const blob = await shrink(file);
      setStaged({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setMessage({ error: e instanceof Error ? e.message : "Image illisible." });
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (staged) fd.set("image", staged.blob, "photo.jpg");
    setMessage({});
    startTransition(async () => {
      try {
        const result = await action({}, fd);
        if (result.error) return setMessage(result);
        form.reset();
        setStaged(null);
        setOpen(false);
        router.push(result.id ? `/admin/products/${result.id}${result.photoFailed ? "?photo=failed" : ""}` : "/admin/products");
      } catch {
        setMessage({ error: "Échec de l'enregistrement. Vérifiez la connexion et réessayez." });
      }
    });
  }

  return (
    <div>
      <div className="flex justify-end">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)} className={btnPrimary}>
          {open ? "Fermer" : "+ Ajouter un produit"}
        </button>
      </div>

      <div id={panelId} hidden={!open} className="pt-4">
        <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <fieldset disabled={pending} className="contents">
            <div>
              <label htmlFor="np-name" className={labelCls}>Nom (ex. Biscuit)</label>
              <input id="np-name" name="name" required maxLength={120} className={inputCls} />
            </div>
            <div>
              <label htmlFor="np-unit" className={labelCls}>Unité de vente</label>
              <select id="np-unit" name="saleUnit" required defaultValue="" className={inputCls}>
                <option value="" disabled>Choisir…</option>
                {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="np-price" className={labelCls}>Prix de vente (facultatif)</label>
              <input id="np-price" name="salePrice" {...priceInputProps} placeholder="ex. 1250,50" className={inputCls} />
            </div>
            <div>
              <label htmlFor="np-desc" className={labelCls}>Description (facultatif)</label>
              <input id="np-desc" name="description" className={inputCls} />
            </div>

            <div className="sm:col-span-2">
              <span className={labelCls}>Photo du produit (facultatif)</span>
              <div className="flex flex-wrap items-center gap-3">
                {staged && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={staged.url} alt="Aperçu de la photo du produit" className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200" />
                )}
                <PhotoSourceButtons onPick={onPick} disabled={pending} />
                {staged && <button type="button" onClick={() => setStaged(null)} className={`${btnGhost} text-red-700`}>Retirer</button>}
              </div>
              <p className="mt-1 text-xs text-slate-500">Les parfums, leurs photos et le stock s&apos;ajoutent ensuite dans les détails du produit.</p>
            </div>

            <div className="sm:col-span-2">
              <button type="submit" className={btnPrimary}>{pending ? "Enregistrement…" : "Ajouter le produit"}</button>
            </div>
          </fieldset>
          {message.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200 sm:col-span-2">{message.error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
