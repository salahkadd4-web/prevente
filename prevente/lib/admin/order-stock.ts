import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { itemLabel } from "@/lib/catalog";

/**
 * Stock et commandes — règles (voir aussi lib/orders.ts) :
 *  - Réservation à la validation (brouillon → en_attente) : le stock est
 *    décrémenté immédiatement, lot par lot en FEFO (expiration la plus proche,
 *    puis réception la plus ancienne). Les lots déjà expirés ne sont jamais
 *    utilisés. Chaque prélèvement est tracé dans order_item_allocations.
 *  - Tout se fait dans la transaction appelante, avec verrou de lignes
 *    (FOR UPDATE) : deux commandes concurrentes ne peuvent pas vendre le même
 *    stock. Si le stock est insuffisant, l'erreur annule toute la transaction.
 *  - Annulation : chaque allocation non libérée est restituée à son lot
 *    d'origine puis marquée libérée (released_at) : impossible de restituer
 *    deux fois, même en cas de double clic ou d'appels concurrents.
 */

export class InsufficientStockError extends Error {
  constructor(public readonly shortages: { label: string; missing: number; available: number }[]) {
    super("Stock insuffisant");
    this.name = "InsufficientStockError";
  }
}

type Tx = Prisma.TransactionClient;

type LotRow = { id: string; available_quantity: number };

export async function reserveStockForOrder(tx: Tx, orderId: string): Promise<void> {
  // Ordre déterministe des verrous (par variante) : évite les interblocages.
  const items = await tx.orderItem.findMany({
    where: { orderId },
    orderBy: { variantId: "asc" },
    select: { id: true, variantId: true, quantity: true, productNameSnapshot: true, flavorNameSnapshot: true },
  });

  const shortages: { label: string; missing: number; available: number }[] = [];

  for (const item of items) {
    const already = await tx.orderItemAllocation.count({ where: { orderItemId: item.id, releasedAt: null } });
    if (already > 0) throw new Error("Stock déjà réservé pour cette commande.");

    const lots = await tx.$queryRaw<LotRow[]>`
      SELECT id::text AS id, available_quantity
      FROM public.stock_lots
      WHERE variant_id = ${item.variantId}::uuid
        AND available_quantity > 0
        AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
      ORDER BY expires_at ASC NULLS LAST, received_at ASC, id ASC
      FOR UPDATE
    `;

    let remaining = item.quantity;
    const takes: { lotId: string; quantity: number }[] = [];
    for (const lot of lots) {
      if (remaining === 0) break;
      const take = Math.min(remaining, lot.available_quantity);
      takes.push({ lotId: lot.id, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      shortages.push({
        label: itemLabel(item.productNameSnapshot, item.flavorNameSnapshot, " ").trim(),
        missing: remaining,
        available: item.quantity - remaining,
      });
      continue;
    }

    for (const t of takes) {
      await tx.stockLot.update({ where: { id: t.lotId }, data: { availableQuantity: { decrement: t.quantity } } });
      await tx.orderItemAllocation.create({ data: { orderItemId: item.id, lotId: t.lotId, quantity: t.quantity } });
    }
  }

  if (shortages.length > 0) throw new InsufficientStockError(shortages);
}

/** Restitue le stock réservé (une seule fois par allocation). Retourne le nombre d'allocations libérées. */
export async function releaseStockForOrder(tx: Tx, orderId: string): Promise<number> {
  const allocations = await tx.$queryRaw<{ id: string; lot_id: string; quantity: number }[]>`
    SELECT a.id::text AS id, a.lot_id::text AS lot_id, a.quantity
    FROM public.order_item_allocations a
    JOIN public.order_items i ON i.id = a.order_item_id
    WHERE i.order_id = ${orderId}::uuid AND a.released_at IS NULL
    ORDER BY a.lot_id
    FOR UPDATE OF a
  `;

  let released = 0;
  for (const a of allocations) {
    // Garde anti double restitution : seule la ligne encore non libérée est marquée.
    const marked = await tx.orderItemAllocation.updateMany({
      where: { id: a.id, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    if (marked.count !== 1) continue;
    await tx.stockLot.update({ where: { id: a.lot_id }, data: { availableQuantity: { increment: a.quantity } } });
    released += 1;
  }
  return released;
}
