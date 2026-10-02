"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/form";
import { btnGhost, btnPrimary } from "@/components/ui";
import { checkPickedImage, shrink } from "@/components/image-shrink";
import PhotoSourceButtons, { CameraIcon } from "@/components/photo-source-buttons";
import ProductThumb, { THUMB_SIZE, type ThumbSize } from "@/components/product-thumb";

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * Photo d'un parfum ou d'un produit, modifiable depuis sa vignette : un appui ouvre un petit panneau
 * (prendre une photo / choisir une photo / retirer) → aperçu → confirmation de l'envoi.
 * Le remplacement et le retrait demandent confirmation ; en cas d'échec serveur, l'ancienne photo reste en place.
 */
export default function VariantImage({
  variantId,
  label,
  imageUrl,
  hasImage,
  size,
  uploadAction,
  removeAction,
  idField = "variantId",
  removeConfirm = "Retirer la photo de ce parfum ?",
}: {
  /** Identifiant de l'élément photographié (parfum ou produit selon `idField`). */
  variantId: string;
  /** Nom de l'élément, pour le nom accessible du bouton (ex. « Biscuit — Chocolat »). */
  label: string;
  /** Photo affichée dans la vignette (peut venir du produit quand le parfum n'a pas la sienne). */
  imageUrl: string | null;
  /** L'élément a SA propre photo (le retrait n'est proposé que dans ce cas). */
  hasImage: boolean;
  size: ThumbSize;
  uploadAction: Action;
  removeAction: Action;
  /** Nom du champ d'identifiant attendu par l'action d'envoi ("variantId" ou "productId"). */
  idField?: "variantId" | "productId";
  removeConfirm?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<ActionResult>({});
  const [staged, setStaged] = useState<{ blob: Blob; url: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => { if (staged) URL.revokeObjectURL(staged.url); }, [staged]);

  // Fermeture au clic en dehors et à Échap (sauf pendant un envoi).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!pending && !root.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  });

  function close() {
    setOpen(false);
    setStaged(null);
    setMessage({});
  }

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
        if (result.error) setMessage(result);
        else close(); // la nouvelle vignette suffit comme confirmation
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
        const result = await removeAction({}, fd);
        if (result.error) setMessage(result);
        else close();
      } catch {
        setMessage({ error: "Échec de la suppression. Réessayez." });
      }
    });
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${imageUrl ? "Changer la photo" : "Ajouter une photo"} : ${label}`}
        onClick={() => (open ? close() : setOpen(true))}
        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40"
      >
        {imageUrl ? (
          <ProductThumb url={imageUrl} size={size} />
        ) : (
          <span className={`${THUMB_SIZE[size]} flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100`}>
            <CameraIcon />
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} className="absolute left-0 z-10 mt-1 w-64 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="truncate text-sm font-medium text-slate-800">{label}</p>
          {staged ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={staged.url} alt="Aperçu de la nouvelle photo" className="aspect-square w-full rounded-lg object-cover" />
              <p className="text-xs text-slate-600">{hasImage ? "Cette photo remplacera l'actuelle." : "Pas encore enregistrée."}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={pending} onClick={() => setStaged(null)} className={btnGhost}>Annuler</button>
                <button type="button" disabled={pending} onClick={send} className={`${btnPrimary} h-10 px-3 text-sm`}>
                  {pending ? "Envoi…" : "Enregistrer"}
                </button>
              </div>
            </>
          ) : (
            <>
              <PhotoSourceButtons onPick={onPick} disabled={pending} className="grid gap-2" />
              {hasImage && (
                <button type="button" disabled={pending} onClick={remove} className={`${btnGhost} w-full text-red-700`}>
                  {pending ? "…" : "Retirer la photo"}
                </button>
              )}
            </>
          )}
          {message.error && <p role="alert" className="text-xs text-red-700">{message.error}</p>}
        </div>
      )}
    </div>
  );
}
