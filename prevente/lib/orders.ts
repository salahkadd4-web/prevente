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
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}
