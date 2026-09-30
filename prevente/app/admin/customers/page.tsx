import Link from "next/link";
import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import CustomerFields from "@/components/customer-fields";
import LiveSearch from "@/components/live-search";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createCustomer } from "./actions";

export const metadata = { title: "Clients · Grossiste Pro" };

export default async function Page({ searchParams }: PageProps<"/admin/customers">) {
  await requireRole("admin");
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 80) ?? "";
  const rawStatus = (await searchParams).status;
  const statusParam = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  const status = statusParam === "active" || statusParam === "inactive" ? statusParam : "all";

  const customers = await prisma.customer.findMany({
    where: {
      ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
      ...(q
        ? { OR: [{ businessName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { address: { contains: q, mode: "insensitive" as const } }] }
        : {}),
    },
    orderBy: { businessName: "asc" },
    include: { createdBy: { select: { fullName: true } }, _count: { select: { orders: true } } },
    take: 300,
  });

  return (
    <AdminShell current="customers" title="Clients">
      <section className={cardCls}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Nouveau client</h2>
        <ActionForm action={createCustomer} className="grid gap-4 sm:grid-cols-2">
          <CustomerFields prefix="new" />
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}>Ajouter le client</button>
          </div>
        </ActionForm>
      </section>

      <section className={cardCls}>
        <div className="mb-3">
          <LiveSearch id="c-search" label="Rechercher un client" placeholder="Rechercher : boutique, téléphone, adresse" />
        </div>
        <form method="get" className="flex flex-wrap gap-2">
          <input type="hidden" name="q" value={q} />
          <select name="status" defaultValue={status} aria-label="Statut" className={`${inputCls} w-auto`}>
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Désactivés</option>
          </select>
          <button type="submit" className={btnGhost}>Filtrer</button>
        </form>

        {customers.length === 0 && <p className="mt-4 text-sm text-slate-500">{q || status !== "all" ? "Aucun client trouvé." : "Aucun client pour le moment."}</p>}
        <ul className="mt-2 divide-y divide-slate-100">
          {customers.map((c) => (
            <li key={c.id} className={`py-3 ${c.isActive ? "" : "opacity-60"}`}>
              <Link href={`/admin/customers/${c.id}`} className="block">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{c.businessName}</p>
                    <p className="text-sm text-slate-600">{c.address}</p>
                    <p className="text-xs text-slate-500">Créé par {c.createdBy.fullName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!c.isActive && <span className={`${badgeCls} ${badgeTone.expired}`}>Désactivé</span>}
                    <span className={`${badgeCls} ${badgeTone.none}`}>
                      {c._count.orders} commande{c._count.orders > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}
