import Link from "next/link";
import { badgeCls, badgeTone, cardCls } from "@/components/ui";
import { StartDeliveryForm } from "@/components/livreur/delivery-actions";
import { formatDateTime, formatMoney } from "@/lib/orders";
import { FAILURE_REASON_LABEL, deliveryState } from "@/lib/livreur/rules";
import type { OrderRow } from "@/lib/livreur/queries";

function timeLabel(o: OrderRow): string | null {
  if (!o.last) return null;
  if (o.status === "en_livraison" && o.last.result === "en_cours") return `Début : ${formatDateTime(o.last.startedAt)}`;
  if (o.status === "livree" && o.last.result === "livree" && o.last.endedAt) return `Livrée : ${formatDateTime(o.last.endedAt)}`;
  if (o.last.result === "echec" && o.last.endedAt) {
    const why = o.last.failureReason ? ` (${FAILURE_REASON_LABEL[o.last.failureReason]})` : "";
    return `Échec : ${formatDateTime(o.last.endedAt)}${why}`;
  }
  return null;
}

/**
 * Cartes de commandes (téléphone d'abord, sans défilement horizontal) : référence, client, téléphone,
 * adresse, pré-vendeur, date, montant historique, lignes / quantité, statut, détail et « Commencer ».
 */
export default function OrderCards({ rows, back }: { rows: OrderRow[]; back?: string }) {
  return (
    <ul className="mt-3 space-y-3">
      {rows.map((o) => {
        const state = deliveryState(o.status, o.last);
        const time = timeLabel(o);
        const canStart = o.status === "assignee";
        const href = `/livreur/commandes/${o.id}${back ? `?back=${encodeURIComponent(back)}` : ""}`;
        return (
          <li key={o.id} className={`${cardCls} !p-3 sm:!p-4`}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-medium text-slate-900">
                <Link href={href} className="text-emerald-800 underline">#{o.number}</Link> · {o.customerName}
              </p>
              <span className={`${badgeCls} ${badgeTone[state.tone]} shrink-0`}>{state.label}</span>
            </div>
            <div className="mt-2 space-y-0.5 text-sm text-slate-700">
              <p>{o.address}</p>
              {o.phone && <p>Tél. : <a className="font-medium text-emerald-800" href={`tel:${o.phone}`}>{o.phone}</a></p>}
              <p className="text-xs text-slate-500">
                Pré-vendeur {o.vendeurName} · créée le {formatDateTime(o.createdAt)} · {o.lines} ligne{o.lines > 1 ? "s" : ""}, {o.quantity} article{o.quantity > 1 ? "s" : ""}
              </p>
              {time && <p className="text-xs font-medium text-slate-600">{time}</p>}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-display text-lg text-slate-900">{formatMoney(Number(o.total))}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={href} className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 sm:h-10">
                  {o.status === "en_livraison" ? "Reprendre / terminer" : "Voir le détail"}
                </Link>
                {canStart && <StartDeliveryForm orderId={o.id} retry={o.last?.result === "echec"} compact />}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
