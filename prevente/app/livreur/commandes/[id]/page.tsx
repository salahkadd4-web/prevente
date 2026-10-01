import Link from "next/link";
import { notFound } from "next/navigation";
import LivreurShell from "@/components/livreur/livreur-shell";
import { ConfirmDeliveryForm, FailDeliveryForm, StartDeliveryForm } from "@/components/livreur/delivery-actions";
import { alertCls, badgeCls, badgeTone, btnGhost, cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { SALE_UNIT_LABEL, itemLabel } from "@/lib/catalog";
import { formatDateTime, formatMoney } from "@/lib/orders";
import { getOrderForDriver } from "@/lib/livreur/queries";
import {
  ATTEMPT_RESULT_LABEL, ATTEMPT_RESULT_TONE, FAILURE_REASON_LABEL, checkFinish, checkStart, deliveryState, isOrderEligible, parseOrderId,
} from "@/lib/livreur/rules";
import { centsToString, lineTotalCents, sumCents } from "@/lib/presale/money";

export const metadata = { title: "Commande à livrer · Grossiste Pro" };

const SAFE_BACK = /^\?[A-Za-z0-9_=&%.:\-+]*$/;

export default async function Page({ params, searchParams }: PageProps<"/livreur/commandes/[id]">) {
  const profile = await requireRole("livreur");
  const id = parseOrderId((await params).id);
  if (!id) notFound();
  const sp = await searchParams;
  const rawBack = Array.isArray(sp.back) ? sp.back[0] : sp.back;
  const backQuery = rawBack && SAFE_BACK.test(rawBack) ? rawBack : "";

  // Introuvable si la commande n'est ni affectée à ce livreur ni dans son propre historique.
  const order = await getOrderForDriver(profile.id, id);
  if (!order) notFound();

  const lines = order.items.map((i) => ({
    ...i,
    total: centsToString(lineTotalCents(i.unitPrice.toString(), i.quantity)),
  }));
  const total = centsToString(sumCents(order.items.map((i) => lineTotalCents(i.unitPrice.toString(), i.quantity))));
  const last = order.deliveryAttempts[0] ?? null;
  const state = deliveryState(order.status, last);

  // Mêmes règles que les actions serveur (affichage seulement : le serveur revalide tout à l'envoi).
  const ctx = {
    status: order.status,
    workDayStatus: order.workDay?.status ?? null,
    assignedDriverId: order.assignments[0]?.driverId ?? null,
    openAttemptDriverId: order.deliveryAttempts.find((a) => a.result === "en_cours") ? profile.id : null,
  };
  const canStart = checkStart(ctx, profile.id).ok;
  const canFinish = checkFinish(ctx, profile.id).ok;
  const mine = ctx.assignedDriverId === profile.id;
  const notAvailable = mine && !isOrderEligible(order.status, ctx.workDayStatus) && order.status !== "livree" && order.status !== "annulee";

  return (
    <LivreurShell current="orders" title={`Commande n° ${order.number}`} back={{ href: `/livreur/commandes${backQuery}`, label: "Retour aux commandes" }}>
      {!mine && order.status !== "livree" && (
        <p role="status" className={alertCls.warn}>Cette commande n&apos;est plus affectée à votre compte : elle est affichée à titre d&apos;historique.</p>
      )}
      {notAvailable && <p role="status" className={alertCls.warn}>Cette commande n&apos;est pas encore disponible pour la livraison.</p>}

      <section className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 text-sm text-slate-700">
            <h2 className="text-lg font-semibold text-slate-900">{order.customer.businessName}</h2>
            <p>{order.customer.address}</p>
            {order.customer.phone && (
              <p>Tél. : <a className="font-medium text-emerald-800" href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></p>
            )}
            {order.customer.googleMapsUrl && /^https?:\/\//i.test(order.customer.googleMapsUrl) && (
              <p><a className="font-medium text-emerald-800 underline" href={order.customer.googleMapsUrl} target="_blank" rel="noopener noreferrer">Ouvrir l&apos;itinéraire</a></p>
            )}
            {order.customer.notes && <p className="text-slate-600">Infos client : {order.customer.notes}</p>}
            <p className="pt-1 text-xs text-slate-500">Créée le {formatDateTime(order.createdAt)} · pré-vendeur {order.createdBy.fullName}</p>
            {order.notes && <p className="text-slate-600">Notes de commande : {order.notes}</p>}
          </div>
          <div className="text-right">
            <span className={`${badgeCls} ${badgeTone[state.tone]}`}>{state.label}</span>
            <p className="mt-2 font-display text-2xl text-slate-900">{formatMoney(Number(total))}</p>
          </div>
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Lignes commandées</h2>
        {lines.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Cette commande ne contient aucune ligne.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Produit</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Quantité</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Prix unitaire</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-3 text-slate-900">{itemLabel(i.productNameSnapshot, i.flavorNameSnapshot)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{i.quantity} {SALE_UNIT_LABEL[i.saleUnitSnapshot].toLowerCase()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatMoney(Number(i.unitPrice.toString()))}</td>
                    <td className="py-2 pl-3 text-right font-medium text-slate-900">{formatMoney(Number(i.total))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200">
                <tr>
                  <th scope="row" colSpan={3} className="py-2 pr-3 text-right font-semibold text-slate-900">Total</th>
                  <td className="py-2 pl-3 text-right font-semibold text-slate-900">{formatMoney(Number(total))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">Prix enregistrés au moment de la commande. Les lignes ne sont pas modifiables depuis le compte livreur.</p>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Actions</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          {canStart && <StartDeliveryForm orderId={order.id} retry={last?.result === "echec"} />}
          {canFinish && <ConfirmDeliveryForm orderId={order.id} total={formatMoney(Number(total))} />}
          <Link href={`/livreur/commandes${backQuery}`} className={`${btnGhost} inline-flex h-12 items-center justify-center`}>Retour aux commandes</Link>
        </div>
        {canFinish && <div className="mt-3"><FailDeliveryForm orderId={order.id} /></div>}
        {!canStart && !canFinish && (
          <p className="mt-3 text-sm text-slate-500">
            {order.status === "livree" ? "Commande livrée : aucune action possible." : order.status === "annulee" ? "Commande annulée : elle ne peut pas être livrée." : "Aucune action disponible pour cette commande."}
          </p>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Mes tentatives de livraison</h2>
        {order.deliveryAttempts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucune tentative pour le moment.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
            {order.deliveryAttempts.map((a) => (
              <li key={a.id} className="relative text-sm before:absolute before:-left-[1.3rem] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:bg-emerald-600">
                <p className="text-slate-900">
                  <span className={`${badgeCls} ${badgeTone[ATTEMPT_RESULT_TONE[a.result]]}`}>{ATTEMPT_RESULT_LABEL[a.result]}</span>
                  {a.failureReason && <span className="ml-2">{FAILURE_REASON_LABEL[a.failureReason]}</span>}
                </p>
                <p className="text-xs text-slate-500">
                  Début : {formatDateTime(a.startedAt)}{a.endedAt ? ` · fin : ${formatDateTime(a.endedAt)}` : ""}
                </p>
                {a.comment && <p className="mt-1 text-slate-600">{a.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </LivreurShell>
  );
}
