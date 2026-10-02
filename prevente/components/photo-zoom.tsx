"use client";

import { useRef } from "react";
import { btnGhost } from "@/components/ui";
import { photoUrl } from "@/lib/catalog";

/**
 * Vignette cliquable qui ouvre la photo en grand (fenêtre native <dialog> : Échap, bouton Retour Android
 * et appui en dehors de la photo la ferment). `children` = la vignette affichée dans la liste.
 */
export default function PhotoZoom({ url, label, children }: { url: string | null; label: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  if (!url) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        aria-label={`Agrandir la photo : ${label}`}
        onClick={() => dialog.current?.showModal()}
        className="block shrink-0 cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40"
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        aria-label={label}
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
        className="m-auto max-h-none max-w-none bg-transparent p-4 backdrop:bg-slate-950/85"
      >
        <figure className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- photo Cloudinary redimensionnée */}
          <img src={photoUrl(url)} alt={label} className="max-h-[75dvh] w-auto max-w-[calc(100vw-2rem)] rounded-2xl bg-white object-contain" />
          <figcaption className="flex items-center gap-3 text-base font-semibold text-white">
            {label}
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className={btnGhost}>Fermer</button>
          </figcaption>
        </figure>
      </dialog>
    </>
  );
}
