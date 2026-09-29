import { notFound } from "next/navigation";
import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import CustomerFields from "@/components/customer-fields";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/form";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, formatDateTime, formatMoney } from "@/lib/orders";
import { SALE_UNIT_LABEL } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { setCustomerActive, updateCustomer } from "../actions";

export const metadata = { title: "Client · Grossiste Pro" };

export default async function Page({ params }: PageProps<"/admin/customers/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      createdBy: { select: { fullName: true } },
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          items: { orderBy: { productNameSnapshot: "asc" } },
          createdBy: { select: { fullName: true } },
          assignments: { where: { unassignedAt: null }, include: { driver: { select: { fullName: true } } } },
        },
      },
    },
  });
  if (!customer) notFound();

  const orders = customer.orders.map((o) => ({
    ...o,
    total: o.items.reduce((sum, i) => sum + i.unitPrice.toNumber() * i.quantity, 0),
  }));
  const delivered = orders.filter((o) => o.status === "livree");
  const deliveredTotal = delivered.reduce((sum, o) => sum + o.total, 0);

  return (
    <AdminShell current="customers" title={customer.businessName}>
      <section className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 text-sm text-slate-700">
            <p>{customer.address}</p>
            {customer.phone && <p><a className="font-medium text-emerald-800" href={`tel:${customer.phone}`}>{customer.phone}</a></p>}
            {customer.googleMapsUrl && (
              <p>
                <a className="font-medium text-emerald-800 underline" href={customer.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                  Ouvrir dans Google Maps
                </a>
              </p>
            )}
            {customer.notes && <p className="text-slate-600">Notes : {customer.notes}</p>}
            <p className="text-xs text-slate-500">Créé par {customer.createdBy.fullName} le {formatDateTime(customer.createdAt)}</p>
            {!customer.isActive && <span className={`${badgeCls} ${badgeTone.expired}`}>Désactivé</span>}
          </div>
          <ActionForm action={setCustomerActive}>
            <input type="hidden" name="id" value={customer.id} />
            <input type="hidden" name="active" value={String(!customer.isActive)} />
            <button type="submit" className={btnGhost}>{customer.isActive ? "Désactiver" : "Réactiver"}</button>
          </ActionForm>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-emerald-800">Modifier le client</summary>
          <ActionForm action={updateCustomer} className="mt-3 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={customer.id} />
            <CustomerFields prefix="edit" v={customer} />
            <div className="sm:col-span-2">
              <button type="submit" className={btnPrimary}>Enregistrer</button>
            </div>
          </ActionForm>
        </details>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Historique des commandes</h2>
        <p className="mt-1 text-sm text-slate-600">
          {orders.length} commande{orders.length > 1 ? "s" : ""} · {delivered.length} livrée{delivered.length > 1 ? "s" : ""} pour {formatMoney(deliveredTotal)}
        </p>
        {orders.length === 0 && <p className="mt-4 text-sm text-slate-500">Aucune commande pour ce client.</p>}

        <ul className="mt-3 space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">Commande n° {o.number}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(o.createdAt)} · vendeur {o.createdBy.fullName}
                    {o.assignments[0] && ` · livreur ${o.assignments[0].driver.fullName}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`${badgeCls} ${badgeTone[ORDER_STATUS_TONE[o.status]]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(o.total)}</p>
                </div>
              </div>
              <ul className="mt-2 text-sm text-slate-700">
                {o.items.map((i) => (
                  <li key={i.id}>
                    {i.quantity} {SALE_UNIT_LABEL[i.saleUnitSnapshot].toLowerCase()} — {i.productNameSnapshot} {i.flavorNameSnapshot} · {formatMoney(i.unitPrice.toNumber())}
                  </li>
                ))}
              </ul>
              {o.notes && <p className="mt-1 text-xs text-slate-500">Note : {o.notes}</p>}
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}
