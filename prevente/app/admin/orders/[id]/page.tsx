import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import ConfirmButton from "@/components/confirm-button";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls, linkCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { SALE_UNIT_LABEL, itemLabel } from "@/lib/catalog";
import { isUuid } from "@/lib/form";
import {
  ASSIGNABLE_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, ORDER_TRANSITIONS, formatDateTime, formatMoney, orderTotal,
} from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { assignDriver, changeOrderStatus } from "../actions";

export const metadata = { title: "Commande · Grossiste Pro" };

const SAFE_BACK = /^\?[A-Za-z0-9_=&%.:\-+]*$/;

export default async function Page({ params, searchParams }: PageProps<"/admin/orders/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const sp = await searchParams;
  const rawBack = Array.isArray(sp.back) ? sp.back[0] : sp.back;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, businessName: true, phone: true, address: true } },
      createdBy: { select: { fullName: true } },
      items: { orderBy: { productNameSnapshot: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" }, include: { changedBy: { select: { fullName: true } } } },
      assignments: { orderBy: { assignedAt: "desc" }, include: { driver: { select: { fullName: true } }, assignedBy: { select: { fullName: true } } } },
    },
  });
  if (!order) notFound();

  const canAssign = ASSIGNABLE_STATUSES.includes(order.status);
  const drivers = canAssign
    ? await prisma.profile.findMany({ where: { role: "livreur", isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } })
    : [];
  const current = order.assignments.find((a) => a.unassignedAt === null);
  // « Assignée » ne se choisit pas ici : elle résulte de l'affectation d'un livreur.
  // Commande d'une journée de pré-vendeur : « En attente » ne s'obtient que par la clôture de la journée.
  const nextStatuses = ORDER_TRANSITIONS[order.status].filter(
    (s) => s !== "assignee" && !(order.workDayId && order.status === "brouillon" && s === "en_attente"),
  );
  const total = orderTotal(order.items);
  const backQuery = rawBack && SAFE_BACK.test(rawBack) ? rawBack : "";

  return (
    <AdminShell current="orders" title={`Commande n° ${order.number}`} back={{ href: `/admin/orders${backQuery}`, label: "Retour aux commandes" }}>

      <section className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              Client :{" "}
              <Link href={`/admin/customers/${order.customer.id}`} className={linkCls}>{order.customer.businessName}</Link>
            </p>
            <p>{order.customer.address}</p>
            {order.customer.phone && <p>Tél. : <a className="font-medium text-emerald-800" href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></p>}
            <p>Créée le {formatDateTime(order.createdAt)} par {order.createdBy.fullName}</p>
            <p>Livreur affecté : <strong>{current?.driver.fullName ?? "aucun"}</strong></p>
            {order.notes && <p className="text-slate-600">Notes : {order.notes}</p>}
          </div>
          <div className="text-right">
            <span className={`${badgeCls} ${badgeTone[ORDER_STATUS_TONE[order.status]]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{formatMoney(total)}</p>
          </div>
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Lignes de commande</h2>
        {order.items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Cette commande ne contient aucune ligne.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Produit</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Quantité</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Prix unitaire</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">Sous-total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-3 text-slate-900">{itemLabel(i.productNameSnapshot, i.flavorNameSnapshot)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{i.quantity} {SALE_UNIT_LABEL[i.saleUnitSnapshot].toLowerCase()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatMoney(i.unitPrice.toNumber())}</td>
                    <td className="py-2 pl-3 text-right font-medium text-slate-900">{formatMoney(i.unitPrice.toNumber() * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200">
                <tr>
                  <th scope="row" colSpan={3} className="py-2 pr-3 text-right font-semibold text-slate-900">Total</th>
                  <td className="py-2 pl-3 text-right font-semibold text-slate-900">{formatMoney(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">Prix et libellés enregistrés au moment de la commande (non modifiés par le catalogue).</p>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Actions</h2>

        {nextStatuses.length === 0 && !canAssign && (
          <p className="mt-3 text-sm text-slate-500">Commande {ORDER_STATUS_LABEL[order.status].toLowerCase()} : aucun changement possible.</p>
        )}

        {canAssign && (
          <div className="mt-3">
            <h3 className="text-sm font-semibold text-slate-800">{current ? "Réaffecter à un autre livreur" : "Affecter à un livreur"}</h3>
            {drivers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aucun livreur actif. Créez ou réactivez un compte livreur dans Utilisateurs.</p>
            ) : (
              <ActionForm action={assignDriver} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={order.id} />
                <div className="min-w-56 flex-1">
                  <label htmlFor="a-driver" className={labelCls}>Livreur</label>
                  <select id="a-driver" name="driverId" required defaultValue="" className={inputCls}>
                    <option value="" disabled>Choisir…</option>
                    {drivers.map((d) => <option key={d.id} value={d.id} disabled={d.id === current?.driverId}>{d.fullName}{d.id === current?.driverId ? " (actuel)" : ""}</option>)}
                  </select>
                </div>
                <ConfirmButton message={current ? "Réaffecter cette commande à un autre livreur ?" : "Affecter cette commande à ce livreur ?"} className={`${btnPrimary} w-full sm:w-auto`}>
                  {current ? "Réaffecter" : "Affecter"}
                </ConfirmButton>
              </ActionForm>
            )}
          </div>
        )}

        {nextStatuses.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-800">Changer le statut</h3>
            <ActionForm action={changeOrderStatus} className="mt-2 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <input type="hidden" name="id" value={order.id} />
              <div>
                <label htmlFor="s-status" className={labelCls}>Nouveau statut</label>
                <select id="s-status" name="status" required defaultValue="" className={inputCls}>
                  <option value="" disabled>Choisir…</option>
                  {nextStatuses.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="s-note" className={labelCls}>Note (facultatif)</label>
                <input id="s-note" name="note" maxLength={300} className={inputCls} />
              </div>
              <ConfirmButton message="Confirmer le changement de statut ? Une annulation restitue le stock réservé et est définitive." className={btnGhost + " h-12 w-full sm:w-auto"}>
                Valider
              </ConfirmButton>
            </ActionForm>
            <p className="mt-2 text-xs text-slate-500">
              Le passage « Brouillon → En attente » réserve le stock (FEFO) ; l&apos;annulation le restitue. « Livrée » et « Annulée » sont définitives.
            </p>
          </div>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Historique des statuts</h2>
        {order.statusHistory.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun changement enregistré.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
            {order.statusHistory.map((h) => (
              <li key={h.id} className="relative text-sm before:absolute before:-left-[1.3rem] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:bg-emerald-600">
                <p className="text-slate-900">
                  {h.fromStatus ? `${ORDER_STATUS_LABEL[h.fromStatus]} → ` : ""}<strong>{ORDER_STATUS_LABEL[h.toStatus]}</strong>
                </p>
                <p className="text-xs text-slate-500">{formatDateTime(h.createdAt)} · {h.changedBy.fullName}</p>
                {h.note && <p className="mt-1 text-slate-600">{h.note}</p>}
              </li>
            ))}
          </ol>
        )}

        <h3 className="mt-5 text-sm font-semibold text-slate-800">Affectations</h3>
        {order.assignments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Aucune affectation.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {order.assignments.map((a) => (
              <li key={a.id}>
                <strong>{a.driver.fullName}</strong> — depuis le {formatDateTime(a.assignedAt)} (par {a.assignedBy.fullName})
                {a.unassignedAt ? ` jusqu'au ${formatDateTime(a.unassignedAt)}` : " · actuel"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
