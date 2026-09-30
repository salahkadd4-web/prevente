"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputCls } from "@/components/ui";

const DEBOUNCE_MS = 350;
const MAX_LEN = 80;

/**
 * Recherche en temps réel : après un court délai (debounce), met à jour le paramètre `q` de l'URL ;
 * la page serveur se re-rend alors sans rechargement complet (requête Prisma côté serveur, droits
 * vérifiés par la page). Les autres paramètres (filtres, tri) sont conservés, `page` est remis à 1.
 * Next.js n'applique que la navigation la plus récente : une réponse ancienne n'écrase pas la dernière.
 */
export default function LiveSearch({
  placeholder,
  label,
  id,
}: {
  placeholder: string;
  label: string;
  id: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef(urlQ);

  // Synchronise le champ quand l'URL change de l'extérieur (bouton « Réinitialiser », retour arrière).
  useEffect(() => {
    if (urlQ !== lastPushed.current) {
      lastPushed.current = urlQ;
      setValue(urlQ);
    }
  }, [urlQ]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function push(next: string) {
    const trimmed = next.trim().slice(0, MAX_LEN);
    if (trimmed === lastPushed.current) return;
    lastPushed.current = trimmed;
    const p = new URLSearchParams(params.toString());
    if (trimmed) p.set("q", trimmed); else p.delete("q");
    p.delete("page"); // nouvelle recherche : retour à la première page
    const qs = p.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), DEBOUNCE_MS);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setValue("");
    push("");
  }

  return (
    <div role="search" className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="search"
        value={value}
        maxLength={MAX_LEN}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); if (timer.current) clearTimeout(timer.current); push(value); }
          if (e.key === "Escape" && value) clear();
        }}
        className={`${inputCls} pr-20 [&::-webkit-search-cancel-button]:appearance-none`}
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        {pending && (
          <span role="status" aria-live="polite" className="flex items-center">
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700" />
            <span className="sr-only">Recherche en cours…</span>
          </span>
        )}
        {value && (
          <button type="button" onClick={clear} aria-label="Effacer la recherche" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40">
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
    </div>
  );
}
