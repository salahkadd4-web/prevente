import "server-only";

import { OrderStatus } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { Period } from "@/lib/period";
import { alertLimitDate } from "@/lib/stock/expiry";

/**
 * RÈGLE DE CALCUL DU CHIFFRE D'AFFAIRES (documentée ici, appliquée en SQL) :
 *  - CA réalisé = somme de (unit_price × quantity) des lignes de commandes
 *    au statut « livrée ». Prix et quantités viennent des lignes de commande
 *    (jamais du catalogue actuel). Brouillons, en cours et annulées sont exclus.
 *  - Date de rattachement à la période = date du dernier passage au statut
 *    « livrée » dans order_status_history ; à défaut (commande livrée sans
 *    historique), orders.updated_at.
 *  - Une commande est rattachée au pré-vendeur qui l'a créée (orders.created_by_id).
 *  - Pas de double comptage : les lignes sont d'abord totalisées par commande,
 *    puis les commandes par pré-vendeur ; l'historique est réduit à UNE date
 *    par commande (MAX) avant la jointure.
 * Les commandes « par statut » sont comptées par date de création.
 */

export type VendorRevenueRow = {
  id: string;
  fullName: string;
  isActive: boolean;
  deliveredOrders: number;
  revenue: number;
};

type RawVendorRow = { id: string; full_name: string; is_active: boolean; orders: number; revenue: number };

export async function getVendorRevenue(period: Period): Promise<VendorRevenueRow[]> {
  const rows = await prisma.$queryRaw<RawVendorRow[]>`
    WITH delivered AS (
      SELECT o.id, o.created_by_id,
             COALESCE(h.delivered_at, o.updated_at) AS delivered_at
      FROM public.orders o
      LEFT JOIN LATERAL (
        SELECT MAX(s.created_at) AS delivered_at
        FROM public.order_status_history s
        WHERE s.order_id = o.id AND s.to_status = 'livree'
      ) h ON TRUE
      WHERE o.status = 'livree'
    ),
    totals AS (
      SELECT d.id, d.created_by_id, SUM(oi.unit_price * oi.quantity) AS total
      FROM delivered d
      JOIN public.order_items oi ON oi.order_id = d.id
      WHERE d.delivered_at >= ${period.start} AND d.delivered_at < ${period.end}
      GROUP BY d.id, d.created_by_id
    )
    SELECT p.id::text AS id, p.full_name, p.is_active,
           COUNT(t.id)::int AS orders,
           COALESCE(SUM(t.total), 0)::float8 AS revenue
    FROM public.profiles p
    LEFT JOIN totals t ON t.created_by_id = p.id
    WHERE p.role = 'vendeur' OR t.id IS NOT NULL
    GROUP BY p.id, p.full_name, p.is_active
    HAVING p.is_active OR COUNT(t.id) > 0
    ORDER BY p.full_name ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    isActive: r.is_active,
    deliveredOrders: r.orders,
    revenue: r.revenue,
  }));
}

export async function getOrderCountsByStatus(period: Period): Promise<Record<OrderStatus, number>> {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: period.start, lt: period.end } },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const g of grouped) counts[g.status] = g._count._all;
  return counts;
}

export type StockStats = {
  /** Lots avec du stock qui expirent dans les 3 mois (hors expirés). */
  expiringSoon: number;
  /** Lots avec du stock déjà expirés. */
  expired: number;
  /** Parfums actifs (produit actif) sans aucune quantité disponible. */
  outOfStock: number;
  /** Parfums actifs (produit actif) avec du stock. */
  inStock: number;
};

export async function getStockStats(now = new Date()): Promise<StockStats> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const limit = alertLimitDate(now);
  const [expired, expiringSoon, variantRows] = await Promise.all([
    prisma.stockLot.count({ where: { availableQuantity: { gt: 0 }, expiresAt: { lt: today } } }),
    prisma.stockLot.count({ where: { availableQuantity: { gt: 0 }, expiresAt: { gte: today, lte: limit } } }),
    prisma.$queryRaw<{ in_stock: number; out_of_stock: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(s.qty, 0) > 0)::int AS in_stock,
        COUNT(*) FILTER (WHERE COALESCE(s.qty, 0) = 0)::int AS out_of_stock
      FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id AND p.is_active
      LEFT JOIN (
        SELECT variant_id, SUM(available_quantity) AS qty
        FROM public.stock_lots GROUP BY variant_id
      ) s ON s.variant_id = v.id
      WHERE v.is_active
    `,
  ]);
  return {
    expired,
    expiringSoon,
    inStock: variantRows[0]?.in_stock ?? 0,
    outOfStock: variantRows[0]?.out_of_stock ?? 0,
  };
}

export async function getActiveCounts() {
  const [customers, products, users] = await Promise.all([
    prisma.customer.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.profile.count({ where: { isActive: true, role: { in: ["vendeur", "livreur"] } } }),
  ]);
  return { customers, products, users };
}
