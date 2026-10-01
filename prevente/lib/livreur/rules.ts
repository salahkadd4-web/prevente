/**
 * Module livreur — règles métier PURES (aucun accès base, testables seules). Les actions serveur
 * (app/livreur/actions.ts) et les requêtes (lib/livreur/queries.ts) les appliquent ; l'interface
 * n'est jamais une protection.
 *
 * Statuts : on RÉUTILISE ceux de la commande (lib/orders.ts), aucun nouveau statut :
 *   en_attente → assignee (affectation admin) → en_livraison (le livreur commence) → livree
 *   en_livraison → assignee (livraison non effectuée : même livreur, nouvelle tentative possible)
 *   annulee et livree sont définitifs.
 * L'état « échec » n'est pas un statut de commande : c'est la dernière tentative (delivery_attempts).
 */
import { isUuid } from "@/lib/form";
import { isIsoDay } from "@/lib/period";

export type OrderStatusKey = "brouillon" | "en_attente" | "assignee" | "en_livraison" | "livree" | "annulee";
export type WorkDayStatusKey = "ouverte" | "cloturee";
export type AttemptResultKey = "en_cours" | "livree" | "echec" | "interrompue";
export type Tone = "ok" | "soon" | "expired" | "none";

// ---------------------------------------------------------------------------------------------
// Motifs d'échec
// ---------------------------------------------------------------------------------------------

export const FAILURE_REASON_LABEL = {
  client_absent: "Client absent",
  client_refuse: "Le client refuse la commande",
  adresse_introuvable: "Adresse introuvable ou incorrecte",
  client_injoignable: "Client injoignable",
  autre: "Autre motif",
} as const;
export type FailureReasonKey = keyof typeof FAILURE_REASON_LABEL;
export const FAILURE_REASONS = Object.keys(FAILURE_REASON_LABEL) as FailureReasonKey[];
export const MAX_FAILURE_COMMENT = 300;

export function isFailureReason(value: string): value is FailureReasonKey {
  return (FAILURE_REASONS as string[]).includes(value);
}

/** Motif obligatoire ; commentaire facultatif sauf pour « Autre motif » (obligatoire). */
export function parseFailure(
  reasonRaw: string,
  commentRaw: string,
): { reason: FailureReasonKey; comment: string | null } | { error: string } {
  if (!isFailureReason(reasonRaw)) return { error: "Choisissez un motif." };
  const comment = commentRaw.trim();
  if (comment.length > MAX_FAILURE_COMMENT) return { error: `Commentaire : ${MAX_FAILURE_COMMENT} caractères maximum.` };
  if (reasonRaw === "autre" && comment === "") return { error: "Précisez le motif dans le commentaire." };
  return { reason: reasonRaw, comment: comment || null };
}

// ---------------------------------------------------------------------------------------------
// Éligibilité et transitions (appliquées côté serveur, dans la transaction, ligne de commande verrouillée)
// ---------------------------------------------------------------------------------------------

/** Photographie de la commande lue APRÈS verrouillage de sa ligne (jamais depuis le navigateur). */
export type DeliveryContext = {
  status: OrderStatusKey;
  /** null = commande créée hors module pré-vendeur (pas de journée). */
  workDayStatus: WorkDayStatusKey | null;
  /** Livreur de l'affectation courante (unassigned_at IS NULL), null si aucune. */
  assignedDriverId: string | null;
  /** Tentative `en_cours` de cette commande, s'il y en a une. */
  openAttemptDriverId: string | null;
};

/**
 * Règle d'éligibilité au workflow livreur : la commande doit être affectée à un livreur (statut
 * « assignee » ou « en_livraison ») ET, si elle vient d'une journée de pré-vendeur, cette journée doit
 * être CLÔTURÉE. (À la clôture, les commandes confirmées passent de « brouillon » à « en_attente » :
 * avant, elles ne peuvent même pas être affectées.) Brouillons, annulées et livrées sont exclues.
 */
export function isOrderEligible(status: OrderStatusKey, workDayStatus: WorkDayStatusKey | null): boolean {
  if (status !== "assignee" && status !== "en_livraison") return false;
  return workDayStatus === null || workDayStatus === "cloturee";
}

const NOT_FOUND = "Commande introuvable ou non affectée à votre compte.";

/** Contrôles communs : affectation à CE livreur, journée clôturée, statut non définitif. */
function commonRefusal(ctx: DeliveryContext, driverId: string): string | null {
  // Message identique pour « n'existe pas » et « affectée à un autre » : on ne révèle rien.
  if (ctx.assignedDriverId !== driverId) return NOT_FOUND;
  if (ctx.status === "annulee") return "Cette commande est annulée : elle ne peut pas être livrée.";
  if (ctx.status === "livree") return "Cette commande est déjà livrée.";
  if (ctx.workDayStatus === "ouverte") return "La journée du pré-vendeur n'est pas encore clôturée : la commande n'est pas disponible.";
  if (ctx.status !== "assignee" && ctx.status !== "en_livraison") return "Cette commande n'est pas disponible pour la livraison.";
  return null;
}

export type StartCheck = { ok: true; takeover: boolean } | { ok: false; error: string };

/**
 * Commencer : statut « assignee » (cas normal) ou « en_livraison » sans tentative ouverte de ce livreur
 * (statut posé à la main par l'admin, ou commande réaffectée en cours de livraison : l'ancienne
 * tentative est alors refermée « interrompue » — `takeover`). Déjà démarrée par ce livreur : refus
 * (pas de double démarrage).
 */
export function checkStart(ctx: DeliveryContext, driverId: string): StartCheck {
  const refusal = commonRefusal(ctx, driverId);
  if (refusal) return { ok: false, error: refusal };
  if (ctx.status === "en_livraison" && ctx.openAttemptDriverId === driverId) {
    return { ok: false, error: "La livraison de cette commande est déjà en cours." };
  }
  return { ok: true, takeover: ctx.status === "en_livraison" && ctx.openAttemptDriverId !== null };
}

/** Confirmer / déclarer un échec : la livraison doit avoir été démarrée PAR CE livreur. */
export function checkFinish(ctx: DeliveryContext, driverId: string): { ok: true } | { ok: false; error: string } {
  const refusal = commonRefusal(ctx, driverId);
  if (refusal) return { ok: false, error: refusal };
  if (ctx.status !== "en_livraison" || ctx.openAttemptDriverId !== driverId) {
    return { ok: false, error: "Commencez d'abord la livraison de cette commande." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Libellés d'état de livraison
// ---------------------------------------------------------------------------------------------

export type LastAttempt = { result: AttemptResultKey; endedAt: Date | null } | null;

/** État affiché au livreur : statut de la commande + dernière tentative (l'échec n'est pas un statut). */
export function deliveryState(status: OrderStatusKey, last: LastAttempt): { label: string; tone: Tone } {
  switch (status) {
    case "livree": return { label: "Livrée", tone: "ok" };
    case "en_livraison": return { label: "En cours de livraison", tone: "soon" };
    case "annulee": return { label: "Annulée", tone: "expired" };
    case "assignee":
      return last?.result === "echec"
        ? { label: "Échec — à reprendre", tone: "expired" }
        : { label: "À livrer", tone: "soon" };
    default: return { label: "Non disponible", tone: "none" };
  }
}

export const ATTEMPT_RESULT_LABEL: Record<AttemptResultKey, string> = {
  en_cours: "En cours",
  livree: "Livrée",
  echec: "Livraison non effectuée",
  interrompue: "Interrompue (réaffectée)",
};
export const ATTEMPT_RESULT_TONE: Record<AttemptResultKey, Tone> = {
  en_cours: "soon",
  livree: "ok",
  echec: "expired",
  interrompue: "none",
};

// ---------------------------------------------------------------------------------------------
// Paramètres d'URL (toujours revalidés : jamais transmis tels quels à Prisma)
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export const DAY_SECTIONS = ["tous", "a_livrer", "en_cours", "livrees", "echecs"] as const;
export type DaySection = (typeof DAY_SECTIONS)[number];
export const DAY_SECTION_LABEL: Record<DaySection, string> = {
  tous: "Toutes",
  a_livrer: "À livrer",
  en_cours: "En cours",
  livrees: "Livrées",
  echecs: "Échec de livraison",
};

export const HISTORY_STATUSES = ["", "livree", "echec"] as const;
export type HistoryStatus = (typeof HISTORY_STATUSES)[number];

export function parseSection(raw: Raw): DaySection {
  const v = one(raw.section);
  return (DAY_SECTIONS as readonly string[]).includes(v) ? (v as DaySection) : "tous";
}

export function parseSearchParams(raw: Raw): { q: string; page: number } {
  const q = one(raw.q).slice(0, 80);
  const n = Number(one(raw.page));
  const page = Number.isSafeInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
  return { q, page };
}

export function parseHistoryParams(raw: Raw): {
  q: string; page: number; status: HistoryStatus; from: string; to: string; warnings: string[];
} {
  const warnings: string[] = [];
  const { q, page } = parseSearchParams(raw);
  const statusRaw = one(raw.status);
  const status = (HISTORY_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as HistoryStatus) : "";
  if (statusRaw && !status) warnings.push("Statut inconnu, ignoré.");
  let from = one(raw.from);
  let to = one(raw.to);
  if (from && !isIsoDay(from)) { warnings.push("Date de début invalide, ignorée."); from = ""; }
  if (to && !isIsoDay(to)) { warnings.push("Date de fin invalide, ignorée."); to = ""; }
  if (from && to && from > to) { warnings.push("La date de début suit la date de fin : filtre de dates ignoré."); from = ""; to = ""; }
  return { q, page, status, from, to, warnings };
}

/** Identifiant de commande issu d'une URL : UUID strict, sinon « introuvable ». */
export function parseOrderId(value: string): string | null {
  return isUuid(value) ? value : null;
}

/** Recherche « #123 » ou « 123 » : numéro de commande (entier raisonnable), sinon null. */
export function orderNumberFromQuery(q: string): number | null {
  const term = q.trim().replace(/^#/, "");
  return /^\d{1,9}$/.test(term) ? Number(term) : null;
}

/** Progression de la tournée : livrées / (livrées + restantes). 0 sans commande, jamais > 100 %. */
export function progressPercent(delivered: number, remaining: number): number {
  const total = delivered + remaining;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((delivered / total) * 100));
}
