import Link from "next/link";
import AdminShell from "@/components/admin-shell";
import ActionForm from "@/components/action-form";
import SubmitButton from "@/components/submit-button";
import { btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";
import { setCustomerSchedule } from "./actions";
import { requireRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/form";
import { PLANNABLE_WEEKDAYS, WEEKDAY_LABEL } from "@/lib/presale/dates";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Planning · Grossiste Pro" };

function Days({ selected, idPrefix }: { selected: number[]; idPrefix: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PLANNABLE_WEEKDAYS.map((d) => (
        <label key={d} htmlFor={`${idPrefix}-${d}`} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <input id={`${idPrefix}-${d}`} type="checkbox" name="weekday" value={d} defaultChecked={selected.includes(d)} />
          {WEEKDAY_LABEL[d]}
        </label>
      ))}
    </div>
  );
}

export default async function Page({ searchParams }: PageProps<"/admin/planning">) {
  await requireRole("admin");
  const raw = (await searchParams).vendeur;
  const vendeurParam = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  const vendeurs = await prisma.profile.findMany({
    where: { role: "vendeur", isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const vendeurId = isUuid(vendeurParam) && vendeurs.some((v) => v.id === vendeurParam) ? vendeurParam : "";

  const [schedules, customers] = vendeurId
    ? await Promise.all([
        prisma.customerSchedule.findMany({
          where: { vendeurId },
          select: { customerId: true, weekday: true, customer: { select: { businessName: true } } },
        }),
        prisma.customer.findMany({ where: { isActive: true }, select: { id: true, businessName: true }, orderBy: { businessName: "asc" }, take: 1000 }),
      ])
    : [[], []];

  const byCustomer = new Map<string, { name: string; days: number[] }>();
  for (const s of schedules) {
    const e = byCustomer.get(s.customerId) ?? { name: s.customer.businessName, days: [] };
    e.days.push(s.weekday);
    byCustomer.set(s.customerId, e);
  }
  const rows = [...byCustomer.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "fr"));

  return (
    <AdminShell current="planning" title="Planning hebdomadaire">
      <section className={cardCls}>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="pl-vendeur" className={labelCls}>Pré-vendeur</label>
            <select id="pl-vendeur" name="vendeur" defaultValue={vendeurId} className={inputCls}>
              <option value="">Choisir un pré-vendeur…</option>
              {vendeurs.map((v) => <option key={v.id} value={v.id}>{v.fullName}</option>)}
            </select>
          </div>
          <button type="submit" className={btnPrimary}>Afficher</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Samedi → jeudi : les clients planifiés sont chargés au démarrage de la journée du pré-vendeur. Vendredi : aucun client automatique.
          Aucun planning n&apos;est créé par défaut.
        </p>
      </section>

      {vendeurId && (
        <>
          <section className={cardCls}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Ajouter / modifier un client</h2>
            <ActionForm action={setCustomerSchedule} className="space-y-3">
              <input type="hidden" name="vendeurId" value={vendeurId} />
              <div>
                <label htmlFor="pl-customer" className={labelCls}>Client</label>
                <select id="pl-customer" name="customerId" required defaultValue="" className={inputCls}>
                  <option value="" disabled>Choisir un client…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
                </select>
              </div>
              <Days selected={[]} idPrefix="new" />
              <p className="text-xs text-slate-500">Les jours cochés remplacent ceux déjà enregistrés pour ce client.</p>
              <SubmitButton pendingLabel="Enregistrement…" className={btnPrimary}>Enregistrer</SubmitButton>
            </ActionForm>
          </section>

          <section className={cardCls}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Clients planifiés ({rows.length})</h2>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun client planifié pour ce pré-vendeur.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map(([customerId, e]) => (
                  <li key={customerId} className="py-3">
                    <ActionForm action={setCustomerSchedule} className="space-y-2">
                      <input type="hidden" name="vendeurId" value={vendeurId} />
                      <input type="hidden" name="customerId" value={customerId} />
                      <p className="font-medium text-slate-900">{e.name}</p>
                      <Days selected={e.days} idPrefix={customerId} />
                      <SubmitButton pendingLabel="…" className={btnGhost}>Mettre à jour (aucun jour coché = retirer)</SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {!vendeurId && vendeurs.length === 0 && (
        <p className="text-sm text-slate-500">Aucun pré-vendeur actif. <Link href="/admin/users" className="underline">Créer un pré-vendeur</Link>.</p>
      )}
    </AdminShell>
  );
}
