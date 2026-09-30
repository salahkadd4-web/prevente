import Link from "next/link";
import AdminShell from "@/components/admin-shell";
import { badgeCls, badgeTone, cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { formatMoney } from "@/lib/orders";
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
          <p className="text-sm text-slate-500">Aucune journée démarrée pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
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
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-3 font-medium text-slate-900">{iso}</td>
                      <td className="px-3 py-2 text-slate-700">{d.vendeur.fullName}</td>
                      <td className="px-3 py-2"><span className={`${badgeCls} ${d.status === "ouverte" ? badgeTone.soon : badgeTone.ok}`}>{d.status === "ouverte" ? "Ouverte" : "Clôturée"}</span></td>
                      <td className="px-3 py-2 text-slate-700">{c.visitedCustomers} / {c.plannedCustomers}</td>
                      <td className="px-3 py-2">
                        <Link href={`/admin/orders?vendeur=${d.vendeurId}&from=${iso}&to=${iso}`} className="text-emerald-800 underline">{c.confirmedOrders}</Link>
                      </td>
                      <td className="py-2 pl-3 text-right font-semibold text-slate-900">{formatMoney(Number(c.revenue))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
