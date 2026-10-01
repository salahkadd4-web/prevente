import type { OrderStatus } from "@/app/generated/prisma/enums";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  brouillon: "Brouillon",
  en_attente: "En attente",
  assignee: "Assignée",
  en_livraison: "En livraison",
  livree: "Livrée",
  annulee: "Annulée",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, "ok" | "soon" | "expired" | "none"> = {
  brouillon: "none",
  en_attente: "soon",
  assignee: "soon",
  en_livraison: "soon",
  livree: "ok",
  annulee: "expired",
};

export function formatMoney(value: number): string {
  return value.toLocaleString("fr-FR", { style: "currency", currency: "DZD", maximumFractionDigits: 2 });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Algiers" });
}

/**
 * Transitions de statut autorisées (source de vérité côté serveur).
 *  - « assignee » n'est atteint que par l'affectation d'un livreur, ou par une livraison non effectuée ;
 *  - « en_livraison » et « livree » exigent un livreur affecté ;
 *  - « livree » et « annulee » sont définitifs (pas de retour arrière) ;
 *  - une commande livrée ne peut pas être annulée (aucun flux de retour en stock).
 * Stock : réservé (FEFO) au passage brouillon → en_attente, restitué une seule
 * fois à l'annulation ; aucun autre changement de statut ne touche au stock.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  brouillon: ["en_attente", "annulee"],
  en_attente: ["assignee", "annulee"],
  assignee: ["en_livraison", "annulee"],
  // « assignee » : livraison non effectuée (module livreur) — la commande reste affectée au même
  // livreur pour une nouvelle tentative. L'admin ne peut pas choisir ce passage (voir changeOrderStatus).
  en_livraison: ["livree", "annulee", "assignee"],
  livree: [],
  annulee: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Statuts pour lesquels on peut (ré)affecter un livreur. */
export const ASSIGNABLE_STATUSES: readonly OrderStatus[] = ["en_attente", "assignee", "en_livraison"];

export const ORDER_SORTS = ["date_desc", "date_asc", "number_desc", "number_asc"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];
export const ORDER_SORT_LABEL: Record<OrderSort, string> = {
  date_desc: "Date : récentes d'abord",
  date_asc: "Date : anciennes d'abord",
  number_desc: "N° : décroissant",
  number_asc: "N° : croissant",
};

export function orderTotal(items: { unitPrice: { toNumber(): number }; quantity: number }[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice.toNumber() * i.quantity, 0);
}
