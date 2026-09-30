import Link from "next/link";
import { notFound } from "next/navigation";
import VendeurShell from "@/components/vendeur/vendeur-shell";
import OrderForm, { type FormProduct } from "@/components/vendeur/order-form";
import { CancelOrderForm, CancelVisitForm, NoOrderForm, ReopenVisitForm } from "@/components/vendeur/visit-actions";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls } from "@/components/ui";
import { startVisit } from "@/app/vendeur/actions";
import { requireRole } from "@/lib/auth/session";
import { DEFAULT_FLAVOR_NAME, SALE_UNIT_LABEL } from "@/lib/catalog";
import { isUuid } from "@/lib/form";
import { effectiveSalePrice } from "@/lib/pricing";
import { buildQuery, parseListParams } from "@/lib/presale/params";
import { CATALOG_PAGE, getActiveOrderForVisit, getOwnDay, listCatalog } from "@/lib/presale/queries";
import { NO_ORDER_REASON_LABEL, VISIT_STATUS_LABEL, VISIT_STATUS_TONE } from "@/lib/presale/rules";
import { prisma } from "@/lib/prisma";
import { itemLabel } from "@/lib/catalog";

export const metadata = { title: "Visite client · Grossiste Pro" };

export default async function Page({ params, searchParams }: PageProps<"/vendeur/jour/[dayId]/visite/[customerId]">) {
  const profile = await requireRole("vendeur");
  const { dayId, customerId } = await params;
  if (!isUuid(dayId) || !isUuid(customerId)) notFound();
  const day = await getOwnDay(profile.id, dayId);
  if (!day) notFound();

  const entry = await prisma.workDayCustomer.findUnique({
    where: { workDayId_customerId: { workDayId: dayId, customerId } },
    select: { removedAt: true, customer: { select: { id: true, businessName: true, phone: true, address: true, googleMapsUrl: true, notes: true } } },
  });
  if (!entry || entry.removedAt) notFound();
  const { customer } = entry;

  const visit = await prisma.visit.findUnique({ where: { workDayId_customerId: { workDayId: dayId, customerId } } });
  const editable = day.status === "ouverte";
  const back = `/vendeur/jour/${dayId}/clients`;

  const header = (
    <section className={cardCls}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{customer.businessName}</h2>
          <p className="text-sm text-slate-600">
            {customer.phone ? <a href={`tel:${customer.phone}`} className="underline">{customer.phone}</a> : "Téléphone non renseigné"} · {customer.address}
          </p>
          {customer.notes && <p className="mt-1 text-sm text-slate-500">{customer.notes}</p>}
        </div>
        <span className={`${badgeCls} ${badgeTone[VISIT_STATUS_TONE[visit?.status ?? "a_faire"]]}`}>{VISIT_STATUS_LABEL[visit?.status ?? "a_faire"]}</span>
      </div>
      <div className="mt-3"><Link href={back} className="text-sm text-emerald-800 underline">← Retour aux clients</Link></div>
    </section>
  );

  // Pas encore de visite : on propose de la commencer (jamais de création automatique en GET).
  if (!visit) {
    return (
      <VendeurShell current="clients" title="Visite client" dayId={dayId}>
        {header}
        <section className={cardCls}>
          {editable ? (
            <form action={startVisit}>
              <input type="hidden" name="dayId" value={dayId} />
              <input type="hidden" name="customerId" value={customerId} />
              <button type="submit" className={btnPrimary}>Commencer la visite</button>
            </form>
          ) : <p className="text-sm text-slate-600">Journée clôturée : aucune visite n&apos;a été faite chez ce client.</p>}
        </section>
      </VendeurShell>
    );
  }

  const { q, limit } = parseListParams(await searchParams, { defaultLimit: CATALOG_PAGE });
  const order = await getActiveOrderForVisit(visit.id);

  // Articles déjà saisis mais devenus inactifs : signalés, et retirés de la saisie (le serveur les refuserait).
  const orderedIds = order?.items.map((i) => i.variantId) ?? [];
  const stillSellable = orderedIds.length
    ? new Set((await prisma.productVariant.findMany({
        where: { id: { in: orderedIds }, isActive: true, product: { isActive: true } },
        select: { id: true },
      })).map((v) => v.id))
    : new Set<string>();
  const dropped = order?.items.filter((i) => !stillSellable.has(i.variantId)) ?? [];
  const initial = Object.fromEntries((order?.items ?? []).filter((i) => stillSellable.has(i.variantId)).map((i) => [i.variantId, i.quantity]));

  const showOrderForm = visit.status === "en_cours" || visit.status === "commandee";
  let formProducts: FormProduct[] = [];
  let total = 0;
  if (showOrderForm) {
    const cat = await listCatalog(q, limit);
    total = cat.total;
    formProducts = cat.products.map((p) => ({
      id: p.id,
      name: p.name,
      unitLabel: SALE_UNIT_LABEL[p.saleUnit],
      imageUrl: p.imageSecureUrl,
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        isDefault: v.name === DEFAULT_FLAVOR_NAME,
        imageUrl: v.imageSecureUrl,
        price: effectiveSalePrice(v, p),
        stock: cat.stock.get(v.id) ?? 0,
      })),
    }));
  }
  const moreHref = total > formProducts.length ? `${buildQuery({ q, limit: limit + CATALOG_PAGE })}` : null;

  return (
    <VendeurShell current="clients" title="Visite client" dayId={dayId}>
      {header}

      {!editable && (
        <p role="status" className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">Journée clôturée : cette visite est en consultation seule.</p>
      )}

      {visit.status === "sans_commande" && visit.noOrderReason && (
        <section className={`${cardCls} space-y-3`}>
          <h3 className="font-semibold text-slate-900">Terminée sans commande</h3>
          <p className="text-sm text-slate-700">Motif : {NO_ORDER_REASON_LABEL[visit.noOrderReason]}</p>
          {visit.endedAt && <p className="text-xs text-slate-500">Fin de visite : {visit.endedAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Algiers" })}</p>}
          {editable && (
            <>
              <NoOrderForm dayId={dayId} customerId={customerId} current={visit.noOrderReason} />
              <ReopenVisitForm dayId={dayId} customerId={customerId} />
            </>
          )}
        </section>
      )}

      {visit.status === "annulee" && (
        <section className={`${cardCls} space-y-3`}>
          <h3 className="font-semibold text-slate-900">Visite annulée</h3>
          {editable && <ReopenVisitForm dayId={dayId} customerId={customerId} />}
        </section>
      )}

      {showOrderForm && (
        <>
          {visit.status === "commandee" && order && (
            <section className={`${cardCls} space-y-3`}>
              <h3 className="font-semibold text-slate-900">Commande #{order.number} confirmée</h3>
              <p className="text-sm text-slate-600">Modifier les quantités la remettra « à confirmer » : elle ne comptera plus dans le chiffre d&apos;affaires tant qu&apos;elle n&apos;est pas reconfirmée.</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/vendeur/jour/${dayId}/visite/${customerId}/recap`} className={`${btnGhost} inline-flex h-12 items-center`}>Voir le récapitulatif</Link>
                {editable && <CancelOrderForm dayId={dayId} customerId={customerId} />}
              </div>
            </section>
          )}
          {visit.status === "en_cours" && order && (
            <section className={`${cardCls} space-y-2`}>
              <h3 className="font-semibold text-slate-900">Commande #{order.number} à confirmer</h3>
              <p className="text-sm text-slate-600">Vos quantités sont enregistrées. Vérifiez puis confirmez la commande.</p>
              {editable && <div className="flex flex-wrap gap-2">
                <Link href={`/vendeur/jour/${dayId}/visite/${customerId}/recap`} className={`${btnGhost} inline-flex h-12 items-center`}>Voir le récapitulatif</Link>
                <CancelOrderForm dayId={dayId} customerId={customerId} />
              </div>}
            </section>
          )}
          {dropped.length > 0 && (
            <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-300">
              Ces articles ne sont plus commandables et seront retirés à la prochaine vérification :{" "}
              {dropped.map((d) => itemLabel(d.productNameSnapshot, d.flavorNameSnapshot)).join(", ")}.
            </p>
          )}
          <OrderForm
            dayId={dayId}
            customerId={customerId}
            products={formProducts}
            initial={initial}
            total={total}
            moreHref={moreHref}
            readOnly={!editable}
          />
          {editable && visit.status === "en_cours" && !order && (
            <section className={`${cardCls} space-y-3`}>
              <h3 className="font-semibold text-slate-900">Pas de commande ?</h3>
              <NoOrderForm dayId={dayId} customerId={customerId} current={null} />
              <CancelVisitForm dayId={dayId} customerId={customerId} />
            </section>
          )}
        </>
      )}
    </VendeurShell>
  );
}
