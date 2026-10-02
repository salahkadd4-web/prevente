"use client";

import { useRef } from "react";
import { btnGhost } from "@/components/ui";

/**
 * Deux sources pour une photo : l'appareil photo ou les photos déjà sur l'appareil.
 * Dans l'application Android (WebView Capacitor), seul un champ avec `capture` ouvre l'appareil photo :
 * sans lui, on n'obtient que le sélecteur de fichiers. « Prendre une photo » n'apparaît que sur un écran
 * tactile (téléphone, tablette) ; sur ordinateur, `capture` est ignoré et le bouton ferait doublon.
 */
export default function PhotoSourceButtons({
  onPick,
  multiple = false,
  disabled = false,
  className = "flex flex-wrap gap-2",
}: {
  onPick: (files: FileList | null) => void;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  function picked(input: HTMLInputElement) {
    onPick(input.files);
    input.value = ""; // permet de reprendre la même photo après une annulation
  }

  return (
    <div className={className}>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => picked(e.currentTarget)} />
      <input ref={gallery} type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => picked(e.currentTarget)} />
      <button type="button" disabled={disabled} onClick={() => camera.current?.click()} className={`${btnGhost} hidden items-center justify-center gap-2 pointer-coarse:inline-flex`}>
        <CameraIcon /> Prendre une photo
      </button>
      <button type="button" disabled={disabled} onClick={() => gallery.current?.click()} className={`${btnGhost} inline-flex items-center justify-center gap-2`}>
        <GalleryIcon /> {multiple ? "Choisir des photos" : "Choisir une photo"}
      </button>
    </div>
  );
}

export function CameraIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M20 16l-5-5-8 8" />
    </svg>
  );
}
