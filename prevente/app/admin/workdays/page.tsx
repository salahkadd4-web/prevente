import Link from "next/link";
import EmptyState from "@/components/empty-state";
import AdminShell from "@/components/admin-shell";
import { badgeCls, badgeTone, cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { formatMoney } from "@/lib/orders";
import { formatWorkDate } from "@/lib/presale/dates";
import { getDayCounters } from "@/lib/presale/queries";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Journées des pré-vendeurs · Grossiste Pro" };

/** Avancement des journées (lecture seule). Les commandes se consultent dans « Commandes », déjà filtrables. */
export default async function Page() {
  await requireRole("admin");
  const days = await prisma.workDay.findMany({
    orderBy: [{ workDate: "desc" }, { startedAt: "desc" }],
    take: 50,
    select: { id: true, workDate: true, status: true, vendeurId: true, vendeur: { select: { fullName: true } } },
  });
  const counters = await Promise.all(days.map((d) => getDayCounters(d.id)));

  return (
    <AdminShell current="workdays" title="Journées des pré-vendeurs">
      <section className={cardCls}>
        {days.length === 0 ? (
          <EmptyState title="Aucune journée démarrée pour le moment." hint="Les journées apparaissent dès qu'un pré-vendeur démarre sa tournée." />
        ) : (
          <>
            {/* Téléphone : une carte par journée */}
            <ul className="space-y-2 md:hidden">
              {days.map((d, i) => {
                const c = counters[i];
                const iso = d.workDate.toISOString().slice(0, 10);
                const open = d.status === "ouverte";
                return (
                  <li key={d.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium capitalize text-slate-900">{formatWorkDate(d.workDate)}</p>
                        <p className="text-sm text-slate-600">{d.vendeur.fullName}</p>
                      </div>
                      <span className={`${badgeCls} ${open ? badgeTone.soon : badgeTone.ok}`}>{open ? "Ouverte" : "Clôturée"}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div><dt className="text-xs text-slate-500">Visités</dt><dd className="font-medium text-slate-900">{c.visitedCustomers} / {c.plannedCustomers}</dd></div>
                      <div>
                        <dt className="text-xs text-slate-500">Commandes</dt>
                        <dd><Link href={`/admin/orders?vendeur=${d.vendeurId}&from=${iso}&to=${iso}`} className="inline-flex min-h-10 items-center font-medium text-emerald-800 underline">{c.confirmedOrders}</Link></dd>
                      </div>
                      <div className="text-right"><dt className="text-xs text-slate-500">CA</dt><dd className="font-semibold tabular-nums text-slate-900">{formatMoney(Number(c.revenue))}</dd></div>
                    </dl>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                    <th scope="col" className="px-3 py-2 font-medium">Pré-vendeur</th>
                    <th scope="col" className="px-3 py-2 font-medium">État</th>
                    <th scope="col" className="px-3 py-2 font-medium">Visités</th>
                    <th scope="col" className="px-3 py-2 font-medium">Commandes</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">CA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {days.map((d, i) => {
                    const c = counters[i];
                    const iso = d.workDate.toISOString().slice(0, 10);
                    const open = d.status === "ouverte";
                    return (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="py-2 pr-3 font-medium text-slate-900">
                          {d.workDate.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{d.vendeur.fullName}</td>
                        <td className="px-3 py-2"><span className={`${badgeCls} ${open ? badgeTone.soon : badgeTone.ok}`}>{open ? "Ouverte" : "Clôturée"}</span></td>
                        <td className="px-3 py-2 text-slate-700">{c.visitedCustomers} / {c.plannedCustomers}</td>
                        <td className="px-3 py-2">
                          <Link href={`/admin/orders?vendeur=${d.vendeurId}&from=${iso}&to=${iso}`} className="text-emerald-800 underline">{c.confirmedOrders}</Link>
                        </td>
                        <td className="py-2 pl-3 text-right font-semibold tabular-nums text-slate-900">{formatMoney(Number(c.revenue))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </AdminShell>
  );
}
