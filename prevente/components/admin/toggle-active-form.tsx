import ActionForm from "@/components/action-form";
import ConfirmButton from "@/components/confirm-button";
import { btnGhost } from "@/components/ui";
import type { ActionResult } from "@/lib/form";

/** Bouton Désactiver (avec confirmation) / Réactiver d'un produit ou d'un parfum. */
export default function ToggleActiveForm({
  action,
  id,
  active,
  what,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  id: string;
  active: boolean;
  /** Ex. « le produit « Biscuit » » (pour le message de confirmation). */
  what: string;
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      {active ? (
        <ConfirmButton
          message={`Désactiver ${what} ? Il n'apparaîtra plus pour de nouvelles commandes ni de nouveaux lots ; l'historique est conservé.`}
          className={`${btnGhost} text-red-700`}
        >
          Désactiver
        </ConfirmButton>
      ) : (
        <button type="submit" className={btnGhost}>Réactiver</button>
      )}
    </ActionForm>
  );
}
