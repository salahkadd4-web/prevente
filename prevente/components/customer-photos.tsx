"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/form";
import { btnGhost } from "@/components/ui";
import { checkPickedImage, shrink } from "@/components/image-shrink";

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
type Photo = { id: string; thumbUrl: string; fullUrl: string };
type Staged = { key: number; blob: Blob; url: string };

/** Galerie des photos de la boutique : ajout multiple avec aperçu, retrait avec confirmation. */
export default function CustomerPhotos({
  customerId,
  photos,
  maxPhotos,
  addAction,
  removeAction,
}: {
  customerId: string;
  photos: Photo[];
  maxPhotos: number;
  addAction: Action;
  removeAction: Action;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [messages, setMessages] = useState<{ tone: "error" | "ok"; text: string }[]>([]);
  const [pending, startTransition] = useTransition();
  const room = maxPhotos - photos.length;

  useEffect(() => () => staged.forEach((s) => URL.revokeObjectURL(s.url)), [staged]);

  async function onPick(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (input.current) input.current.value = "";
    if (picked.length === 0) return;
    const problems: { tone: "error"; text: string }[] = [];
    const ready: Staged[] = [];
    for (const file of picked) {
      if (staged.length + ready.length >= room) {
        problems.push({ tone: "error", text: `Limite de ${maxPhotos} photos par boutique : « ${file.name} » ignorée.` });
        continue;
      }
      const problem = checkPickedImage(file);
      if (problem) { problems.push({ tone: "error", text: `${file.name} : ${problem}` }); continue; }
      try {
        const blob = await shrink(file);
        ready.push({ key: nextKey.current++, blob, url: URL.createObjectURL(blob) });
      } catch (e) {
        problems.push({ tone: "error", text: `${file.name} : ${e instanceof Error ? e.message : "image illisible."}` });
      }
    }
    setMessages(problems);
    setStaged((prev) => [...prev, ...ready]);
  }

  function sendAll() {
    const batch = staged;
    setMessages([]);
    startTransition(async () => {
      const remaining: Staged[] = [];
      const out: { tone: "error" | "ok"; text: string }[] = [];
      let sent = 0;
      for (const item of batch) {
        try {
          const fd = new FormData();
          fd.set("customerId", customerId);
          fd.set("image", item.blob, "photo.jpg");
          const r = await addAction({}, fd);
          if (r.error) { remaining.push(item); out.push({ tone: "error", text: r.error }); } else sent += 1;
        } catch {
          remaining.push(item);
          out.push({ tone: "error", text: "Échec de l'envoi d'une photo. Vérifiez la connexion." });
        }
      }
      if (sent > 0) out.unshift({ tone: "ok", text: `${sent} photo${sent > 1 ? "s" : ""} ajoutée${sent > 1 ? "s" : ""}.` });
      setStaged(remaining);
      setMessages(out);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!window.confirm("Retirer cette photo de la boutique ? Cette action est définitive.")) return;
    setMessages([]);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", id);
        const r = await removeAction({}, fd);
        setMessages([r.error ? { tone: "error", text: r.error } : { tone: "ok", text: r.ok ?? "Photo retirée." }]);
        router.refresh();
      } catch {
        setMessages([{ tone: "error", text: "Échec de la suppression. Réessayez." }]);
      }
    });
  }

  return (
    <div>
      {photos.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune photo de la boutique.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id} className="space-y-1">
              <a href={p.fullUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt="Photo de la boutique" className="aspect-square w-full rounded-xl object-cover ring-1 ring-slate-200" />
              </a>
              <button type="button" disabled={pending} onClick={() => remove(p.id)} className={`${btnGhost} w-full`}>Retirer</button>
            </li>
          ))}
        </ul>
      )}

      {staged.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800">{staged.length} photo{staged.length > 1 ? "s" : ""} prête{staged.length > 1 ? "s" : ""} à envoyer</p>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {staged.map((s) => (
              <li key={s.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt="Aperçu" className="aspect-square w-full rounded-lg object-cover" />
                <button
                  type="button" disabled={pending} aria-label="Ne pas envoyer cette photo"
                  onClick={() => setStaged((prev) => prev.filter((x) => x.key !== s.key))}
                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-white/90 text-xs font-bold text-slate-800 shadow"
                >×</button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={pending} onClick={sendAll} className={`${btnGhost} mt-3`}>
            {pending ? "Envoi en cours…" : `Envoyer ${staged.length} photo${staged.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      <div className="mt-4">
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onPick(e.target.files)} />
        <button type="button" disabled={pending || room - staged.length <= 0} onClick={() => input.current?.click()} className={btnGhost}>
          Ajouter des photos
        </button>
        <span className="ml-2 text-xs text-slate-500">{photos.length} / {maxPhotos}</span>
      </div>

      {messages.map((m, i) => (
        <p key={i} role={m.tone === "error" ? "alert" : "status"} className={`mt-2 text-xs ${m.tone === "error" ? "text-red-700" : "text-emerald-800"}`}>{m.text}</p>
      ))}
    </div>
  );
}
