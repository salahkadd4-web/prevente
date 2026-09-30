import Link from "next/link";
import { btnGhost } from "@/components/ui";
import { buildQuery } from "@/lib/presale/params";

export default function Pager({
  basePath, params, page, pages,
}: {
  basePath: string;
  params: Record<string, string | number | undefined>;
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;
  const href = (n: number) => `${basePath}${buildQuery({ ...params, page: n === 1 ? undefined : n })}`;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2">
      {page > 1 ? <Link href={href(page - 1)} className={`${btnGhost} inline-flex items-center`}>← Précédent</Link> : <span />}
      <span className="text-sm text-slate-600">Page {page} sur {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className={`${btnGhost} inline-flex items-center`}>Suivant →</Link> : <span />}
    </nav>
  );
}
