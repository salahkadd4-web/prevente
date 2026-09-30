"use client";

import ActionForm from "@/components/action-form";
import ConfirmButton from "@/components/confirm-button";
import SubmitButton from "@/components/submit-button";
import { btnGhost, btnPrimary } from "@/components/ui";
import { addCustomerToDay, closeDay, removeCustomerFromDay, startDay, syncDay } from "@/app/vendeur/actions";

export function StartDayForm() {
  return (
    <ActionForm action={startDay}>
      <SubmitButton pendingLabel="Démarrage…" className={`${btnPrimary} w-full sm:w-auto`}>Commencer la journée</SubmitButton>
    </ActionForm>
  );
}

export function SyncForm({ dayId }: { dayId: string }) {
  return (
    <ActionForm action={syncDay}>
      <input type="hidden" name="dayId" value={dayId} />
      <SubmitButton pendingLabel="Synchronisation…" className={`${btnGhost} h-12 w-full sm:w-auto`}>Synchroniser les commandes du jour</SubmitButton>
    </ActionForm>
  );
}

export function CloseDayForm({ dayId }: { dayId: string }) {
  return (
    <ActionForm action={closeDay}>
      <input type="hidden" name="dayId" value={dayId} />
      <ConfirmButton
        message="Clôturer la journée ? Les commandes confirmées seront transmises et le stock réservé. Vous ne pourrez plus modifier la journée, ses visites ni ses commandes."
        className="h-12 w-full rounded-xl bg-slate-900 px-5 text-base font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-600/40 disabled:opacity-60 sm:w-auto"
      >
        Clôturer la journée
      </ConfirmButton>
    </ActionForm>
  );
}

export function AddCustomerForm({ dayId, customerId }: { dayId: string; customerId: string }) {
  return (
    <ActionForm action={addCustomerToDay}>
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="customerId" value={customerId} />
      <SubmitButton pendingLabel="Ajout…" className={btnGhost}>Ajouter à la journée</SubmitButton>
    </ActionForm>
  );
}

export function RemoveCustomerForm({ dayId, customerId }: { dayId: string; customerId: string }) {
  return (
    <ActionForm action={removeCustomerFromDay}>
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="customerId" value={customerId} />
      <ConfirmButton message="Retirer ce client de la journée ?" className={`${btnGhost} text-red-800`}>Retirer</ConfirmButton>
    </ActionForm>
  );
}
