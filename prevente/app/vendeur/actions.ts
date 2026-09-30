"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireVendeurAction } from "@/lib/auth/session";
import { InsufficientStockError, reserveStockForOrder } from "@/lib/admin/order-stock";
import { itemLabel } from "@/lib/catalog";
import { parseCustomerForm } from "@/lib/customers";
import { isUniqueViolation, isUuid, text, type ActionResult } from "@/lib/form";
import { effectiveSalePrice } from "@/lib/pricing";
import { toCents } from "@/lib/presale/money";
import { isFriday, isoWeekday, todayAlgiers, workDateValue } from "@/lib/presale/dates";
import { isNoOrderReason, parseOrderLines } from "@/lib/presale/rules";
import { TX, Refusal, accessibleCustomerWhere, lockDay, lockOpenDay, requireDayCustomer, type Tx } from "@/lib/presale/server";
import { getDayCounters } from "@/lib/presale/queries";

// ---------------------------------------------------------------------------------------------
// Règles (toutes appliquées ici, côté serveur — l'interface n'est jamais une protection) :
//  - chaque action relit le rôle depuis la session et vérifie que la journée appartient au
//    pré-vendeur connecté ; une journée clôturée refuse toute modification ;
//  - chaque mutation verrouille la ligne de la journée (FOR UPDATE) : pas de course entre deux
//    clics / deux onglets ;
//  - prix, noms, unités et totaux sont relus en base : seuls les identifiants et quantités
//    envoyés par le navigateur sont pris en compte.
// ---------------------------------------------------------------------------------------------

const dayPath = (dayId: string) => `/vendeur/jour/${dayId}`;

function refresh(dayId: string) {
  revalidatePath("/vendeur/dashboard");
  revalidatePath(dayPath(dayId), "layout");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/workdays");
}

function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022" || (e instanceof Error && /does not exist/i.test(e.message));
}

function fail(e: unknown, label: string): ActionResult {
  if (e instanceof Refusal) return { error: e.message };
  if (e instanceof InsufficientStockError) {
    const detail = e.shortages.map((s) => `${s.label} (manque ${s.missing}, disponible ${s.available})`).join(" ; ");
    return { error: `Stock insuffisant : ${detail}.` };
  }
  if (isMissingTable(e)) return { error: "Module pré-vendeur indisponible : la migration 006 n'est pas appliquée sur la base." };
  console.error(`[${label}]`, e instanceof Error ? e.message : e);
  return { error: "Opération impossible. Réessayez." };
}

function ids(formData: FormData): { dayId: string; customerId: string } | null {
  const dayId = text(formData, "dayId");
  const customerId = text(formData, "customerId");
  return isUuid(dayId) && isUuid(customerId) ? { dayId, customerId } : null;
}

async function ownVisit(tx: Tx, dayId: string, customerId: string, vendeurId: string) {
  const visit = await tx.visit.findUnique({ where: { workDayId_customerId: { workDayId: dayId, customerId } } });
  if (!visit || visit.vendeurId !== vendeurId) throw new Refusal("Commencez d'abord la visite de ce client.");
  return visit;
}

const activeOrder = (tx: Tx, visitId: string) =>
  tx.order.findFirst({ where: { visitId, status: { not: "annulee" } }, include: { items: true } });

// ---------------------------------------------------------------------------------------------
// Journée
// ---------------------------------------------------------------------------------------------

/**
 * Démarre la journée du jour (date d'Algérie, calculée côté serveur). Idempotent : une journée
 * existante est simplement réutilisée (contrainte d'unicité pré-vendeur + date en base).
 * Charge les clients du planning hebdomadaire — jamais le vendredi, jamais de planning par défaut.
 */
export async function startDay(): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const iso = todayAlgiers();

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.workDay.findUnique({
        where: { vendeurId_workDate: { vendeurId: vendeur.id, workDate: workDateValue(iso) } },
        select: { id: true },
      });
      if (existing) return;

      const day = await tx.workDay.create({ data: { vendeurId: vendeur.id, workDate: workDateValue(iso) } });
      if (isFriday(iso)) return;

      const planned = await tx.customerSchedule.findMany({
        where: { vendeurId: vendeur.id, weekday: isoWeekday(iso), customer: accessibleCustomerWhere(vendeur.id) },
        select: { customerId: true },
      });
      if (planned.length > 0) {
        await tx.workDayCustomer.createMany({
          data: planned.map((p) => ({ workDayId: day.id, customerId: p.customerId, source: "planning" as const })),
          skipDuplicates: true,
        });
      }
    }, TX);
  } catch (e) {
    // Deux démarrages simultanés : la contrainte d'unicité a fait échouer le second, la journée existe.
    if (!isUniqueViolation(e)) return fail(e, "startDay");
  }

  revalidatePath("/vendeur/dashboard");
  return { ok: "Journée démarrée." };
}

/**
 * Clôture. Une seule transaction :
 *  1. refuse si la journée est déjà clôturée ou si une visite est encore « en cours » ;
 *  2. annule les brouillons jamais confirmés (statut « annulée », historique conservé) ;
 *  3. pour chaque commande CONFIRMÉE : réserve le stock en FEFO (logique existante) puis passe
 *     brouillon → en_attente (visible dans le workflow admin/livreur) ;
 *  4. marque la journée « clôturée ».
 * Si le stock manque pour une commande, TOUT est annulé (rien n'est clôturé) et le message
 * indique la commande et les produits concernés.
 */
export async function closeDay(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const dayId = text(formData, "dayId");
  if (!isUuid(dayId)) return { error: "Journée invalide." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, dayId, vendeur.id);

      const pending = await tx.visit.findMany({
        where: { workDayId: dayId, status: "en_cours" },
        select: { customer: { select: { businessName: true } } },
      });
      if (pending.length > 0) {
        const names = pending.slice(0, 5).map((p) => p.customer.businessName).join(", ");
        throw new Refusal(
          `${pending.length} visite${pending.length > 1 ? "s" : ""} en cours (${names}${pending.length > 5 ? "…" : ""}). Terminez-les, reprenez-les sans commande ou annulez-les avant de clôturer.`,
        );
      }

      // Brouillons jamais confirmés : abandonnés, conservés avec le statut « annulée ».
      const abandoned = await tx.order.findMany({
        where: { workDayId: dayId, status: "brouillon", confirmedAt: null },
        select: { id: true },
      });
      for (const o of abandoned) {
        await tx.order.update({ where: { id: o.id }, data: { status: "annulee" } });
        await tx.orderStatusHistory.create({
          data: { orderId: o.id, fromStatus: "brouillon", toStatus: "annulee", changedById: vendeur.id, note: "Brouillon non confirmé abandonné à la clôture" },
        });
      }

      const confirmed = await tx.order.findMany({
        where: { workDayId: dayId, status: "brouillon", confirmedAt: { not: null } },
        orderBy: { number: "asc" },
        select: { id: true, number: true },
      });
      for (const o of confirmed) {
        try {
          await reserveStockForOrder(tx, o.id);
        } catch (e) {
          if (e instanceof InsufficientStockError) {
            const detail = e.shortages.map((s) => `${s.label} (manque ${s.missing}, disponible ${s.available})`).join(" ; ");
            throw new Refusal(`Clôture impossible : stock insuffisant pour la commande #${o.number} — ${detail}. Corrigez les quantités puis clôturez à nouveau.`);
          }
          throw e;
        }
        await tx.order.update({ where: { id: o.id }, data: { status: "en_attente" } });
        await tx.orderStatusHistory.create({
          data: { orderId: o.id, fromStatus: "brouillon", toStatus: "en_attente", changedById: vendeur.id, note: "Clôture de la journée du pré-vendeur" },
        });
      }

      await tx.workDay.update({ where: { id: dayId }, data: { status: "cloturee", closedAt: new Date() } });
    }, TX);
  } catch (e) {
    return fail(e, "closeDay");
  }

  refresh(dayId);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/stock");
  return { ok: "Journée clôturée. Les commandes validées sont transmises." };
}

/**
 * « Synchroniser les commandes du jour ». Toutes les commandes sont déjà écrites directement en
 * base (aucun système externe) : il n'y a donc rien à « pousser ». Ce que le bouton fait
 * réellement : réconcilier les visites avec les commandes persistées (une visite « commandée »
 * sans commande confirmée repasse « en cours » ; une commande confirmée rattache sa visite),
 * puis relire les compteurs en base. Idempotent : un second clic ne change plus rien.
 */
export async function syncDay(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const dayId = text(formData, "dayId");
  if (!isUuid(dayId)) return { error: "Journée invalide." };

  let fixes = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const day = await lockDay(tx, dayId, vendeur.id);
      if (day.status !== "ouverte") return; // clôturée : lecture seule
      const visits = await tx.visit.findMany({ where: { workDayId: dayId } });
      for (const v of visits) {
        const order = await tx.order.findFirst({
          where: { visitId: v.id, status: { not: "annulee" }, confirmedAt: { not: null } },
          select: { id: true },
        });
        if (order && v.status !== "commandee") {
          await tx.visit.update({ where: { id: v.id }, data: { status: "commandee", noOrderReason: null, endedAt: v.endedAt ?? new Date() } });
          fixes += 1;
        } else if (!order && v.status === "commandee") {
          await tx.visit.update({ where: { id: v.id }, data: { status: "en_cours", endedAt: null } });
          fixes += 1;
        }
      }
    }, TX);
    const counters = await getDayCounters(dayId);
    refresh(dayId);
    const n = counters.confirmedOrders;
    const base = `${n} commande${n > 1 ? "s" : ""} confirmée${n > 1 ? "s" : ""} à jour en base`;
    return { ok: fixes > 0 ? `${base} · ${fixes} visite${fixes > 1 ? "s" : ""} corrigée${fixes > 1 ? "s" : ""}.` : `${base}.` };
  } catch (e) {
    return fail(e, "syncDay");
  }
}

// ---------------------------------------------------------------------------------------------
// Clients de la journée
// ---------------------------------------------------------------------------------------------

export async function addCustomerToDay(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) return { error: "Requête invalide." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      const allowed = await tx.customer.count({ where: { id: p.customerId, ...accessibleCustomerWhere(vendeur.id) } });
      if (allowed === 0) throw new Refusal("Client introuvable ou inactif.");

      const entry = await tx.workDayCustomer.findUnique({
        where: { workDayId_customerId: { workDayId: p.dayId, customerId: p.customerId } },
      });
      if (entry && !entry.removedAt) throw new Refusal("Ce client est déjà dans la journée.");
      if (entry) {
        await tx.workDayCustomer.update({ where: { id: entry.id }, data: { removedAt: null, addedAt: new Date() } });
      } else {
        await tx.workDayCustomer.create({ data: { workDayId: p.dayId, customerId: p.customerId, source: "manuel" } });
      }
    }, TX);
  } catch (e) {
    return fail(e, "addCustomerToDay");
  }
  refresh(p.dayId);
  return { ok: "Client ajouté à la journée." };
}

/**
 * Recensement terrain : le pré-vendeur crée un nouveau client (createdById = lui) et l'ajoute à sa
 * journée en cours dans la même transaction. Mêmes validations que l'admin (parseCustomerForm).
 * Refuse un doublon probable (même nom + même téléphone, ou même nom + même adresse) pour qu'il
 * réutilise le client existant au lieu d'en créer un second. Journée ouverte obligatoire.
 */
export async function createCustomerForDay(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const dayId = text(formData, "dayId");
  if (!isUuid(dayId)) return { error: "Journée invalide." };
  const parsed = parseCustomerForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, dayId, vendeur.id);

      const same = { businessName: { equals: data.businessName, mode: "insensitive" as const } };
      const dup = await tx.customer.findFirst({
        where: {
          OR: [
            ...(data.phone ? [{ ...same, phone: data.phone }] : []),
            { ...same, address: { equals: data.address, mode: "insensitive" as const } },
          ],
        },
        select: { businessName: true, isActive: true },
      });
      if (dup) {
        throw new Refusal(
          dup.isActive
            ? `« ${dup.businessName} » existe déjà : retrouvez-le dans « Afficher tous les clients » et ajoutez-le à la journée.`
            : `« ${dup.businessName} » existe déjà mais est désactivé : contactez l'administrateur.`,
        );
      }

      const customer = await tx.customer.create({ data: { ...data, createdById: vendeur.id } });
      await tx.workDayCustomer.create({ data: { workDayId: dayId, customerId: customer.id, source: "manuel" } });
    }, TX);
  } catch (e) {
    return fail(e, "createCustomerForDay");
  }

  refresh(dayId);
  revalidatePath("/admin/customers");
  redirect(`${dayPath(dayId)}/clients?nouveau=1`);
}

/**
 * Retire un client de la journée (removedAt : l'historique reste). Refusé si le client a une visite
 * terminée ou une commande non annulée : il faut d'abord reprendre / annuler.
 */
export async function removeCustomerFromDay(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) return { error: "Requête invalide." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      const entry = await tx.workDayCustomer.findUnique({
        where: { workDayId_customerId: { workDayId: p.dayId, customerId: p.customerId } },
      });
      if (!entry || entry.removedAt) throw new Refusal("Ce client n'est pas dans la journée.");

      const visit = await tx.visit.findUnique({ where: { workDayId_customerId: { workDayId: p.dayId, customerId: p.customerId } } });
      if (visit) {
        const order = await activeOrder(tx, visit.id);
        if (order) throw new Refusal("Ce client a une commande : annulez-la avant de le retirer.");
        if (visit.status === "commandee" || visit.status === "sans_commande") {
          throw new Refusal("Cette visite est terminée : reprenez-la ou annulez-la avant de retirer le client.");
        }
      }
      await tx.workDayCustomer.update({ where: { id: entry.id }, data: { removedAt: new Date() } });
    }, TX);
  } catch (e) {
    return fail(e, "removeCustomerFromDay");
  }
  refresh(p.dayId);
  return { ok: "Client retiré de la journée." };
}

// ---------------------------------------------------------------------------------------------
// Visites
// ---------------------------------------------------------------------------------------------

/** Ouvre (ou retrouve) la visite : une seule par client et par journée (contrainte d'unicité). */
export async function startVisit(formData: FormData): Promise<void> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) redirect("/vendeur/dashboard");

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      await requireDayCustomer(tx, p.dayId, p.customerId, vendeur.id);
      const existing = await tx.visit.findUnique({ where: { workDayId_customerId: { workDayId: p.dayId, customerId: p.customerId } } });
      if (!existing) {
        await tx.visit.create({ data: { workDayId: p.dayId, customerId: p.customerId, vendeurId: vendeur.id } });
      }
    }, TX);
  } catch (e) {
    // Une journée clôturée ou un client retiré ne doit pas bloquer la consultation d'une visite existante.
    if (!(e instanceof Refusal) && !isUniqueViolation(e)) console.error("[startVisit]", e instanceof Error ? e.message : e);
  }
  revalidatePath(dayPath(p.dayId), "layout");
  redirect(`${dayPath(p.dayId)}/visite/${p.customerId}`);
}

/** Terminer sans commande (ou modifier le motif d'une visite déjà terminée sans commande). */
export async function finishWithoutOrder(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) return { error: "Requête invalide." };
  const reason = text(formData, "reason");
  if (!isNoOrderReason(reason)) return { error: "Choisissez un motif." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      await requireDayCustomer(tx, p.dayId, p.customerId, vendeur.id);
      const visit = await ownVisit(tx, p.dayId, p.customerId, vendeur.id);
      if (visit.status === "commandee") throw new Refusal("Une commande existe : annulez-la d'abord pour terminer sans commande.");
      if (await activeOrder(tx, visit.id)) throw new Refusal("Une commande existe pour cette visite : annulez-la d'abord.");
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: "sans_commande", noOrderReason: reason, endedAt: visit.endedAt ?? new Date() },
      });
    }, TX);
  } catch (e) {
    return fail(e, "finishWithoutOrder");
  }
  refresh(p.dayId);
  return { ok: "Visite terminée sans commande." };
}

/** Reprend une visite terminée sans commande ou annulée (retour à « en cours »). */
export async function reopenVisit(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) return { error: "Requête invalide." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      const visit = await ownVisit(tx, p.dayId, p.customerId, vendeur.id);
      if (visit.status !== "sans_commande" && visit.status !== "annulee") {
        throw new Refusal("Cette visite est déjà en cours ou commandée.");
      }
      await tx.visit.update({ where: { id: visit.id }, data: { status: "en_cours", noOrderReason: null, endedAt: null } });
    }, TX);
  } catch (e) {
    return fail(e, "reopenVisit");
  }
  refresh(p.dayId);
  return { ok: "Visite reprise." };
}

/** Annule une visite créée par erreur (statut « annulée », jamais supprimée). Sans commande active. */
export async function cancelVisit(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) return { error: "Requête invalide." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      const visit = await ownVisit(tx, p.dayId, p.customerId, vendeur.id);
      if (visit.status === "annulee") return;
      if (await activeOrder(tx, visit.id)) throw new Refusal("Annulez d'abord la commande de cette visite.");
      await tx.visit.update({ where: { id: visit.id }, data: { status: "annulee", noOrderReason: null, endedAt: new Date() } });
    }, TX);
  } catch (e) {
    return fail(e, "cancelVisit");
  }
  refresh(p.dayId);
  return { ok: "Visite annulée." };
}

// ---------------------------------------------------------------------------------------------
// Commande
// ---------------------------------------------------------------------------------------------

type Sellable = { variantId: string; productName: string; flavorName: string; saleUnit: import("@/app/generated/prisma/enums").SaleUnit; unitPrice: string };

/** Relit le catalogue : variante ET produit actifs, prix de vente défini. Jamais de prix venant du navigateur. */
async function loadSellable(tx: Tx, variantIds: string[]): Promise<Map<string, Sellable>> {
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true, name: true, isActive: true, salePrice: true,
      product: { select: { name: true, isActive: true, saleUnit: true, salePrice: true } },
    },
  });
  const out = new Map<string, Sellable>();
  for (const id of variantIds) {
    const v = variants.find((x) => x.id === id);
    if (!v) throw new Refusal("Un produit de la commande n'existe plus.");
    const label = itemLabel(v.product.name, v.name);
    if (!v.isActive || !v.product.isActive) throw new Refusal(`« ${label} » est inactif et ne peut plus être commandé.`);
    const price = effectiveSalePrice(v, v.product);
    if (price === null) throw new Refusal(`« ${label} » n'a pas de prix de vente défini.`);
    out.set(id, { variantId: id, productName: v.product.name, flavorName: v.name, saleUnit: v.product.saleUnit, unitPrice: price });
  }
  return out;
}

/**
 * « Vérifier la commande » : enregistre les lignes en BASE (brouillon non confirmé, hors CA et
 * compteurs) puis ouvre le récapitulatif. Comme les quantités sont persistées, « Retour à la
 * commande » les retrouve toujours. Modifier une commande déjà confirmée la remet en brouillon :
 * elle doit être reconfirmée (et ne compte plus dans le CA d'ici là).
 */
export async function saveOrderDraft(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) return { error: "Requête invalide." };
  const parsed = parseOrderLines(text(formData, "lines"));
  if ("error" in parsed) return { error: parsed.error };
  if (parsed.lines.length === 0) return { error: "Sélectionnez au moins un produit (quantité supérieure à 0)." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      await requireDayCustomer(tx, p.dayId, p.customerId, vendeur.id);
      const visit = await ownVisit(tx, p.dayId, p.customerId, vendeur.id);
      const catalog = await loadSellable(tx, parsed.lines.map((l) => l.variantId));

      let order = await tx.order.findFirst({ where: { visitId: visit.id, status: { not: "annulee" } } });
      if (order && order.status !== "brouillon") throw new Refusal("Cette commande a déjà été transmise : elle ne peut plus être modifiée.");

      if (!order) {
        order = await tx.order.create({
          data: { customerId: p.customerId, createdById: vendeur.id, status: "brouillon", workDayId: p.dayId, visitId: visit.id },
        });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: null, toStatus: "brouillon", changedById: vendeur.id, note: "Créée par le pré-vendeur" },
        });
      } else {
        await tx.orderItem.deleteMany({ where: { orderId: order.id } }); // brouillon : aucune allocation de stock
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id, fromStatus: "brouillon", toStatus: "brouillon", changedById: vendeur.id,
            note: order.confirmedAt ? "Lignes modifiées après confirmation : à reconfirmer" : "Lignes modifiées",
          },
        });
      }

      await tx.orderItem.createMany({
        data: parsed.lines.map((l) => {
          const c = catalog.get(l.variantId)!;
          return {
            orderId: order.id, variantId: l.variantId, quantity: l.quantity,
            productNameSnapshot: c.productName, flavorNameSnapshot: c.flavorName,
            saleUnitSnapshot: c.saleUnit, unitPrice: c.unitPrice,
          };
        }),
      });
      await tx.order.update({ where: { id: order.id }, data: { confirmedAt: null } });
      await tx.visit.update({ where: { id: visit.id }, data: { status: "en_cours", noOrderReason: null, endedAt: null } });
    }, TX);
  } catch (e) {
    return fail(e, "saveOrderDraft");
  }

  revalidatePath(dayPath(p.dayId), "layout");
  revalidatePath("/vendeur/dashboard");
  redirect(`${dayPath(p.dayId)}/visite/${p.customerId}/recap`);
}

/**
 * « Confirmer la commande ». Revalide tout côté serveur. Idempotent : une commande déjà confirmée
 * (double clic, rafraîchissement, deuxième onglet) ne change rien. Si un prix du catalogue a changé
 * depuis le récapitulatif, les prix sont mis à jour et la confirmation est refusée pour relecture.
 * Le stock n'est PAS touché ici : il est réservé à la clôture de la journée (voir closeDay).
 */
export async function confirmOrder(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) return { error: "Requête invalide." };

  let outcome: "confirmed" | "already" | "prices_changed";
  try {
    outcome = await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      await requireDayCustomer(tx, p.dayId, p.customerId, vendeur.id);
      const visit = await ownVisit(tx, p.dayId, p.customerId, vendeur.id);
      const order = await activeOrder(tx, visit.id);
      if (!order) throw new Refusal("Aucune commande à confirmer.");
      if (order.confirmedAt) return "already" as const;
      if (order.status !== "brouillon") throw new Refusal("Cette commande a déjà été transmise.");
      if (order.items.length === 0) throw new Refusal("Une commande sans ligne ne peut pas être confirmée.");

      const catalog = await loadSellable(tx, order.items.map((i) => i.variantId));
      let changed = false;
      for (const item of order.items) {
        const current = catalog.get(item.variantId)!;
        if (toCents(item.unitPrice.toString()) !== toCents(current.unitPrice)) {
          await tx.orderItem.update({ where: { id: item.id }, data: { unitPrice: current.unitPrice } });
          changed = true;
        }
      }
      if (changed) return "prices_changed" as const;

      const now = new Date();
      await tx.order.update({ where: { id: order.id }, data: { confirmedAt: now } });
      await tx.visit.update({ where: { id: visit.id }, data: { status: "commandee", noOrderReason: null, endedAt: now } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "brouillon", toStatus: "brouillon", changedById: vendeur.id, note: "Confirmée par le pré-vendeur" },
      });
      return "confirmed" as const;
    }, TX);
  } catch (e) {
    return fail(e, "confirmOrder");
  }

  refresh(p.dayId);
  if (outcome === "prices_changed") {
    return { error: "Des prix du catalogue ont changé : le récapitulatif a été mis à jour. Vérifiez-le puis confirmez à nouveau." };
  }
  redirect(`${dayPath(p.dayId)}/clients`);
}

/** Annule la commande de la visite (statut « annulée » + historique) ; la visite repasse « en cours ». */
export async function cancelOrder(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const vendeur = await requireVendeurAction();
  const p = ids(formData);
  if (!p) return { error: "Requête invalide." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockOpenDay(tx, p.dayId, vendeur.id);
      const visit = await ownVisit(tx, p.dayId, p.customerId, vendeur.id);
      const order = await activeOrder(tx, visit.id);
      if (!order) throw new Refusal("Aucune commande à annuler.");
      if (order.status !== "brouillon") throw new Refusal("Cette commande a déjà été transmise : contactez l'administrateur.");
      await tx.order.update({ where: { id: order.id }, data: { status: "annulee" } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "brouillon", toStatus: "annulee", changedById: vendeur.id, note: "Annulée par le pré-vendeur avant clôture" },
      });
      await tx.visit.update({ where: { id: visit.id }, data: { status: "en_cours", noOrderReason: null, endedAt: null } });
    }, TX);
  } catch (e) {
    return fail(e, "cancelOrder");
  }
  refresh(p.dayId);
  return { ok: "Commande annulée." };
}
