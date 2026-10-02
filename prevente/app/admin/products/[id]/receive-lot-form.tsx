import ActionForm from "@/components/action-form";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";
import { createLot } from "../stock-actions";

/**
 * Réception d'un lot pour UN parfum (ou pour le produit sans parfum : `target` = « p:<id produit> »).
 * Ajoute de la quantité : la quantité du parfum, puis celle du produit, augmentent d'autant.
 */
export default function ReceiveLotForm({ target, idPrefix, unit, receivedToday }: { target: string; idPrefix: string; unit: string; receivedToday: string }) {
  return (
    <ActionForm action={createLot} className="mt-2 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="variantId" value={target} />
      <div>
        <label htmlFor={`${idPrefix}-qty`} className={labelCls}>Quantité reçue ({unit})</label>
        <input id={`${idPrefix}-qty`} name="quantity" type="number" inputMode="numeric" min={1} max={1000000} step={1} required className={inputCls} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-exp`} className={labelCls}>Date d&apos;expiration</label>
        <input id={`${idPrefix}-exp`} name="expiresAt" type="date" required className={inputCls} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-num`} className={labelCls}>N° de lot (facultatif)</label>
        <input id={`${idPrefix}-num`} name="lotNumber" maxLength={60} className={inputCls} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-rec`} className={labelCls}>Date de réception</label>
        <input id={`${idPrefix}-rec`} name="receivedAt" type="date" defaultValue={receivedToday} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-cost`} className={labelCls}>Prix d&apos;achat unitaire de ce lot (facultatif)</label>
        <input id={`${idPrefix}-cost`} name="unitCost" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" title="Nombre positif, 2 décimales maximum" placeholder="ex. 980,00" className={inputCls} />
        <p className="mt-1 text-xs text-slate-500">Propre à ce lot ; vide = coût inconnu, signalé dans la marge du tableau de bord.</p>
      </div>
      <div className="sm:col-span-2">
        <button type="submit" className={btnPrimary}>Ajouter au stock</button>
      </div>
    </ActionForm>
  );
}
