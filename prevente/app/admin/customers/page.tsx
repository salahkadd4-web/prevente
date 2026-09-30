import Link from "next/link";
import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import CollapsibleSection from "@/components/collapsible-section";
import EmptyState from "@/components/empty-state";
import FilterChips from "@/components/filter-chips";
import CustomerFields from "@/components/customer-fields";
import LiveSearch from "@/components/live-search";
import { badgeCls, badgeTone, btnPrimary, cardCls } from "@/components/ui";
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
        <CollapsibleSection label="Ajouter un client">
        <ActionForm action={createCustomer} className="grid gap-4 sm:grid-cols-2">
          <CustomerFields prefix="new" />
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}>Ajouter le client</button>
          </div>
        </ActionForm>
        </CollapsibleSection>
      </section>

      <section className={cardCls}>
        <div className="mb-3">
          <LiveSearch id="c-search" label="Rechercher un client" placeholder="Rechercher : boutique, téléphone, adresse" />
        </div>
        <FilterChips
          label="Filtrer par statut"
          basePath="/admin/customers"
          param="status"
          current={status === "all" ? "" : status}
          params={{ q: q || undefined, status: status === "all" ? undefined : status }}
          options={[{ value: "", label: "Tous" }, { value: "active", label: "Actifs" }, { value: "inactive", label: "Désactivés" }]}
        />
        <p className="mt-3 text-sm text-slate-600" aria-live="polite">{customers.length} client{customers.length > 1 ? "s" : ""}{customers.length === 300 ? " (300 premiers : affinez la recherche)" : ""}</p>

        {customers.length === 0 && (
          <EmptyState
            title={q || status !== "all" ? "Aucun client trouvé." : "Aucun client pour le moment."}
            hint={q || status !== "all" ? "Modifiez la recherche ou le filtre." : "Ajoutez votre premier client avec « Ajouter un client » ci-dessus."}
            action={q || status !== "all" ? { href: "/admin/customers", label: "Réinitialiser" } : undefined}
          />
        )}
        <ul className="mt-2 divide-y divide-slate-100">
          {customers.map((c) => (
            <li key={c.id} className={`py-3 ${c.isActive ? "" : "opacity-60"}`}>
              <Link href={`/admin/customers/${c.id}`} className="-mx-2 block rounded-xl px-2 py-1 hover:bg-slate-50">
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
