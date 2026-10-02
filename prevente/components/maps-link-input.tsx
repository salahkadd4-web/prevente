"use client";

import { useRef, useState } from "react";
import { inputCls } from "@/components/ui";

type Status = { tone: "ok" | "error" | "busy"; text: string } | null;

const GEO_ERROR: Record<number, string> = {
  1: "Localisation refusée : autorisez-la pour cette application dans les réglages du téléphone.",
  2: "Position introuvable : activez la localisation (GPS) et réessayez.",
  3: "La localisation a mis trop de temps : réessayez à l'extérieur ou près d'une fenêtre.",
};

/**
 * Champ « Lien Google Maps » avec un bouton « Ma position » : remplit le lien avec la position GPS actuelle
 * (à utiliser devant la boutique). Le lien reste modifiable à la main ; le serveur le valide comme avant.
 */
export default function MapsLinkInput({ id, defaultValue }: { id: string; defaultValue: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);

  function locate() {
    if (!("geolocation" in navigator)) return setStatus({ tone: "error", text: "Localisation non disponible sur cet appareil." });
    setStatus({ tone: "busy", text: "Recherche de la position…" });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (input.current) input.current.value = `https://www.google.com/maps?q=${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`;
        setStatus({ tone: "ok", text: `Position ajoutée (précision ± ${Math.round(coords.accuracy)} m).` });
      },
      (e) => setStatus({ tone: "error", text: GEO_ERROR[e.code] ?? "Localisation impossible. Réessayez." }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  return (
    <>
      <div className="relative">
        <input
          ref={input} id={id} name="googleMapsUrl" type="url" inputMode="url" placeholder="https://maps.app.goo.gl/…"
          defaultValue={defaultValue} aria-describedby={`${id}-status`} className={`${inputCls} pr-36`}
        />
        <button
          type="button"
          onClick={locate}
          disabled={status?.tone === "busy"}
          className="absolute inset-y-1 right-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 disabled:opacity-60"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
            <path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {status?.tone === "busy" ? "Recherche…" : "Ma position"}
        </button>
      </div>
      <p id={`${id}-status`} role={status?.tone === "error" ? "alert" : "status"} className={`mt-1 text-xs ${status?.tone === "error" ? "text-red-700" : status?.tone === "ok" ? "text-emerald-800" : "text-slate-500"}`}>
        {status?.text ?? "Devant la boutique : « Ma position » remplit le lien automatiquement."}
      </p>
    </>
  );
}
