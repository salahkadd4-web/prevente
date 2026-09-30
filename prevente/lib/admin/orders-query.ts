import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { isUuid } from "@/lib/form";
import { ORDER_SORTS, type OrderSort } from "@/lib/orders";
import { dayEndExclusive, dayStart, isIsoDay } from "@/lib/period";

export const PAGE_SIZE = 25;

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export type OrderFilters = {
  q: string;
  from: string;
  to: string;
  status: OrderStatus | "";
  customerId: string;
  vendeurId: string;
  livreurId: string;
  /** "p:<uuid>" = tous les parfums d'un produit ; "v:<uuid>" = un parfum précis. */
  item: string;
  sort: OrderSort;
  page: number;
};

/**
 * Toute valeur d'URL est revalidée ici (jamais transmise telle quelle à Prisma).
 * Une valeur invalide est ignorée et signalée dans `warnings`.
 */
export function parseOrderFilters(raw: Raw): { filters: OrderFilters; warnings: string[] } {
  const warnings: string[] = [];

  const q = one(raw.q).slice(0, 80);
  let from = one(raw.from);
  let to = one(raw.to);
  if (from && !isIsoDay(from)) { warnings.push("Date de début invalide, ignorée."); from = ""; }
  if (to && !isIsoDay(to)) { warnings.push("Date de fin invalide, ignorée."); to = ""; }
  if (from && to && from > to) { warnings.push("La date de début suit la date de fin : filtre de dates ignoré."); from = ""; to = ""; }

  const statusRaw = one(raw.status);
  const status = (Object.values(OrderStatus) as string[]).includes(statusRaw) ? (statusRaw as OrderStatus) : "";
  if (statusRaw && !status) warnings.push("Statut inconnu, ignoré.");

  const uuidOrEmpty = (key: string, label: string) => {
    const v = one(raw[key]);
    if (v && !isUuid(v)) { warnings.push(`${label} invalide, ignoré.`); return ""; }
    return v;
  };

  const itemRaw = one(raw.item);
  const item = /^[pv]:[0-9a-f-]{36}$/i.test(itemRaw) && isUuid(itemRaw.slice(2)) ? itemRaw : "";
  if (itemRaw && !item) warnings.push("Produit / parfum invalide, ignoré.");

  const sortRaw = one(raw.sort);
  const sort = (ORDER_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as OrderSort) : "date_desc";

  const pageNum = Number(one(raw.page));
  const page = Number.isSafeInteger(pageNum) && pageNum >= 1 && pageNum <= 100_000 ? pageNum : 1;

  return {
    filters: {
      q, from, to, status,
      customerId: uuidOrEmpty("customer", "Client"),
      vendeurId: uuidOrEmpty("vendeur", "Pré-vendeur"),
      livreurId: uuidOrEmpty("livreur", "Livreur"),
      item, sort, page,
    },
    warnings,
  };
}

/** Filtres combinés en ET ; les dates s'appliquent à la date de création (heure d'Algérie). */
export function buildOrderWhere(f: OrderFilters): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];

  if (f.q) {
    const term = f.q.replace(/^#/, "");
    const or: Prisma.OrderWhereInput[] = [
      { customer: { businessName: { contains: f.q, mode: "insensitive" } } },
      { customer: { phone: { contains: f.q } } },
    ];
    if (/^\d{1,9}$/.test(term)) or.push({ number: Number(term) });
    and.push({ OR: or });
  }
  if (f.from || f.to) {
    and.push({
      createdAt: {
        ...(f.from ? { gte: dayStart(f.from) } : {}),
        ...(f.to ? { lt: dayEndExclusive(f.to) } : {}),
      },
    });
  }
  if (f.status) and.push({ status: f.status });
  if (f.customerId) and.push({ customerId: f.customerId });
  if (f.vendeurId) and.push({ createdById: f.vendeurId });
  if (f.livreurId) and.push({ assignments: { some: { driverId: f.livreurId, unassignedAt: null } } });
  if (f.item) {
    const id = f.item.slice(2);
    and.push({ items: { some: f.item.startsWith("p:") ? { variant: { productId: id } } : { variantId: id } } });
  }
  return and.length ? { AND: and } : {};
}

export function buildOrderBy(sort: OrderSort): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case "date_asc": return [{ createdAt: "asc" }, { number: "asc" }];
    case "number_asc": return [{ number: "asc" }];
    case "number_desc": return [{ number: "desc" }];
    default: return [{ createdAt: "desc" }, { number: "desc" }];
  }
}

/** Conserve les filtres dans les liens (pagination, retour depuis la fiche). */
export function filtersToQuery(f: OrderFilters, overrides: Partial<Record<string, string | number>> = {}): string {
  const p = new URLSearchParams();
  const set = (k: string, v: string | number | undefined) => { if (v !== undefined && v !== "" && v !== 0) p.set(k, String(v)); };
  set("q", f.q); set("from", f.from); set("to", f.to); set("status", f.status);
  set("customer", f.customerId); set("vendeur", f.vendeurId); set("livreur", f.livreurId); set("item", f.item);
  if (f.sort !== "date_desc") set("sort", f.sort);
  for (const [k, v] of Object.entries(overrides)) { if (v === "" || v === undefined) p.delete(k); else p.set(k, String(v)); }
  const s = p.toString();
  return s ? `?${s}` : "";
}
