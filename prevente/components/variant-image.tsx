"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/form";
import { btnGhost } from "@/components/ui";

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

/** Réduit la photo (max 1200 px, JPEG) avant l'envoi : rapide sur mobile et sous la limite du serveur. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  for (const [side, quality] of [[1200, 0.8], [1000, 0.65], [800, 0.55]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= 750_000) return blob;
  }
  throw new Error("Image trop lourde");
}

export default function VariantImage({
  variantId,
  hasImage,
  uploadAction,
  removeAction,
}: {
  variantId: string;
  hasImage: boolean;
  uploadAction: Action;
  removeAction: Action;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  function run(action: Action, build: () => Promise<FormData>) {
    setMessage({});
    startTransition(async () => {
      try {
        setMessage(await action({}, await build()));
      } catch {
        setMessage({ error: "Échec de l'envoi. Vérifiez la connexion et réessayez." });
      }
    });
  }

  function onPick(file: File | undefined) {
    if (!file) return;
    run(uploadAction, async () => {
      const fd = new FormData();
      fd.set("variantId", variantId);
      fd.set("image", await shrink(file), "photo.jpg");
      return fd;
    });
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0])} />
        <button type="button" disabled={pending} onClick={() => input.current?.click()} className={btnGhost}>
          {pending ? "Envoi…" : hasImage ? "Changer la photo" : "Ajouter une photo"}
        </button>
        {hasImage && (
          <button
            type="button" disabled={pending} className={btnGhost}
            onClick={() => run(removeAction, async () => { const fd = new FormData(); fd.set("id", variantId); return fd; })}
          >
            Retirer
          </button>
        )}
      </div>
      {message.error && <p role="alert" className="text-xs text-red-700">{message.error}</p>}
      {message.ok && <p role="status" className="text-xs text-emerald-800">{message.ok}</p>}
    </div>
  );
}
