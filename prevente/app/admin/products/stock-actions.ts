"use server";

import { revalidateCatalog } from "@/lib/admin/revalidate";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { DEFAULT_FLAVOR_NAME } from "@/lib/catalog";
import { dateOnly, integer, isUniqueViolation, isUuid, optionalText, text, type ActionResult } from "@/lib/form";
import { parseMoney } from "@/lib/money";

const MAX_QUANTITY = 1_000_000; // garde-fou contre une faute de frappe (et contre le dépassement d'entier)

class Refusal extends Error {}

function refresh() {
  revalidateCatalog();
}

export async function createLot(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  // Valeur : id de parfum, ou « p:<id produit> » pour un produit sans parfum.
  const target = text(formData, "variantId");
  const quantity = integer(formData, "quantity");
  const expiresAt = dateOnly(formData, "expiresAt");
  const receivedAt = dateOnly(formData, "receivedAt") ?? new Date(new Date().toISOString().slice(0, 10));
  const lotNumber = optionalText(formData, "lotNumber");

  const isProduct = target.startsWith("p:");
  const id = isProduct ? target.slice(2) : target;
  if (!isUuid(id)) return { error: "Choisissez un produit / parfum." };
  if (quantity === null || quantity <= 0) return { error: "La quantité doit être un entier supérieur à 0." };
  if (quantity > MAX_QUANTITY) return { error: `Quantité trop élevée (${MAX_QUANTITY} maximum).` };
  if (!expiresAt) return { error: "La date d'expiration est obligatoire." };
  if (expiresAt < receivedAt) return { error: "La date d'expiration ne peut pas précéder la date de réception." };
  if (lotNumber && lotNumber.length > 60) return { error: "N° de lot : 60 caractères max." };
  // Prix d'achat unitaire de CE lot (facultatif : vide = inconnu, signalé au dashboard, jamais inventé).
  const cost = parseMoney(text(formData, "unitCost"), "Prix d'achat");
  if ("error" in cost) return { error: cost.error };

  try {
    await prisma.$transaction(async (tx) => {
      let variantId = id;

      if (isProduct) {
        const product = await tx.product.findUnique({
          where: { id },
          select: { isActive: true, _count: { select: { variants: true } } },
        });
        if (!product?.isActive) throw new Refusal("Ce produit n'existe pas ou est désactivé.");
        if (product._count.variants > 0) {
          throw new Refusal("Ce produit a des parfums : choisissez un parfum précis dans la liste.");
        }
        // Produit sans parfum : on crée (une seule fois) son parfum technique « Sans parfum ».
        try {
          variantId = (await tx.productVariant.create({ data: { productId: id, name: DEFAULT_FLAVOR_NAME }, select: { id: true } })).id;
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
          throw new Refusal("Réessayez : ce produit vient d'être modifié par une autre action.");
        }
      } else {
        const variant = await tx.productVariant.findUnique({
          where: { id },
          select: { isActive: true, product: { select: { isActive: true } } },
        });
        if (!variant?.isActive || !variant.product.isActive) throw new Refusal("Ce parfum n'existe pas ou est désactivé.");
      }

      await tx.stockLot.create({
        data: { variantId, lotNumber, initialQuantity: quantity, availableQuantity: quantity, expiresAt, receivedAt, unitCost: cost.value },
      });
    });
  } catch (e) {
    if (e instanceof Refusal) return { error: e.message };
    if (isUniqueViolation(e)) return { error: "Ce numéro de lot existe déjà pour ce parfum." };
    throw e;
  }
  refresh();
  return { ok: "Lot ajouté au stock." };
}

/**
 * Correction d'inventaire (casse, écart de comptage…). Pour AJOUTER du stock reçu,
 * créer un nouveau lot.
 *
 * Cohérence avec les commandes : les quantités prélevées par des commandes actives
 * (order_item_allocations non libérées) ne sont plus « sur l'étagère » et ne peuvent
 * pas être « recréées » par une correction. Bornes : 0 ≤ nouvelle quantité ≤
 * quantité initiale − quantités déjà prélevées. Chaque correction est journalisée
 * (stock_adjustments : avant / après / motif / auteur / date).
 */
export async function correctLotQuantity(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminAction();
  const id = text(formData, "id");
  const quantity = integer(formData, "quantity");
  const reason = text(formData, "reason");

  if (!isUuid(id)) return { error: "Lot invalide." };
  if (quantity === null || quantity < 0) return { error: "La quantité doit être un entier positif ou nul." };
  if (quantity > MAX_QUANTITY) return { error: `Quantité trop élevée (${MAX_QUANTITY} maximum).` };
  if (reason.length < 3 || reason.length > 200) return { error: "Indiquez le motif de la correction (3 à 200 caractères)." };

  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ initial_quantity: number; available_quantity: number }[]>`
        SELECT initial_quantity, available_quantity FROM public.stock_lots WHERE id = ${id}::uuid FOR UPDATE
      `;
      const lot = rows[0];
      if (!lot) throw new Refusal("Lot introuvable.");

      const held = await tx.orderItemAllocation.aggregate({
        where: { lotId: id, releasedAt: null },
        _sum: { quantity: true },
      });
      const allocated = held._sum.quantity ?? 0;
      const max = lot.initial_quantity - allocated;

      if (quantity > max) {
        throw new Refusal(
          allocated > 0
            ? `Maximum ${max} : ${allocated} unité(s) de ce lot sont déjà prélevées par des commandes. Pour ajouter du stock, créez un nouveau lot.`
            : `Maximum ${max} (quantité initiale). Pour ajouter du stock, créez un nouveau lot.`,
        );
      }
      if (quantity === lot.available_quantity) throw new Refusal("La quantité est déjà celle enregistrée.");

      await tx.stockLot.update({ where: { id }, data: { availableQuantity: quantity } });
      await tx.stockAdjustment.create({
        data: { lotId: id, previousQuantity: lot.available_quantity, newQuantity: quantity, reason, changedById: admin.id },
      });
    });
  } catch (e) {
    if (e instanceof Refusal) return { error: e.message };
    const code = (e as { code?: string } | null)?.code;
    if (code === "P2021" || (e instanceof Error && /relation .* does not exist/i.test(e.message))) {
      return { error: "Correction indisponible : la migration 003 (traçabilité du stock) n'est pas appliquée sur la base." };
    }
    console.error("[correctLotQuantity]", e instanceof Error ? e.message : e);
    return { error: "Correction impossible. Réessayez." };
  }

  refresh();
  return { ok: "Quantité corrigée et enregistrée dans le journal." };
}

/**
 * Renseigne ou corrige le prix d'achat unitaire d'UN lot (ex. lots antérieurs à la migration 005, ou
 * faute de frappe). Ne touche que ce lot : un nouvel achat à un autre prix = un nouveau lot, les autres
 * lots ne sont jamais modifiés. Attention : le coût des commandes déjà livrées prélevées sur ce lot
 * se recalcule dans le dashboard (le coût est lu sur le lot alloué).
 */
export async function setLotCost(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Lot invalide." };
  const cost = parseMoney(text(formData, "unitCost"), "Prix d'achat", true);
  if ("error" in cost) return { error: cost.error };

  try {
    const res = await prisma.stockLot.updateMany({ where: { id }, data: { unitCost: cost.value } });
    if (res.count !== 1) return { error: "Lot introuvable." };
  } catch (e) {
    if (e instanceof Error && /unit_cost|does not exist|Unknown argument/i.test(e.message)) {
      return { error: "Prix d'achat indisponible : la migration 005 n'est pas appliquée sur la base." };
    }
    console.error("[setLotCost]", e instanceof Error ? e.message : e);
    return { error: "Enregistrement impossible. Réessayez." };
  }
  refresh();
  return { ok: "Prix d'achat enregistré." };
}
