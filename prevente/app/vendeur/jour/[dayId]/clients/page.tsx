import Link from "next/link";
import { notFound } from "next/navigation";
import VendeurShell from "@/components/vendeur/vendeur-shell";
import Pager from "@/components/vendeur/pager";
import LiveSearch from "@/components/live-search";
import { AddCustomerForm, RemoveCustomerForm } from "@/components/vendeur/day-actions";
import { alertCls, badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, chipCls } from "@/components/ui";
import { startVisit } from "@/app/vendeur/actions";
import { requireRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/form";
import { formatWorkDate } from "@/lib/presale/dates";
import { parseListParams } from "@/lib/presale/params";
import { PAGE_SIZE, getDayCounters, getOwnDay, listAllCustomers, listDayCustomers } from "@/lib/presale/queries";
import { VISIT_STATUS_LABEL, VISIT_STATUS_TONE } from "@/lib/presale/rules";

export const metadata = { title: "Clients du jour · Grossiste Pro" };

export default async function Page({ params, searchParams }: PageProps<"/vendeur/jour/[dayId]/clients">) {
  const profile = await requireRole("vendeur");
  const { dayId } = await params;
  if (!isUuid(dayId)) notFound();
  const day = await getOwnDay(profile.id, dayId);
  if (!day) notFound();

  const sp = await searchParams;
  const { q, page: rawPage, vue } = parseListParams(sp);
  const justCreated = sp.nouveau === "1";
  const editable = day.status === "ouverte";
  const base = `/vendeur/jour/${dayId}/clients`;

  const counters = await getDayCounters(dayId);
  const pageFor = (total: number) => Math.min(rawPage, Math.max(1, Math.ceil(total / PAGE_SIZE)));

  let content: React.ReactNode;
  let total = 0;
  let page = 1;

  if (vue === "tous") {
    const probe = await listAllCustomers(profile.id, dayId, q, rawPage);
    total = probe.total;
    page = pageFor(total);
    const { rows } = page === rawPage ? probe : await listAllCustomers(profile.id, dayId, q, page);
    content = rows.length === 0 ? (
      <p className="text-sm text-slate-500">{q ? "Aucun client ne correspond à cette recherche." : "Aucun client."}</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{c.businessName}</p>
              <p className="text-sm text-slate-600">{c.phone ?? "Téléphone non renseigné"} · {c.address}</p>
            </div>
            {c.inDay ? (
              <span className={`${badgeCls} ${badgeTone.ok}`}>Dans la journée</span>
            ) : editable ? (
              <AddCustomerForm dayId={dayId} customerId={c.id} />
            ) : null}
          </li>
        ))}
      </ul>
    );
  } else {
    const probe = await listDayCustomers(dayId, q, rawPage);
    total = probe.total;
    page = pageFor(total);
    const { rows } = page === rawPage ? probe : await listDayCustomers(dayId, q, page);
    content = rows.length === 0 ? (
      <p className="text-sm text-slate-500">
        {q ? "Aucun client de la journée ne correspond à cette recherche." : "Aucun client dans la journée. Ouvrez « Tous les clients » pour en ajouter à la journée."}
      </p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const state = r.visit?.status ?? "a_faire";
          const visitHref = `/vendeur/jour/${dayId}/visite/${r.customer.id}`;
          return (
            <li key={r.customer.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{r.customer.businessName}</p>
                <p className="text-sm text-slate-600">
                  {r.customer.phone ? <a href={`tel:${r.customer.phone}`} className="underline">{r.customer.phone}</a> : "Téléphone non renseigné"}
                  {" · "}{r.customer.address}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`${badgeCls} ${badgeTone[VISIT_STATUS_TONE[state]]}`}>{VISIT_STATUS_LABEL[state]}</span>
                  {r.source === "manuel" && <span className={`${badgeCls} ${badgeTone.none}`}>Ajouté manuellement</span>}
                  {r.customer.googleMapsUrl && (
                    <a href={r.customer.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-800 underline">Itinéraire</a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!r.visit && editable ? (
                  <form action={startVisit}>
                    <input type="hidden" name="dayId" value={dayId} />
                    <input type="hidden" name="customerId" value={r.customer.id} />
                    <button type="submit" className={btnPrimary}>Commencer la visite</button>
                  </form>
                ) : r.visit ? (
                  <Link href={visitHref} className={`${btnGhost} inline-flex h-12 items-center`}>
                    {editable ? "Consulter la visite" : "Consulter"}
                  </Link>
                ) : null}
                {editable && !r.visit && <RemoveCustomerForm dayId={dayId} customerId={r.customer.id} />}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tab = chipCls;

  return (
    <VendeurShell current="clients" title="Clients du jour" dayId={dayId}>
      <p className="text-sm text-slate-600">
        {formatWorkDate(day.workDate)} · {counters.visitedCustomers} / {counters.plannedCustomers} clients visités
        {!editable && " · journée clôturée (consultation seule)"}
      </p>

      <section className={cardCls}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href={base} aria-current={vue === "jour" ? "page" : undefined} className={tab(vue === "jour")}>De la journée</Link>
          <Link href={`${base}?vue=tous`} aria-current={vue === "tous" ? "page" : undefined} className={tab(vue === "tous")}>
            Tous les clients
          </Link>
        </div>
        {justCreated && (
          <p role="status" className={`mb-3 ${alertCls.info}`}>
            Client enregistré et ajouté à la journée.
          </p>
        )}
        {editable && (
          <div className="mb-3">
            <Link href={`${base}/nouveau`} className={`${btnGhost} inline-flex h-12 items-center`}>+ Nouveau client (recensement)</Link>
          </div>
        )}
        <div className="mb-3">
          <LiveSearch id="c-q" label="Rechercher un client" placeholder="Rechercher : nom, téléphone ou adresse" />
        </div>
        <p className="mb-2 text-sm text-slate-600">{total} client{total > 1 ? "s" : ""}{q ? " correspondant à la recherche" : ""}</p>
        {content}
        <Pager basePath={base} params={{ q, vue: vue === "tous" ? "tous" : undefined }} page={page} pages={pages} />
      </section>
    </VendeurShell>
  );
}
