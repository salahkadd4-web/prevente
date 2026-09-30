import Link from "next/link";
import { notFound } from "next/navigation";
import VendeurShell from "@/components/vendeur/vendeur-shell";
import Pager from "@/components/vendeur/pager";
import LiveSearch from "@/components/live-search";
import { badgeCls, badgeTone, cardCls } from "@/components/ui";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/form";
import { formatMoney } from "@/lib/orders";
import { formatWorkDate } from "@/lib/presale/dates";
import { orderTotalString } from "@/lib/presale/money";
import { parseListParams } from "@/lib/presale/params";
import { PAGE_SIZE, getOwnDay } from "@/lib/presale/queries";
import { vendeurOrderState } from "@/lib/presale/rules";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Commandes du jour · Grossiste Pro" };

export default async function Page({ params, searchParams }: PageProps<"/vendeur/jour/[dayId]/commandes">) {
  const profile = await requireRole("vendeur");
  const { dayId } = await params;
  if (!isUuid(dayId)) notFound();
  const day = await getOwnDay(profile.id, dayId);
  if (!day) notFound();

  const { q, page: rawPage } = parseListParams(await searchParams);
  const term = q.replace(/^#/, "");
  const where: Prisma.OrderWhereInput = {
    workDayId: dayId,
    createdById: profile.id,
    ...(q
      ? {
          OR: [
            { customer: { businessName: { contains: q, mode: "insensitive" } } },
            { customer: { phone: { contains: q } } },
            ...(/^\d{1,9}$/.test(term) ? [{ number: Number(term) }] : []),
          ],
        }
      : {}),
  };
  const total = await prisma.order.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(rawPage, pages);
  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { number: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true, number: true, status: true, confirmedAt: true, createdAt: true, customerId: true,
      customer: { select: { businessName: true } },
      items: { select: { unitPrice: true, quantity: true } },
    },
  });

  return (
    <VendeurShell current="orders" title="Commandes du jour" dayId={dayId}>
      <p className="text-sm text-slate-600">{formatWorkDate(day.workDate)}</p>
      <section className={cardCls}>
        <div className="mb-3">
          <LiveSearch id="o-q" label="Rechercher une commande" placeholder="Rechercher : n° de commande, client ou téléphone" />
        </div>
        <p className="mb-2 text-sm text-slate-600">{total} commande{total > 1 ? "s" : ""}{q ? " correspondant à la recherche" : ""}</p>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500">{q ? "Aucune commande ne correspond à cette recherche." : "Aucune commande pour le moment."}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => {
              const state = vendeurOrderState(o);
              const amount = orderTotalString(o.items.map((i) => ({ unitPrice: i.unitPrice.toString(), quantity: i.quantity })));
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/vendeur/jour/${dayId}/visite/${o.customerId}`} className="font-medium text-emerald-800 underline">
                      #{o.number} · {o.customer.businessName}
                    </Link>
                    <div className="mt-1"><span className={`${badgeCls} ${badgeTone[state.tone]}`}>{state.label}</span></div>
                  </div>
                  <p className="font-semibold text-slate-900">{formatMoney(Number(amount))}</p>
                </li>
              );
            })}
          </ul>
        )}
        <Pager basePath={`/vendeur/jour/${dayId}/commandes`} params={{ q }} page={page} pages={pages} />
      </section>
    </VendeurShell>
  );
}
