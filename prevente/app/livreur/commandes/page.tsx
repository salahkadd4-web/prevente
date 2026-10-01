import LivreurShell from "@/components/livreur/livreur-shell";
import OrderCards from "@/components/livreur/order-cards";
import Pager from "@/components/vendeur/pager";
import EmptyState from "@/components/empty-state";
import LiveSearch from "@/components/live-search";
import { cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { listToDeliver } from "@/lib/livreur/queries";
import { parseSearchParams } from "@/lib/livreur/rules";

export const metadata = { title: "Commandes à livrer · Grossiste Pro" };

export default async function Page({ searchParams }: PageProps<"/livreur/commandes">) {
  const profile = await requireRole("livreur");
  const { q, page: rawPage } = parseSearchParams(await searchParams);
  const { total, pages, page, rows } = await listToDeliver(profile.id, q, rawPage);
  const back = q || page > 1 ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(page > 1 ? { page: String(page) } : {}) }).toString()}` : "";

  return (
    <LivreurShell current="orders" title="Commandes à livrer">
      <section className={cardCls}>
        <LiveSearch id="l-q" label="Rechercher une commande" placeholder="Rechercher : n° de commande, client, téléphone ou adresse" />
        <p className="mt-3 text-sm text-slate-600">
          {total} commande{total > 1 ? "s" : ""} à livrer{q ? " correspondant à la recherche" : ""}
          {pages > 1 ? ` · page ${page} / ${pages}` : ""}
        </p>
        {rows.length === 0 ? (
          <EmptyState
            title={q ? "Aucune commande ne correspond à cette recherche." : "Aucune commande à livrer pour le moment."}
            hint={q ? "Vérifiez l'orthographe ou effacez la recherche." : "Les commandes apparaissent ici une fois la journée du pré-vendeur clôturée et la commande affectée à vous par l'administrateur."}
            action={q ? { href: "/livreur/commandes", label: "Effacer la recherche" } : undefined}
          />
        ) : (
          <OrderCards rows={rows} back={back} />
        )}
        <Pager basePath="/livreur/commandes" params={{ q }} page={page} pages={pages} />
      </section>
    </LivreurShell>
  );
}
