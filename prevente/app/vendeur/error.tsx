"use client";

import { useEffect } from "react";
import { btnPrimary } from "@/components/ui";

export default function VendeurError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-slate-600">
          La page n&apos;a pas pu être affichée. Vos données n&apos;ont pas été modifiées par cet affichage. Réessayez dans un instant.
        </p>
        {error.digest && <p className="mt-2 text-xs text-slate-400">Référence : {error.digest}</p>}
        <button type="button" onClick={() => retry()} className={`${btnPrimary} mt-4`}>Réessayer</button>
      </div>
    </div>
  );
}
