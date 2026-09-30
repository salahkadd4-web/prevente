import { isUuid } from "@/lib/form";

/** Quantité maximale par ligne (garde-fou contre les fautes de frappe). */
export const MAX_LINE_QUANTITY = 99_999;
export const MAX_ORDER_LINES = 200;

export type VisitStatusKey = "en_cours" | "commandee" | "sans_commande" | "annulee";
export type WorkDayStatusKey = "ouverte" | "cloturee";
export type NoOrderReasonKey = "client_absent" | "pas_de_besoin" | "produit_indisponible";

export const VISIT_STATUS_LABEL: Record<VisitStatusKey | "a_faire", string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  commandee: "Commandée",
  sans_commande: "Terminée sans commande",
  annulee: "Annulée",
};

export const VISIT_STATUS_TONE: Record<VisitStatusKey | "a_faire", "ok" | "soon" | "expired" | "none"> = {
  a_faire: "none",
  en_cours: "soon",
  commandee: "ok",
  sans_commande: "expired",
  annulee: "none",
};

/**
 * Libellés clarifiés : on distingue « le client n'a pas besoin » (stock suffisant chez lui) de
 * « le produit est indisponible chez nous » — deux situations métier différentes.
 */
export const NO_ORDER_REASON_LABEL: Record<NoOrderReasonKey, string> = {
  client_absent: "Client absent",
  pas_de_besoin: "Le client ne veut pas commander (il a encore du stock)",
  produit_indisponible: "Produit demandé indisponible chez nous",
};

export const NO_ORDER_REASONS = Object.keys(NO_ORDER_REASON_LABEL) as NoOrderReasonKey[];

export function isNoOrderReason(value: string): value is NoOrderReasonKey {
  return (NO_ORDER_REASONS as string[]).includes(value);
}

/**
 * Transitions de visite autorisées tant que la journée est ouverte (source de vérité serveur).
 * - en_cours → commandee (commande confirmée) | sans_commande (motif obligatoire) | annulee
 * - commandee / sans_commande / annulee → en_cours (reprise pour correction)
 * - commandee → sans_commande uniquement après annulation de la commande (géré par l'action)
 */
export const VISIT_TRANSITIONS: Record<VisitStatusKey, readonly VisitStatusKey[]> = {
  en_cours: ["commandee", "sans_commande", "annulee"],
  commandee: ["en_cours"],
  sans_commande: ["en_cours", "commandee"],
  annulee: ["en_cours"],
};

export function canVisitTransition(from: VisitStatusKey, to: VisitStatusKey): boolean {
  return VISIT_TRANSITIONS[from].includes(to);
}

/** Toute opération du pré-vendeur exige une journée ouverte. */
export function isDayEditable(status: WorkDayStatusKey): boolean {
  return status === "ouverte";
}

/** Quantité saisie : vide ou 0 = ligne non sélectionnée ; sinon entier strictement positif. */
export type QuantityResult = { quantity: number } | { error: string };
export function parseQuantity(raw: unknown): QuantityResult {
  if (raw === null || raw === undefined || raw === "") return { quantity: 0 };
  const s = String(raw).trim();
  if (s === "") return { quantity: 0 };
  if (!/^\d+$/.test(s)) return { error: "La quantité doit être un nombre entier positif." };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n > MAX_LINE_QUANTITY) return { error: `Quantité maximale : ${MAX_LINE_QUANTITY}.` };
  return { quantity: n };
}

export type RawLine = { variantId: string; quantity: number };

/**
 * Valide les lignes envoyées par le navigateur (JSON). Seuls l'identifiant de variante et la
 * quantité sont retenus : prix, noms et unités sont TOUJOURS relus en base par le serveur.
 * Les quantités nulles sont ignorées ; les doublons de variante sont refusés.
 */
export function parseOrderLines(json: string): { error: string } | { lines: RawLine[] } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { error: "Données de commande illisibles." };
  }
  if (!Array.isArray(data)) return { error: "Données de commande invalides." };
  if (data.length > MAX_ORDER_LINES * 5) return { error: "Trop de lignes." };

  const seen = new Set<string>();
  const lines: RawLine[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) return { error: "Ligne de commande invalide." };
    const { variantId, quantity } = entry as { variantId?: unknown; quantity?: unknown };
    if (typeof variantId !== "string" || !isUuid(variantId)) return { error: "Produit invalide." };
    const q = parseQuantity(quantity);
    if ("error" in q) return { error: q.error };
    if (q.quantity === 0) continue;
    if (seen.has(variantId)) return { error: "Un produit apparaît deux fois dans la commande." };
    seen.add(variantId);
    lines.push({ variantId, quantity: q.quantity });
  }
  if (lines.length > MAX_ORDER_LINES) return { error: `Maximum ${MAX_ORDER_LINES} lignes par commande.` };
  return { lines };
}

/** Libellé d'une commande vue par le pré-vendeur (le brouillon non confirmé n'est pas encore une commande). */
export function vendeurOrderState(o: { status: string; confirmedAt: Date | null }): { label: string; tone: "ok" | "soon" | "expired" | "none" } {
  if (o.status === "annulee") return { label: "Annulée", tone: "expired" };
  if (o.status === "brouillon") return o.confirmedAt ? { label: "Confirmée", tone: "ok" } : { label: "À confirmer", tone: "soon" };
  const labels: Record<string, string> = { en_attente: "Transmise", assignee: "Assignée", en_livraison: "En livraison", livree: "Livrée" };
  return { label: labels[o.status] ?? o.status, tone: o.status === "livree" ? "ok" : "soon" };
}
