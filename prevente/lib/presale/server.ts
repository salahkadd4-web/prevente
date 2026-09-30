import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

/** Options de transaction alignées sur app/admin/orders/actions.ts. */
export const TX = { maxWait: 10_000, timeout: 20_000 } as const;

/** Refus métier : message affichable tel quel au pré-vendeur. */
export class Refusal extends Error {}

/**
 * Clients que ce pré-vendeur peut consulter et visiter. Règle actuelle : tous les clients ACTIFS
 * (comme l'admin). Point unique à durcir si un client doit un jour être réservé à un pré-vendeur :
 * toutes les recherches et tous les contrôles d'ajout passent par ici.
 */
export function accessibleCustomerWhere(vendeurId: string): Prisma.CustomerWhereInput {
  void vendeurId; // réservé : aucune restriction par pré-vendeur pour l'instant
  return { isActive: true };
}

/**
 * Verrouille la journée (FOR UPDATE : sérialise les actions concurrentes, double clic compris),
 * vérifie qu'elle appartient au pré-vendeur connecté et qu'elle est encore ouverte.
 * « Introuvable » pour une journée d'autrui : on ne révèle pas son existence.
 */
export async function lockOpenDay(tx: Tx, dayId: string, vendeurId: string) {
  const row = await lockDay(tx, dayId, vendeurId);
  if (row.status !== "ouverte") throw new Refusal("La journée est clôturée : aucune modification n'est possible.");
  return row;
}

export async function lockDay(tx: Tx, dayId: string, vendeurId: string) {
  const rows = await tx.$queryRaw<{ vendeur_id: string; status: "ouverte" | "cloturee"; work_date: Date }[]>`
    SELECT vendeur_id::text AS vendeur_id, status::text AS status, work_date
    FROM public.work_days WHERE id = ${dayId}::uuid FOR UPDATE
  `;
  const row = rows[0];
  if (!row || row.vendeur_id !== vendeurId) throw new Refusal("Journée introuvable.");
  return row;
}

/** Le client doit être actif, accessible à ce pré-vendeur et présent (non retiré) dans la journée. */
export async function requireDayCustomer(tx: Tx, dayId: string, customerId: string, vendeurId: string) {
  const entry = await tx.workDayCustomer.findUnique({
    where: { workDayId_customerId: { workDayId: dayId, customerId } },
    select: { removedAt: true, customer: { select: { id: true, isActive: true } } },
  });
  if (!entry || entry.removedAt) throw new Refusal("Ce client ne fait pas partie de la journée.");
  const ok = await tx.customer.count({ where: { id: customerId, ...accessibleCustomerWhere(vendeurId) } });
  if (ok === 0) throw new Refusal("Ce client n'est plus accessible.");
  return entry;
}
