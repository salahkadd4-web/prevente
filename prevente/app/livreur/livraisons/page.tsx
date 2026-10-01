import LivreurShell from "@/components/livreur/livreur-shell";
import OrderCards from "@/components/livreur/order-cards";
import Pager from "@/components/vendeur/pager";
import EmptyState from "@/components/empty-state";
import FilterChips from "@/components/filter-chips";
import LiveSearch from "@/components/live-search";
import { cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { listDay } from "@/lib/livreur/queries";
import { DAY_SECTIONS, DAY_SECTION_LABEL, parseSearchParams, parseSection } from "@/lib/livreur/rules";
import { formatWorkDate, todayAlgiers, workDateValue } from "@/lib/presale/dates";

export const metadata = { title: "Livraisons du jour · Grossiste Pro" };

export default async function Page({ searchParams }: PageProps<"/livreur/livraisons">) {
  const profile = await requireRole("livreur");
  const sp = await searchParams;
  const section = parseSection(sp);
  const { q, page: rawPage } = parseSearchParams(sp);
  const { total, pages, page, rows } = await listDay(profile.id, section, q, rawPage);
  const params = { q, section: section === "tous" ? "" : section };
  const back = `?${new URLSearchParams({ ...(q ? { q } : {}), ...(section !== "tous" ? { section } : {}), ...(page > 1 ? { page: String(page) } : {}) }).toString()}`;

  return (
    <LivreurShell current="today" title="Livraisons du jour">
      <p className="text-sm text-slate-600">{formatWorkDate(workDateValue(todayAlgiers()))}</p>
      <section className={cardCls}>
        <div className="mb-3"><LiveSearch id="j-q" label="Rechercher une livraison" placeholder="Rechercher : n° de commande, client, téléphone ou adresse" /></div>
        <FilterChips
          label="Filtrer par état"
          basePath="/livreur/livraisons"
          param="section"
          options={DAY_SECTIONS.map((s) => ({ value: s === "tous" ? "" : s, label: DAY_SECTION_LABEL[s] }))}
          current={section === "tous" ? "" : section}
          params={params}
        />
        <p className="mt-3 text-sm text-slate-600">
          {total} commande{total > 1 ? "s" : ""}{q ? " correspondant à la recherche" : ""}{pages > 1 ? ` · page ${page} / ${pages}` : ""}
        </p>
        {rows.length === 0 ? (
          <EmptyState
            title={q ? "Aucune commande ne correspond à cette recherche." : "Rien dans cette section aujourd'hui."}
            hint={q ? "Essayez une autre recherche ou une autre section." : "Les commandes à livrer, en cours, livrées ou en échec d'aujourd'hui apparaissent ici."}
            action={q || section !== "tous" ? { href: "/livreur/livraisons", label: "Réinitialiser" } : undefined}
          />
        ) : (
          <OrderCards rows={rows} back={back} />
        )}
        <Pager basePath="/livreur/livraisons" params={params} page={page} pages={pages} />
      </section>
    </LivreurShell>
  );
}
