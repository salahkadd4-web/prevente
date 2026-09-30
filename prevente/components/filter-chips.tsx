import Link from "next/link";
import { chipCls } from "@/components/ui";

/**
 * Filtre en pastilles (liens) : un seul toucher applique le filtre, sans « liste déroulante + bouton Filtrer ».
 * Les autres paramètres de l'URL (recherche, autres filtres) sont conservés ; `page` est remis à 1.
 */
export default function FilterChips({
  label,
  basePath,
  param,
  options,
  current,
  params,
}: {
  label: string;
  basePath: string;
  param: string;
  /** `value: ""` = « tous » (le paramètre est retiré de l'URL). */
  options: { value: string; label: string }[];
  current: string;
  /** Paramètres actuels de l'URL à conserver. */
  params: Record<string, string | undefined>;
}) {
  const href = (value: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, [param]: value })) {
      if (v && k !== "page") p.set(k, v);
    }
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label={label} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => (
        <Link key={o.value || "all"} href={href(o.value)} scroll={false} aria-current={o.value === current ? "page" : undefined} className={chipCls(o.value === current)}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
