import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PhotoZoom from "@/components/photo-zoom";
import VendeurShell from "@/components/vendeur/vendeur-shell";
import { ConfirmOrderForm } from "@/components/vendeur/visit-actions";
import { btnGhost, cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { SALE_UNIT_LABEL, itemLabel, thumbUrl } from "@/lib/catalog";
import { isUuid } from "@/lib/form";
import { formatMoney } from "@/lib/orders";
import { centsToString, lineTotalCents, sumCents } from "@/lib/presale/money";
import { getOwnDay } from "@/lib/presale/queries";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Récapitulatif de la commande · Grossiste Pro" };

export default async function Page({ params }: PageProps<"/vendeur/jour/[dayId]/visite/[customerId]/recap">) {
  const profile = await requireRole("vendeur");
  const { dayId, customerId } = await params;
  if (!isUuid(dayId) || !isUuid(customerId)) notFound();
  const day = await getOwnDay(profile.id, dayId);
  if (!day) notFound();

  const visit = await prisma.visit.findUnique({
    where: { workDayId_customerId: { workDayId: dayId, customerId } },
    select: { id: true, vendeurId: true, customer: { select: { businessName: true } } },
  });
  if (!visit || visit.vendeurId !== profile.id) notFound();

  const visitHref = `/vendeur/jour/${dayId}/visite/${customerId}`;
  const order = await prisma.order.findFirst({
    where: { visitId: visit.id, status: { not: "annulee" } },
    include: {
      items: {
        orderBy: [{ productNameSnapshot: "asc" }, { flavorNameSnapshot: "asc" }],
        include: { variant: { select: { imageSecureUrl: true, product: { select: { imageSecureUrl: true } } } } },
      },
    },
  });
  if (!order || order.items.length === 0) redirect(visitHref);

  const lines = order.items.map((i) => {
    const unitPrice = i.unitPrice.toString();
    return { item: i, unitPrice, line: lineTotalCents(unitPrice, i.quantity) };
  });
  const total = centsToString(sumCents(lines.map((l) => l.line)));
  const editable = day.status === "ouverte";
  const confirmed = order.confirmedAt !== null;

  return (
    <VendeurShell current="clients" title="Récapitulatif de la commande" dayId={dayId}>
      <section className={cardCls}>
        <p className="text-sm text-slate-600">
          Client : <span className="font-medium text-slate-900">{visit.customer.businessName}</span> · Commande #{order.number}
        </p>
        {confirmed && <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">Commande confirmée.</p>}
      </section>

      <section className={cardCls}>
        <ul className="divide-y divide-slate-100">
          {lines.map(({ item, unitPrice, line }) => {
            const img = item.variant.imageSecureUrl ?? item.variant.product.imageSecureUrl;
            return (
              <li key={item.id} className="flex items-center gap-3 py-3">
                {img ? (
                  <PhotoZoom url={img} label={itemLabel(item.productNameSnapshot, item.flavorNameSnapshot)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniature Cloudinary déjà optimisée */}
                    <img src={thumbUrl(img, 96)} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  </PhotoZoom>
                ) : (
                  <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">—</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{itemLabel(item.productNameSnapshot, item.flavorNameSnapshot)}</p>
                  <p className="text-sm text-slate-600">
                    {item.quantity} {SALE_UNIT_LABEL[item.saleUnitSnapshot].toLowerCase()} × {formatMoney(Number(unitPrice))}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-slate-900">{formatMoney(Number(centsToString(line)))}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
          <p className="text-sm text-slate-600">{lines.length} ligne{lines.length > 1 ? "s" : ""}</p>
          <p className="text-lg font-semibold text-slate-900">Total : {formatMoney(Number(total))}</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {editable && !confirmed ? <ConfirmOrderForm dayId={dayId} customerId={customerId} /> : <span />}
        <Link href={visitHref} className={`${btnGhost} inline-flex h-12 items-center justify-center`}>
          {editable && !confirmed ? "Retour à la commande" : "Retour à la visite"}
        </Link>
      </section>
    </VendeurShell>
  );
}
