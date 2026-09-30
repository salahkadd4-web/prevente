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

/**
 * MARGE BRUTE (et non « bénéfice net ») — règle documentée, appliquée en SQL :
 *  - Périmètre : mêmes commandes que le CA (statut « livrée », rattachées à la période par leur date de
 *    passage à « livrée », une seule date par commande) → jamais de double comptage.
 *  - Revenu d'une ligne = unit_price × quantity (instantané de la commande, jamais le catalogue actuel).
 *  - Coût d'une ligne = Σ (quantité allouée × stock_lots.unit_cost) sur ses allocations réelles
 *    (order_item_allocations non libérées) : une ligne prélevée sur plusieurs lots est coûtée lot par lot.
 *  - Une ligne est « coûtée » seulement si TOUTE sa quantité est couverte par des allocations dont le lot a
 *    un prix d'achat. Sinon elle est comptée dans `uncostedLines` et exclue de la marge : aucun coût n'est
 *    inventé (commandes antérieures au suivi des allocations, lots sans prix d'achat).
 *  - Aucun frais, remise ou remboursement n'est enregistré dans la base : la mesure est donc une marge
 *    brute (CA − coût d'achat), pas un bénéfice net.
 */
export type MarginSummary =
  | {
      available: true;
      /** CA et coût des seules lignes entièrement coûtées. */
      costedRevenue: number;
      cost: number;
      margin: number;
      costedLines: number;
      /** Lignes livrées dont le coût est incomplet (exclues de la marge). */
      uncostedLines: number;
      /** CA de ces lignes exclues. */
      uncostedRevenue: number;
    }
  | { available: false; reason: "migration" };

type RawMargin = {
  costed_revenue: number; cost: number; costed_lines: number; uncosted_lines: number; uncosted_revenue: number;
};

export async function getMarginSummary(period: Period): Promise<MarginSummary> {
  try {
    const rows = await prisma.$queryRaw<RawMargin[]>`
      WITH delivered AS (
        SELECT o.id, COALESCE(h.delivered_at, o.updated_at) AS delivered_at
        FROM public.orders o
        LEFT JOIN LATERAL (
          SELECT MAX(s.created_at) AS delivered_at
          FROM public.order_status_history s
          WHERE s.order_id = o.id AND s.to_status = 'livree'
        ) h ON TRUE
        WHERE o.status = 'livree'
      ),
      lines AS (
        SELECT oi.id, oi.quantity, oi.unit_price
        FROM delivered d
        JOIN public.order_items oi ON oi.order_id = d.id
        WHERE d.delivered_at >= ${period.start} AND d.delivered_at < ${period.end}
      ),
      alloc AS (
        SELECT a.order_item_id,
               SUM(a.quantity) FILTER (WHERE l.unit_cost IS NOT NULL) AS costed_qty,
               SUM(a.quantity * l.unit_cost) FILTER (WHERE l.unit_cost IS NOT NULL) AS cost
        FROM public.order_item_allocations a
        JOIN public.stock_lots l ON l.id = a.lot_id
        WHERE a.released_at IS NULL
        GROUP BY a.order_item_id
      ),
      joined AS (
        SELECT ln.quantity, ln.unit_price, COALESCE(al.cost, 0) AS cost,
               (COALESCE(al.costed_qty, 0) = ln.quantity) AS fully_costed
        FROM lines ln LEFT JOIN alloc al ON al.order_item_id = ln.id
      )
      SELECT
        COALESCE(SUM(quantity * unit_price) FILTER (WHERE fully_costed), 0)::float8 AS costed_revenue,
        COALESCE(SUM(cost) FILTER (WHERE fully_costed), 0)::float8 AS cost,
        (COUNT(*) FILTER (WHERE fully_costed))::int AS costed_lines,
        (COUNT(*) FILTER (WHERE NOT fully_costed))::int AS uncosted_lines,
        COALESCE(SUM(quantity * unit_price) FILTER (WHERE NOT fully_costed), 0)::float8 AS uncosted_revenue
      FROM joined
    `;
    const r = rows[0];
    return {
      available: true,
      costedRevenue: r.costed_revenue,
      cost: r.cost,
      margin: r.costed_revenue - r.cost,
      costedLines: r.costed_lines,
      uncostedLines: r.uncosted_lines,
      uncostedRevenue: r.uncosted_revenue,
    };
  } catch (e) {
    // Colonne stock_lots.unit_cost absente : la migration 005 n'est pas appliquée.
    if (e instanceof Error && /unit_cost|does not exist/i.test(e.message)) return { available: false, reason: "migration" };
    throw e;
  }
}
