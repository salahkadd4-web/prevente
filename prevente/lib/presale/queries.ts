import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { effectiveSalePrice } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { accessibleCustomerWhere } from "@/lib/presale/server";

export const PAGE_SIZE = 20;
export const CATALOG_PAGE = 30;

export type DayCounters = {
  /** Clients prévus ou ajoutés (non retirés). */
  plannedCustomers: number;
  /** Visites terminées (commande ou non) pour des clients de la journée. */
  visitedCustomers: number;
  /** Commandes confirmées et non annulées. */
  confirmedOrders: number;
  /** Somme exacte quantité × prix unitaire historique, en chaîne décimale. */
  revenue: string;
};

/**
 * Compteurs calculés UNIQUEMENT depuis la base (jamais depuis l'état du navigateur).
 *  - visités : visites « commandée » ou « terminée sans commande » d'un client non retiré ;
 *  - commandes : confirmées (confirmed_at) et non annulées ;
 *  - CA : Σ quantité × prix unitaire de ces commandes (calcul NUMERIC exact en SQL, sans revenu net).
 * Les brouillons non confirmés, les commandes annulées et les visites sans commande sont exclus du CA.
 */
export async function getDayCounters(workDayId: string): Promise<DayCounters> {
  const rows = await prisma.$queryRaw<
    { planned: bigint; visited: bigint; orders_count: bigint; revenue: string }[]
  >`
    SELECT
      (SELECT count(*) FROM public.work_day_customers c
        WHERE c.work_day_id = ${workDayId}::uuid AND c.removed_at IS NULL) AS planned,
      (SELECT count(*) FROM public.visits v
        JOIN public.work_day_customers c
          ON c.work_day_id = v.work_day_id AND c.customer_id = v.customer_id AND c.removed_at IS NULL
        WHERE v.work_day_id = ${workDayId}::uuid AND v.status IN ('commandee', 'sans_commande')) AS visited,
      (SELECT count(*) FROM public.orders o
        WHERE o.work_day_id = ${workDayId}::uuid AND o.confirmed_at IS NOT NULL AND o.status <> 'annulee') AS orders_count,
      (SELECT COALESCE(SUM(i.quantity * i.unit_price), 0)::text
        FROM public.orders o JOIN public.order_items i ON i.order_id = o.id
        WHERE o.work_day_id = ${workDayId}::uuid AND o.confirmed_at IS NOT NULL AND o.status <> 'annulee') AS revenue
  `;
  const r = rows[0];
  return {
    plannedCustomers: Number(r.planned),
    visitedCustomers: Number(r.visited),
    confirmedOrders: Number(r.orders_count),
    revenue: r.revenue,
  };
}

/** Journée appartenant à ce pré-vendeur (null sinon : une journée d'autrui est « introuvable »). */
export function getOwnDay(vendeurId: string, dayId: string) {
  return prisma.workDay.findFirst({ where: { id: dayId, vendeurId } });
}

/** Clients de la journée avec l'état de leur visite, recherche serveur + pagination. */
export async function listDayCustomers(workDayId: string, q: string, page: number) {
  const where: Prisma.WorkDayCustomerWhereInput = {
    workDayId,
    removedAt: null,
    ...(q
      ? {
          customer: {
            OR: [
              { businessName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { address: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
  const [total, entries] = await Promise.all([
    prisma.workDayCustomer.count({ where }),
    prisma.workDayCustomer.findMany({
      where,
      orderBy: [{ customer: { businessName: "asc" } }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        source: true,
        customer: { select: { id: true, businessName: true, phone: true, address: true, googleMapsUrl: true } },
      },
    }),
  ]);
  const visits = await prisma.visit.findMany({
    where: { workDayId, customerId: { in: entries.map((e) => e.customer.id) } },
    select: { customerId: true, status: true, noOrderReason: true },
  });
  const byCustomer = new Map(visits.map((v) => [v.customerId, v]));
  return { total, rows: entries.map((e) => ({ ...e, visit: byCustomer.get(e.customer.id) ?? null })) };
}

/** Tous les clients accessibles (pour « Afficher tous les clients » / « Ajouter un client »). */
export async function listAllCustomers(vendeurId: string, workDayId: string, q: string, page: number) {
  const where: Prisma.CustomerWhereInput = {
    ...accessibleCustomerWhere(vendeurId),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: [{ businessName: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, businessName: true, phone: true, address: true },
    }),
  ]);
  const inDay = await prisma.workDayCustomer.findMany({
    where: { workDayId, removedAt: null, customerId: { in: customers.map((c) => c.id) } },
    select: { customerId: true },
  });
  const set = new Set(inDay.map((x) => x.customerId));
  return { total, rows: customers.map((c) => ({ ...c, inDay: set.has(c.id) })) };
}

/** Stock vendable par variante (lots non expirés) — information affichée, la réservation se fait à la clôture. */
async function availableStock(variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ variant_id: string; qty: bigint }[]>`
    SELECT variant_id::text AS variant_id, COALESCE(SUM(available_quantity), 0) AS qty
    FROM public.stock_lots
    WHERE variant_id = ANY(${variantIds}::uuid[])
      AND available_quantity > 0 AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
    GROUP BY variant_id
  `;
  return new Map(rows.map((r) => [r.variant_id, Number(r.qty)]));
}

export type CatalogVariant = {
  id: string;
  name: string;
  isDefault: boolean;
  imageUrl: string | null;
  price: string | null;
  stock: number;
  orderable: boolean;
  reason: string | null;
};
export type CatalogProduct = {
  id: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  variants: CatalogVariant[];
};

/** Produits actifs (recherche serveur sur produit ou parfum) avec prix effectif, stock et disponibilité. */
export async function listCatalog(q: string, limit: number) {
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    variants: { some: { isActive: true } },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { variants: { some: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
      select: {
        id: true, name: true, saleUnit: true, salePrice: true, imageSecureUrl: true,
        variants: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, salePrice: true, imageSecureUrl: true },
        },
      },
    }),
  ]);
  const stock = await availableStock(products.flatMap((p) => p.variants.map((v) => v.id)));
  return { total, products, stock };
}

/** Lignes actuelles de la commande active d'une visite (pour préremplir le formulaire et le récapitulatif). */
export function getActiveOrderForVisit(visitId: string) {
  return prisma.order.findFirst({
    where: { visitId, status: { not: "annulee" } },
    include: { items: { orderBy: [{ productNameSnapshot: "asc" }, { flavorNameSnapshot: "asc" }] } },
  });
}

export { effectiveSalePrice };
