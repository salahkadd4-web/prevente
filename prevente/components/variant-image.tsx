"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/form";
import { btnGhost } from "@/components/ui";
import { checkPickedImage, shrink } from "@/components/image-shrink";

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * Photo d'un parfum : choix du fichier → prévisualisation → confirmation de l'envoi.
 * Le remplacement et le retrait demandent confirmation ; en cas d'échec serveur,
 * l'ancienne photo reste en place.
 */
export default function VariantImage({
  variantId,
  hasImage,
  uploadAction,
  removeAction,
  idField = "variantId",
  removeConfirm = "Retirer la photo de ce parfum ?",
}: {
  /** Identifiant de l'élément photographié (parfum ou produit selon `idField`). */
  variantId: string;
  hasImage: boolean;
  uploadAction: Action;
  removeAction: Action;
  /** Nom du champ d'identifiant attendu par l'action d'envoi ("variantId" ou "productId"). */
  idField?: "variantId" | "productId";
  removeConfirm?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<ActionResult>({});
  const [staged, setStaged] = useState<{ blob: Blob; url: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => { if (staged) URL.revokeObjectURL(staged.url); }, [staged]);

  async function onPick(file: File | undefined) {
    if (input.current) input.current.value = "";
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

  function send() {
    if (!staged) return;
    const { blob } = staged;
    setMessage({});
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set(idField, variantId);
        fd.set("image", blob, "photo.jpg");
        const result = await uploadAction({}, fd);
        setMessage(result);
        if (!result.error) setStaged(null);
      } catch {
        setMessage({ error: "Échec de l'envoi. Vérifiez la connexion et réessayez." });
      }
    });
  }

  function remove() {
    if (!window.confirm(removeConfirm)) return;
    setMessage({});
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", variantId);
        setMessage(await removeAction({}, fd));
      } catch {
        setMessage({ error: "Échec de la suppression. Réessayez." });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {staged && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={staged.url} alt="Aperçu de la nouvelle photo" className="h-20 w-20 rounded-lg object-cover" />
          <div className="flex flex-col gap-1">
            <p className="text-xs text-slate-600">
              Aperçu — {hasImage ? "cette photo remplacera l'actuelle." : "pas encore enregistrée."}
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={send} className={btnGhost}>
                {pending ? "Envoi…" : "Enregistrer la photo"}
              </button>
              <button type="button" disabled={pending} onClick={() => setStaged(null)} className={btnGhost}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0])} />
        <button type="button" disabled={pending} onClick={() => input.current?.click()} className={btnGhost}>
          {hasImage ? "Changer la photo" : "Ajouter une photo"}
        </button>
        {hasImage && !staged && (
          <button type="button" disabled={pending} onClick={remove} className={btnGhost}>
            {pending ? "…" : "Retirer"}
          </button>
        )}
      </div>
      {message.error && <p role="alert" className="text-xs text-red-700">{message.error}</p>}
      {message.ok && <p role="status" className="text-xs text-emerald-800">{message.ok}</p>}
    </div>
  );
}
