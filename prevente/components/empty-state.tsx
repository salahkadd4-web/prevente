import Link from "next/link";
import { btnGhost } from "@/components/ui";

/** État vide : dit clairement pourquoi la liste est vide et propose l'action suivante. */
export default function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{hint}</p>}
      {action && (
        <Link href={action.href} className={`${btnGhost} mt-4 inline-flex items-center`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
