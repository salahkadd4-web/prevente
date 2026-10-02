import ActionForm from "@/components/action-form";
import ConfirmButton from "@/components/confirm-button";
import { badgeCls, badgeTone, btnGhost, inputCls, summaryCls } from "@/components/ui";
import { moneyInputValue } from "@/lib/money";
import { formatMoney } from "@/lib/orders";
import { expiryInfo, formatDate } from "@/lib/stock/expiry";
import { correctLotQuantity, setLotCost } from "../stock-actions";

export type LotView = {
  id: string;
  lotNumber: string | null;
  initialQuantity: number;
  availableQuantity: number;
  expiresAt: Date | null;
  receivedAt: Date;
  unitCost: { toString(): string } | null;
};

/** Un lot d'un parfum : quantités, dates, prix d'achat, et ses deux corrections repliées. */
export default function LotRow({ lot, unit }: { lot: LotView; unit: string }) {
  const info = expiryInfo(lot.expiresAt);
  const empty = lot.availableQuantity === 0;
  return (
    <li className={`px-3 py-3 ${empty ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {lot.availableQuantity} / {lot.initialQuantity} {unit}{lot.lotNumber && ` · lot ${lot.lotNumber}`}
          </p>
          <p className="text-sm text-slate-600">
            Reçu le {formatDate(lot.receivedAt)} · prix d&apos;achat :{" "}
            {lot.unitCost === null ? <span className="font-medium text-amber-900">inconnu</span> : formatMoney(Number(lot.unitCost.toString()))}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-800">{formatDate(lot.expiresAt)}</p>
          {!empty && <span className={`${badgeCls} ${badgeTone[info.tone]}`}>{info.label}</span>}
          {empty && <span className={`${badgeCls} ${badgeTone.none}`}>Épuisé</span>}
        </div>
      </div>
      <div className="mt-1">
        <details>
          <summary className={summaryCls}>{lot.unitCost === null ? "Renseigner le prix d'achat" : "Modifier le prix d'achat"}</summary>
          <ActionForm action={setLotCost} className="mt-2 grid gap-2 sm:grid-cols-[12rem_auto] sm:items-end">
            <input type="hidden" name="id" value={lot.id} />
            <div>
              <label htmlFor={`c-c-${lot.id}`} className="mb-1 block text-xs font-medium text-slate-700">Prix d&apos;achat unitaire</label>
              <input id={`c-c-${lot.id}`} name="unitCost" type="text" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" title="Nombre positif, 2 décimales maximum" defaultValue={moneyInputValue(lot.unitCost)} className={inputCls} />
            </div>
            <ConfirmButton message="Enregistrer ce prix d'achat pour ce lot uniquement ? Il sert au calcul de la marge des ventes prélevées sur ce lot." className={btnGhost + " h-12"}>
              Enregistrer
            </ConfirmButton>
          </ActionForm>
        </details>
        <details>
          <summary className={summaryCls}>Corriger la quantité</summary>
          <ActionForm action={correctLotQuantity} className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={lot.id} />
            <div>
              <label htmlFor={`c-q-${lot.id}`} className="mb-1 block text-xs font-medium text-slate-700">Quantité disponible</label>
              <input id={`c-q-${lot.id}`} name="quantity" type="number" inputMode="numeric" min={0} max={lot.initialQuantity} step={1} defaultValue={lot.availableQuantity} required className={inputCls} />
            </div>
            <div>
              <label htmlFor={`c-r-${lot.id}`} className="mb-1 block text-xs font-medium text-slate-700">Motif (obligatoire)</label>
              <input id={`c-r-${lot.id}`} name="reason" required minLength={3} maxLength={200} placeholder="Ex. inventaire, casse, péremption…" className={inputCls} />
            </div>
            <ConfirmButton message="Enregistrer cette correction d'inventaire ? Elle sera inscrite dans le journal." className={btnGhost + " h-12"}>
              Enregistrer
            </ConfirmButton>
          </ActionForm>
          <p className="mt-1 text-xs text-slate-500">
            Maximum : quantité initiale ({lot.initialQuantity}) moins les unités déjà prélevées par des commandes. Pour ajouter du stock, réceptionnez un nouveau lot.
          </p>
        </details>
      </div>
    </li>
  );
}
