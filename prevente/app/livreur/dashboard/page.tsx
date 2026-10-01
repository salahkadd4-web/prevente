import Link from "next/link";
import LivreurShell from "@/components/livreur/livreur-shell";
import PeriodPicker from "@/components/livreur/period-picker";
import { RefreshOrdersForm } from "@/components/livreur/delivery-actions";
import { btnGhost, btnPrimary, cardCls, summaryCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { formatMoney } from "@/lib/orders";
import { resolvePeriod } from "@/lib/period";
import { getDriverDashboard } from "@/lib/livreur/queries";
import { progressPercent } from "@/lib/livreur/rules";
import { formatWorkDate, todayAlgiers, workDateValue } from "@/lib/presale/dates";

export const metadata = { title: "Espace livreur · Grossiste Pro" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-display text-2xl text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  return href ? <Link href={href} className={`${cardCls} block hover:bg-slate-50`}>{body}</Link> : <div className={cardCls}>{body}</div>;
}

export default async function Page({ searchParams }: PageProps<"/livreur/dashboard">) {
  const profile = await requireRole("livreur");
  const sp = await searchParams;
  // Par défaut : aujourd'hui (le livreur suit sa journée de livraison).
  const period = resolvePeriod({ period: first(sp.period) ?? "today", from: first(sp.from), to: first(sp.to) });
  const d = await getDriverDashboard(profile.id, period);

  const remaining = d.toDeliver + d.inProgress;
  const pct = progressPercent(d.deliveredToday, remaining);
  const planned = d.deliveredToday + remaining;

  return (
    <LivreurShell current="dashboard" title="Espace livreur">
      <p className="text-sm text-slate-600">{profile.full_name} · {formatWorkDate(workDateValue(todayAlgiers()))}</p>

      {d.activeOrderId && (
        <Link href={`/livreur/commandes/${d.activeOrderId}`} className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-300">
          <span className="flex-1"><strong>Livraison en cours</strong> — {d.inProgress} commande{d.inProgress > 1 ? "s" : ""} à terminer.</span>
          <span className="shrink-0 font-semibold">Ma tournée →</span>
        </Link>
      )}

      <section className={cardCls} aria-label="Progression de la tournée">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">Progression de la tournée (aujourd&apos;hui)</p>
          <p className="text-sm tabular-nums text-slate-600">{d.deliveredToday} / {planned} livrée{d.deliveredToday > 1 ? "s" : ""}</p>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Commandes livrées" className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
        <details className="mt-2">
          <summary className={summaryCls}>Comment c&apos;est calculé ?</summary>
          <p className="text-xs text-slate-500">
            Commandes livrées aujourd&apos;hui par vous / (livrées aujourd&apos;hui + commandes qui vous sont affectées et restent à livrer ou en cours).
          </p>
        </details>
      </section>

      <section aria-label="Commandes en attente (aujourd'hui)" className="grid grid-cols-2 gap-3">
        <Stat label="Commandes à livrer" value={String(d.toDeliver)} hint="Affectées à vous, pas encore commencées" href="/livreur/commandes" />
        <Stat label="En cours de livraison" value={String(d.inProgress)} hint="Commencées, pas encore terminées" href="/livreur/livraisons?section=en_cours" />
      </section>

      <PeriodPicker basePath="/livreur/dashboard" period={period} />

      <section aria-label="Indicateurs de la période" className="grid gap-3 sm:grid-cols-3">
        <Stat label="Commandes livrées" value={String(d.deliveredInPeriod)} hint={`Livraisons confirmées — ${period.label}`} />
        <Stat label="Livraisons échouées" value={String(d.failedInPeriod)} hint={`Tentatives non effectuées — ${period.label}`} />
        <Stat label="Chiffre d'affaires livré" value={formatMoney(Number(d.revenueInPeriod))} hint={`Commandes livrées — ${period.label}`} />
      </section>
      <details className={cardCls}>
        <summary className={summaryCls}>Comment est calculé le chiffre d&apos;affaires livré ?</summary>
        <p className="mt-1 text-xs text-slate-500">
          Somme des lignes (prix × quantité enregistrés sur la commande, jamais les prix actuels du catalogue) des commandes dont
          <strong> vous avez confirmé la livraison</strong> pendant la période. Les commandes affectées, en cours, annulées ou non livrées
          n&apos;y figurent pas, et une commande n&apos;est comptée qu&apos;une fois. Aucun suivi de paiement n&apos;existe pour l&apos;instant :
          les montants « à encaisser » et « encaissé » ne sont donc pas affichés.
        </p>
      </details>

      <section className={`${cardCls} space-y-3`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link href="/livreur/commandes" className={`${btnPrimary} inline-flex items-center justify-center`}>Commandes à livrer</Link>
          <Link href="/livreur/livraisons" className={`${btnGhost} inline-flex h-12 items-center justify-center`}>Mes livraisons du jour</Link>
          <Link href="/livreur/historique" className={`${btnGhost} inline-flex h-12 items-center justify-center`}>Historique des livraisons</Link>
          <RefreshOrdersForm />
        </div>
        <p className="text-xs text-slate-500">
          Les commandes sont lues directement en base à chaque affichage : « Actualiser » relit vos commandes affectées (aucun système externe à synchroniser).
        </p>
      </section>
    </LivreurShell>
  );
}
