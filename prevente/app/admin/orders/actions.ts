"use server";

import { revalidatePath } from "next/cache";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { InsufficientStockError, releaseStockForOrder, reserveStockForOrder } from "@/lib/admin/order-stock";
import { isUuid, optionalText, text, type ActionResult } from "@/lib/form";
import { ASSIGNABLE_STATUSES, ORDER_STATUS_LABEL, canTransition } from "@/lib/orders";

const TX = { maxWait: 10_000, timeout: 20_000 } as const;

function refresh(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/stock");
}

/** Verrouille la ligne de commande pour la durée de la transaction (sérialise les actions concurrentes). */
async function lockOrder(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: string) {
  const rows = await tx.$queryRaw<{ status: OrderStatus }[]>`
    SELECT status::text AS status FROM public.orders WHERE id = ${id}::uuid FOR UPDATE
  `;
  return rows[0]?.status ?? null;
}

/** Journée de pré-vendeur d'origine (null = commande créée hors module pré-vendeur). */
async function orderWorkDayId(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: string) {
  return (await tx.order.findUnique({ where: { id }, select: { workDayId: true } }))?.workDayId ?? null;
}

class Refusal extends Error {}

/** Table absente : la migration 003 n'a pas encore été appliquée. */
function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || (e instanceof Error && /relation .* does not exist/i.test(e.message));
}

export async function changeOrderStatus(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminAction();
  const id = text(formData, "id");
  const target = text(formData, "status");
  const note = optionalText(formData, "note");

  if (!isUuid(id)) return { error: "Commande invalide." };
  if (!(Object.values(OrderStatus) as string[]).includes(target)) return { error: "Statut invalide." };
  if (note && note.length > 300) return { error: "Note : 300 caractères max." };
  const to = target as OrderStatus;
  // « Assignée » ne s'obtient qu'en affectant un livreur.
  if (to === "assignee") return { error: "Pour passer à « Assignée », affectez un livreur." };

  try {
    await prisma.$transaction(async (tx) => {
      const from = await lockOrder(tx, id);
      if (!from) throw new Refusal("Commande introuvable.");
      if (!canTransition(from, to)) {
        throw new Refusal(`Passage de « ${ORDER_STATUS_LABEL[from]} » à « ${ORDER_STATUS_LABEL[to]} » non autorisé.`);
      }

      if (to === "en_livraison" || to === "livree") {
        const active = await tx.orderAssignment.count({ where: { orderId: id, unassignedAt: null } });
        if (active === 0) throw new Refusal("Affectez d'abord un livreur à cette commande.");
      }

      if (from === "brouillon" && to === "en_attente") {
        // Commande d'une journée de pré-vendeur : seule la clôture de la journée la transmet (après
        // confirmation par le pré-vendeur), jamais une validation admin anticipée.
        if (await orderWorkDayId(tx, id)) {
          throw new Refusal("Cette commande sera transmise automatiquement à la clôture de la journée du pré-vendeur.");
        }
        const lines = await tx.orderItem.count({ where: { orderId: id } });
        if (lines === 0) throw new Refusal("Une commande sans ligne ne peut pas être validée.");
        await reserveStockForOrder(tx, id);
      }
      if (to === "annulee") await releaseStockForOrder(tx, id);

      // Livraison en cours terminée par l'admin (annulée ou livrée à la main) : la tentative du livreur
      // est refermée « interrompue » (ni livrée ni échec du livreur), sinon elle resterait ouverte à vie.
      if (from === "en_livraison") {
        await tx.deliveryAttempt.updateMany({
          where: { orderId: id, result: "en_cours" },
          data: { result: "interrompue", endedAt: new Date() },
        });
      }

      await tx.order.update({ where: { id }, data: { status: to } });
      await tx.orderStatusHistory.create({
        data: { orderId: id, fromStatus: from, toStatus: to, changedById: admin.id, note },
      });
    }, TX);
  } catch (e) {
    if (e instanceof Refusal) return { error: e.message };
    if (e instanceof InsufficientStockError) {
      const detail = e.shortages.map((s) => `${s.label} (manque ${s.missing}, disponible ${s.available})`).join(" ; ");
      return { error: `Stock insuffisant : ${detail}.` };
    }
    if (isMissingTable(e)) {
      return { error: "Suivi du stock indisponible : la migration 003 n'est pas appliquée sur la base." };
    }
    console.error("[changeOrderStatus]", e instanceof Error ? e.message : e);
    return { error: "Changement de statut impossible. Réessayez." };
  }

  refresh(id);
  return { ok: `Statut : ${ORDER_STATUS_LABEL[to]}.` };
}

export async function assignDriver(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminAction();
  const id = text(formData, "id");
  const driverId = text(formData, "driverId");
  if (!isUuid(id)) return { error: "Commande invalide." };
  if (!isUuid(driverId)) return { error: "Choisissez un livreur." };

  try {
    await prisma.$transaction(async (tx) => {
      const status = await lockOrder(tx, id);
      if (!status) throw new Refusal("Commande introuvable.");
      if (!ASSIGNABLE_STATUSES.includes(status)) {
        throw new Refusal(`Impossible d'affecter une commande « ${ORDER_STATUS_LABEL[status]} ».`);
      }

      const driver = await tx.profile.findUnique({ where: { id: driverId }, select: { role: true, isActive: true } });
      if (!driver || driver.role !== "livreur" || !driver.isActive) {
        throw new Refusal("Ce livreur n'existe pas ou est désactivé.");
      }

      const current = await tx.orderAssignment.findFirst({ where: { orderId: id, unassignedAt: null } });
      if (current?.driverId === driverId) throw new Refusal("Cette commande est déjà affectée à ce livreur.");

      // Réaffectation : on clôture l'ancienne ligne puis on en crée une (l'historique est conservé).
      if (current) await tx.orderAssignment.update({ where: { id: current.id }, data: { unassignedAt: new Date() } });
      await tx.orderAssignment.create({ data: { orderId: id, driverId, assignedById: admin.id } });

      if (status === "en_attente") {
        await tx.order.update({ where: { id }, data: { status: "assignee" } });
        await tx.orderStatusHistory.create({
          data: { orderId: id, fromStatus: "en_attente", toStatus: "assignee", changedById: admin.id, note: "Livreur affecté" },
        });
      } else {
        await tx.order.update({ where: { id }, data: { updatedAt: new Date() } });
      }
    }, TX);
  } catch (e) {
    if (e instanceof Refusal) return { error: e.message };
    console.error("[assignDriver]", e instanceof Error ? e.message : e);
    return { error: "Affectation impossible. Réessayez." };
  }

  refresh(id);
  return { ok: "Livreur affecté." };
}
