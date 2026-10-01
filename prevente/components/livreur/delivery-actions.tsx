"use client";

import ActionForm from "@/components/action-form";
import CollapsibleSection from "@/components/collapsible-section";
import ConfirmButton from "@/components/confirm-button";
import SubmitButton from "@/components/submit-button";
import { btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { confirmDelivery, failDelivery, refreshOrders, startDelivery } from "@/app/livreur/actions";
import { FAILURE_REASONS, FAILURE_REASON_LABEL, MAX_FAILURE_COMMENT } from "@/lib/livreur/rules";

/** « Commencer la livraison » : l'éligibilité est revérifiée par le serveur à chaque envoi. */
export function StartDeliveryForm({ orderId, retry = false, compact = false }: { orderId: string; retry?: boolean; compact?: boolean }) {
  return (
    <ActionForm action={startDelivery}>
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton
        pendingLabel="Démarrage…"
        className={`${compact ? `${btnGhost} h-12 w-full sm:w-auto` : `${btnPrimary} w-full sm:w-auto`}`}
      >
        {retry ? "Reprendre la livraison" : "Commencer la livraison"}
      </SubmitButton>
    </ActionForm>
  );
}

/** « Confirmer la livraison » avec confirmation explicite. */
export function ConfirmDeliveryForm({ orderId, total }: { orderId: string; total: string }) {
  return (
    <ActionForm action={confirmDelivery}>
      <input type="hidden" name="orderId" value={orderId} />
      <ConfirmButton
        message={`Confirmer que cette commande (${total}) a bien été livrée au client ? Cette action est définitive.`}
        className={`${btnPrimary} w-full sm:w-auto`}
      >
        Confirmer la livraison
      </ConfirmButton>
    </ActionForm>
  );
}

/** « Livraison non effectuée » : motif obligatoire (choix simples), commentaire (obligatoire pour « Autre »). */
export function FailDeliveryForm({ orderId }: { orderId: string }) {
  return (
    <CollapsibleSection label="Livraison non effectuée">
      <ActionForm action={failDelivery} className="mt-3 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <fieldset>
          <legend className={labelCls}>Motif</legend>
          <div className="space-y-2">
            {FAILURE_REASONS.map((r) => (
              <label key={r} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50">
                <input type="radio" name="reason" value={r} required className="h-5 w-5 accent-emerald-700" />
                {FAILURE_REASON_LABEL[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`c-${orderId}`} className={labelCls}>Commentaire (obligatoire pour « Autre motif »)</label>
          <textarea id={`c-${orderId}`} name="comment" rows={3} maxLength={MAX_FAILURE_COMMENT} className={`${inputCls} h-auto py-3`} />
        </div>
        <ConfirmButton
          message="Enregistrer cette livraison comme non effectuée ? La commande restera dans vos livraisons à reprendre."
          className="h-12 w-full rounded-xl bg-red-700 px-5 text-base font-semibold text-white hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 disabled:opacity-60 sm:w-auto"
        >
          Enregistrer l&apos;échec
        </ConfirmButton>
      </ActionForm>
    </CollapsibleSection>
  );
}

/** « Actualiser les commandes » : relit la base (pas de système externe), état de chargement et résultat. */
export function RefreshOrdersForm() {
  return (
    <ActionForm action={refreshOrders}>
      <SubmitButton pendingLabel="Actualisation…" className={`${btnGhost} h-12 w-full sm:w-auto`}>
        Actualiser les commandes
      </SubmitButton>
    </ActionForm>
  );
}
