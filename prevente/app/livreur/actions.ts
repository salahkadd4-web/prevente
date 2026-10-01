"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireLivreurAction } from "@/lib/auth/session";
import { isUniqueViolation, isUuid, text, type ActionResult } from "@/lib/form";
import { TX, Refusal, type Tx } from "@/lib/presale/server";
import {
  FAILURE_REASON_LABEL, checkFinish, checkStart, parseFailure,
  type DeliveryContext, type OrderStatusKey, type WorkDayStatusKey,
} from "@/lib/livreur/rules";
import { eligibleWhere } from "@/lib/livreur/queries";

// ---------------------------------------------------------------------------------------------
// Règles (toutes appliquées ici, côté serveur — l'interface n'est jamais une protection) :
//  - chaque action relit le rôle depuis la session (livreur actif) ;
//  - la ligne de la commande est verrouillée (FOR UPDATE) : deux clics / deux onglets sont sérialisés ;
//  - statut, affectation, journée clôturée et tentative ouverte sont RELUS en base dans la transaction ;
//    seul l'identifiant de la commande (et le motif / commentaire d'un échec) vient du navigateur ;
//  - aucun prix, total, statut ou date n'est lu depuis le navigateur ;
//  - le STOCK n'est jamais touché ici : il est réservé à la clôture de la journée du pré-vendeur
//    (voir app/vendeur/actions.ts) et restitué à l'annulation — la livraison ne change rien.
// ---------------------------------------------------------------------------------------------

function refresh(orderId: string) {
  revalidatePath("/livreur", "layout");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/dashboard");
}

function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022" || (e instanceof Error && /does not exist/i.test(e.message));
}

function fail(e: unknown, label: string): ActionResult {
  if (e instanceof Refusal) return { error: e.message };
  if (isMissingTable(e)) return { error: "Module livreur indisponible : la migration 007 n'est pas appliquée sur la base." };
  console.error(`[${label}]`, e instanceof Error ? e.message : e);
  return { error: "Opération impossible. Réessayez." };
}

/** Verrouille la commande puis relit TOUT ce qui conditionne la livraison. */
async function lockDeliveryContext(tx: Tx, orderId: string): Promise<DeliveryContext> {
  const rows = await tx.$queryRaw<{ status: OrderStatusKey; work_day_id: string | null }[]>`
    SELECT status::text AS status, work_day_id::text AS work_day_id
    FROM public.orders WHERE id = ${orderId}::uuid FOR UPDATE
  `;
  const order = rows[0];
  if (!order) throw new Refusal("Commande introuvable ou non affectée à votre compte.");

  const [assignment, day, open] = await Promise.all([
    tx.orderAssignment.findFirst({ where: { orderId, unassignedAt: null }, select: { driverId: true } }),
    order.work_day_id
      ? tx.workDay.findUnique({ where: { id: order.work_day_id }, select: { status: true } })
      : Promise.resolve(null),
    tx.deliveryAttempt.findFirst({ where: { orderId, result: "en_cours" }, select: { id: true, driverId: true } }),
  ]);
  return {
    status: order.status,
    workDayStatus: (day?.status ?? null) as WorkDayStatusKey | null,
    assignedDriverId: assignment?.driverId ?? null,
    openAttemptDriverId: open?.driverId ?? null,
  };
}

function orderIdOf(formData: FormData): string | null {
  const id = text(formData, "orderId");
  return isUuid(id) ? id : null;
}

/**
 * « Commencer la livraison » : assignee → en_livraison + nouvelle tentative `en_cours` (heure de début).
 * Une tentative restée ouverte par un ANCIEN livreur (réaffectation admin en cours de livraison) est
 * refermée « interrompue » (ni livrée ni échec). Double démarrage : refusé (et index unique en base).
 */
export async function startDelivery(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const driver = await requireLivreurAction();
  const orderId = orderIdOf(formData);
  if (!orderId) return { error: "Commande invalide." };

  try {
    await prisma.$transaction(async (tx) => {
      const ctx = await lockDeliveryContext(tx, orderId);
      const check = checkStart(ctx, driver.id);
      if (!check.ok) throw new Refusal(check.error);

      const now = new Date();
      if (check.takeover) {
        await tx.deliveryAttempt.updateMany({
          where: { orderId, result: "en_cours" },
          data: { result: "interrompue", endedAt: now },
        });
      }
      await tx.deliveryAttempt.create({ data: { orderId, driverId: driver.id, startedAt: now } });
      await tx.order.update({ where: { id: orderId }, data: { status: "en_livraison" } });
      await tx.orderStatusHistory.create({
        data: {
          orderId, fromStatus: ctx.status, toStatus: "en_livraison", changedById: driver.id,
          note: check.takeover ? "Livraison reprise par le livreur après réaffectation" : "Livraison démarrée par le livreur",
        },
      });
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "La livraison de cette commande est déjà en cours." };
    return fail(e, "startDelivery");
  }

  refresh(orderId);
  return { ok: "Livraison commencée." };
}

/**
 * « Confirmer la livraison » : toutes les conditions sont revalidées. Une seule transaction :
 * tentative → `livree` (+ heure réelle), commande en_livraison → livree, historique de statut.
 * Idempotent : une commande déjà livrée par ce livreur (double clic, deuxième onglet) ne change RIEN
 * (ni statut, ni date, ni chiffre d'affaires) ; l'index unique partiel est la dernière barrière.
 * Paiement : aucun suivi de paiement n'existe dans le modèle métier → rien n'est enregistré.
 */
export async function confirmDelivery(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const driver = await requireLivreurAction();
  const orderId = orderIdOf(formData);
  if (!orderId) return { error: "Commande invalide." };

  let already = false;
  try {
    await prisma.$transaction(async (tx) => {
      const ctx = await lockDeliveryContext(tx, orderId);
      if (ctx.status === "livree" && ctx.assignedDriverId === driver.id) {
        const mine = await tx.deliveryAttempt.count({ where: { orderId, driverId: driver.id, result: "livree" } });
        if (mine > 0) { already = true; return; }
      }
      const check = checkFinish(ctx, driver.id);
      if (!check.ok) throw new Refusal(check.error);

      const now = new Date();
      const closed = await tx.deliveryAttempt.updateMany({
        where: { orderId, driverId: driver.id, result: "en_cours" },
        data: { result: "livree", endedAt: now },
      });
      if (closed.count !== 1) throw new Refusal("Commencez d'abord la livraison de cette commande.");
      await tx.order.update({ where: { id: orderId }, data: { status: "livree" } });
      await tx.orderStatusHistory.create({
        data: { orderId, fromStatus: "en_livraison", toStatus: "livree", changedById: driver.id, note: "Livraison confirmée par le livreur" },
      });
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: "Cette livraison était déjà confirmée." };
    return fail(e, "confirmDelivery");
  }

  refresh(orderId);
  return { ok: already ? "Cette livraison était déjà confirmée." : "Livraison confirmée." };
}

/**
 * « Livraison non effectuée » (motif obligatoire). Règle retenue : la commande RESTE AFFECTÉE au même
 * livreur et repasse « assignee » (nouvelle tentative possible, ou réaffectation par l'admin) ; la
 * tentative est conservée avec son motif et son commentaire. Aucun impact sur le chiffre d'affaires
 * livré. Le motif est visible de l'admin dans l'historique des statuts de la commande.
 */
export async function failDelivery(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const driver = await requireLivreurAction();
  const orderId = orderIdOf(formData);
  if (!orderId) return { error: "Commande invalide." };
  const parsed = parseFailure(text(formData, "reason"), text(formData, "comment"));
  if ("error" in parsed) return { error: parsed.error };

  try {
    await prisma.$transaction(async (tx) => {
      const ctx = await lockDeliveryContext(tx, orderId);
      const check = checkFinish(ctx, driver.id);
      if (!check.ok) throw new Refusal(check.error);

      const closed = await tx.deliveryAttempt.updateMany({
        where: { orderId, driverId: driver.id, result: "en_cours" },
        data: { result: "echec", endedAt: new Date(), failureReason: parsed.reason, comment: parsed.comment },
      });
      if (closed.count !== 1) throw new Refusal("Commencez d'abord la livraison de cette commande.");
      await tx.order.update({ where: { id: orderId }, data: { status: "assignee" } });
      await tx.orderStatusHistory.create({
        data: {
          orderId, fromStatus: "en_livraison", toStatus: "assignee", changedById: driver.id,
          note: `Livraison non effectuée : ${FAILURE_REASON_LABEL[parsed.reason]}${parsed.comment ? ` — ${parsed.comment}` : ""}`,
        },
      });
    }, TX);
  } catch (e) {
    return fail(e, "failDelivery");
  }

  refresh(orderId);
  return { ok: "Livraison non effectuée enregistrée. La commande reste dans vos livraisons à reprendre." };
}

/**
 * « Actualiser les commandes ». Il n'existe aucun système externe : les commandes affectées sont lues
 * DIRECTEMENT dans PostgreSQL à chaque affichage. Ce que fait le bouton : invalider les caches de
 * pages du livreur et relire les compteurs en base (uniquement les commandes affectées ET éligibles,
 * sans rien créer ni modifier : idempotent par construction).
 */
export async function refreshOrders(): Promise<ActionResult> {
  const driver = await requireLivreurAction();
  try {
    const [toDeliver, inProgress] = await Promise.all([
      prisma.order.count({ where: eligibleWhere(driver.id, ["assignee"]) }),
      prisma.order.count({ where: eligibleWhere(driver.id, ["en_livraison"]) }),
    ]);
    revalidatePath("/livreur", "layout");
    const a = `${toDeliver} commande${toDeliver > 1 ? "s" : ""} à livrer`;
    const b = `${inProgress} en cours`;
    return { ok: `Liste actualisée : ${a}, ${b}.` };
  } catch (e) {
    return fail(e, "refreshOrders");
  }
}
