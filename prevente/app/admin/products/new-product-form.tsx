"use client";

import { useId, useState } from "react";
import type { ActionResult } from "@/lib/form";
import { alertCls, btnPrimary } from "@/components/ui";
import ProductEditor from "./product-editor";

/**
 * Bouton « Ajouter un produit » + son formulaire : infos du produit, photo et parfums (photo, nom, prix, quantité).
 * Après l'ajout, le formulaire se referme et le produit apparaît dans la table.
 */
export default function NewProductForm({ units }: { units: { value: string; label: string }[] }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0); // nouveau formulaire vide après chaque ajout
  const [notice, setNotice] = useState<ActionResult>({});

  return (
    <div>
      <div className="flex justify-end">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((v) => !v);
            setNotice({});
          }}
          className={btnPrimary}
        >
          {open ? "Fermer" : "+ Ajouter un produit"}
        </button>
      </div>

      {(notice.ok || notice.error) && (
        <p role="status" className={`mt-4 ${notice.error ? alertCls.warn : alertCls.info}`}>{notice.error ?? notice.ok}</p>
      )}

      <div id={panelId} hidden={!open} className="pt-4">
        <div className="rounded-xl border border-slate-200 p-4">
          <ProductEditor
            key={round}
            units={units}
            onSaved={(result) => {
              setNotice(result);
              setOpen(false);
              setRound((r) => r + 1);
            }}
          />
        </div>
      </div>
    </div>
  );
}
