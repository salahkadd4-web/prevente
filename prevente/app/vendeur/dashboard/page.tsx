import Link from "next/link";
import VendeurShell from "@/components/vendeur/vendeur-shell";
import { CloseDayForm, StartDayForm, SyncForm } from "@/components/vendeur/day-actions";
import { badgeCls, badgeTone, btnPrimary, cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { formatMoney } from "@/lib/orders";
import { formatWorkDate, isFriday, todayAlgiers, workDateValue } from "@/lib/presale/dates";
import { getDayCounters } from "@/lib/presale/queries";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Espace pré-vendeur · Grossiste Pro" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cardCls}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function Page() {
  const profile = await requireRole("vendeur");
  const iso = todayAlgiers();

  const [today, stale] = await Promise.all([
    prisma.workDay.findUnique({ where: { vendeurId_workDate: { vendeurId: profile.id, workDate: workDateValue(iso) } } }),
    prisma.workDay.findMany({
      where: { vendeurId: profile.id, status: "ouverte", workDate: { lt: workDateValue(iso) } },
      orderBy: { workDate: "asc" },
      select: { id: true, workDate: true },
    }),
  ]);
  const counters = today ? await getDayCounters(today.id) : null;
  const open = today?.status === "ouverte";

  return (
    <VendeurShell current="dashboard" title="Espace pré-vendeur" dayId={today?.id}>
      <p className="text-sm text-slate-600">
        {profile.full_name} · {formatWorkDate(workDateValue(iso))}
      </p>

      {stale.length > 0 && (
        <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-300">
          <p className="font-medium">Journée{stale.length > 1 ? "s" : ""} précédente{stale.length > 1 ? "s" : ""} non clôturée{stale.length > 1 ? "s" : ""} :</p>
          <ul className="mt-1 list-disc pl-5">
            {stale.map((d) => (
              <li key={d.id}>
                <Link href={`/vendeur/jour/${d.id}/clients`} className="underline">{formatWorkDate(d.workDate)}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!today ? (
        <section className={cardCls}>
          <h2 className="text-lg font-semibold text-slate-900">Journée non démarrée</h2>
          <p className="mt-1 text-sm text-slate-600">
            {isFriday(iso)
              ? "Vendredi : aucun client n'est planifié automatiquement. Vous pouvez démarrer une journée et ajouter des clients manuellement."
              : "Au démarrage, les clients prévus pour aujourd'hui dans votre planning sont chargés automatiquement."}
          </p>
          <div className="mt-4"><StartDayForm /></div>
        </section>
      ) : (
        <>
          <section className={`${cardCls} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {open ? "Journée en cours" : "Journée clôturée"}
              </h2>
              <p className="text-sm text-slate-600">
                Démarrée à {today.startedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" })}
                {today.closedAt && ` · clôturée à ${today.closedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" })}`}
              </p>
            </div>
            <span className={`${badgeCls} ${open ? badgeTone.soon : badgeTone.ok}`}>{open ? "Ouverte" : "Clôturée"}</span>
          </section>

          {counters && (
            <section aria-label="Indicateurs du jour" className="grid gap-3 sm:grid-cols-3">
              <Stat label="Clients visités" value={`${counters.visitedCustomers} / ${counters.plannedCustomers}`} />
              <Stat label="Commandes réalisées" value={String(counters.confirmedOrders)} hint="Confirmées et non annulées" />
              <Stat label="Chiffre d'affaires du jour" value={formatMoney(Number(counters.revenue))} hint="Commandes confirmées, hors annulées" />
            </section>
          )}

          <section className={`${cardCls} space-y-3`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href={`/vendeur/jour/${today.id}/clients`} className={`${btnPrimary} inline-flex items-center justify-center`}>
                {open ? "Clients du jour" : "Consulter les clients"}
              </Link>
              <SyncForm dayId={today.id} />
              {open && <CloseDayForm dayId={today.id} />}
            </div>
            {!open && <p className="text-sm text-slate-600">La journée est clôturée : les commandes confirmées ont été transmises et ne sont plus modifiables.</p>}
          </section>
        </>
      )}
    </VendeurShell>
  );
}
