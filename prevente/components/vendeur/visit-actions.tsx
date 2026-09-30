"use client";

import ActionForm from "@/components/action-form";
import ConfirmButton from "@/components/confirm-button";
import SubmitButton from "@/components/submit-button";
import { btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { cancelOrder, cancelVisit, confirmOrder, finishWithoutOrder, reopenVisit } from "@/app/vendeur/actions";
import { NO_ORDER_REASON_LABEL, NO_ORDER_REASONS, type NoOrderReasonKey } from "@/lib/presale/rules";

function Hidden({ dayId, customerId }: { dayId: string; customerId: string }) {
  return (
    <>
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="customerId" value={customerId} />
    </>
  );
}

/** Terminer sans commande : motif obligatoire (aucun choix présélectionné). Sert aussi à modifier le motif. */
export function NoOrderForm({ dayId, customerId, current }: { dayId: string; customerId: string; current: NoOrderReasonKey | null }) {
  return (
    <ActionForm action={finishWithoutOrder} className="space-y-3">
      <Hidden dayId={dayId} customerId={customerId} />
      <div>
        <label htmlFor="reason" className={labelCls}>Motif (obligatoire)</label>
        <select id="reason" name="reason" required defaultValue={current ?? ""} className={inputCls}>
          <option value="" disabled>Choisir un motif…</option>
          {NO_ORDER_REASONS.map((r) => <option key={r} value={r}>{NO_ORDER_REASON_LABEL[r]}</option>)}
        </select>
      </div>
      <SubmitButton pendingLabel="Enregistrement…" className={`${btnGhost} h-12 w-full sm:w-auto`}>
        {current ? "Modifier le motif" : "Terminer sans commande"}
      </SubmitButton>
    </ActionForm>
  );
}

export function ReopenVisitForm({ dayId, customerId }: { dayId: string; customerId: string }) {
  return (
    <ActionForm action={reopenVisit}>
      <Hidden dayId={dayId} customerId={customerId} />
      <SubmitButton pendingLabel="…" className={btnPrimary}>Reprendre la visite</SubmitButton>
    </ActionForm>
  );
}

export function CancelVisitForm({ dayId, customerId }: { dayId: string; customerId: string }) {
  return (
    <ActionForm action={cancelVisit}>
      <Hidden dayId={dayId} customerId={customerId} />
      <ConfirmButton message="Annuler cette visite (créée par erreur) ? Elle restera dans l'historique avec le statut « annulée »." className={`${btnGhost} text-red-800`}>
        Annuler la visite
      </ConfirmButton>
    </ActionForm>
  );
}

export function CancelOrderForm({ dayId, customerId }: { dayId: string; customerId: string }) {
  return (
    <ActionForm action={cancelOrder}>
      <Hidden dayId={dayId} customerId={customerId} />
      <ConfirmButton message="Annuler cette commande ? Elle restera dans l'historique avec le statut « annulée » et ne comptera plus dans le chiffre d'affaires." className={`${btnGhost} text-red-800`}>
        Annuler la commande
      </ConfirmButton>
    </ActionForm>
  );
}

/** Double clic / rafraîchissement : le bouton se désactive pendant l'envoi ET le serveur est idempotent. */
export function ConfirmOrderForm({ dayId, customerId }: { dayId: string; customerId: string }) {
  return (
    <ActionForm action={confirmOrder}>
      <Hidden dayId={dayId} customerId={customerId} />
      <SubmitButton pendingLabel="Confirmation…" className={`${btnPrimary} w-full`}>Confirmer la commande</SubmitButton>
    </ActionForm>
  );
}
