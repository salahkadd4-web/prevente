"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { dateOnly, integer, isUniqueViolation, isUuid, optionalText, text, type ActionResult } from "@/lib/form";

export async function createLot(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const variantId = text(formData, "variantId");
  const quantity = integer(formData, "quantity");
  const expiresAt = dateOnly(formData, "expiresAt");
  const receivedAt = dateOnly(formData, "receivedAt") ?? new Date(new Date().toISOString().slice(0, 10));

  if (!isUuid(variantId)) return { error: "Choisissez un produit / parfum." };
  if (quantity === null || quantity <= 0) return { error: "La quantité doit être un entier supérieur à 0." };
  if (!expiresAt) return { error: "La date d'expiration est obligatoire." };

  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { isActive: true } });
  if (!variant?.isActive) return { error: "Ce parfum n'existe pas ou est désactivé." };

  try {
    await prisma.stockLot.create({
      data: {
        variantId,
        lotNumber: optionalText(formData, "lotNumber"),
        initialQuantity: quantity,
        availableQuantity: quantity,
        expiresAt,
        receivedAt,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Ce numéro de lot existe déjà pour ce parfum." };
    throw e;
  }
  revalidatePath("/admin/stock");
  revalidatePath("/admin/dashboard");
  return { ok: "Lot ajouté au stock." };
}

/** Correction manuelle (inventaire, casse…). Pour ajouter du stock, créer un nouveau lot. */
export async function correctLotQuantity(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  const quantity = integer(formData, "quantity");
  if (!isUuid(id)) return { error: "Lot invalide." };
  if (quantity === null || quantity < 0) return { error: "La quantité doit être un entier positif ou nul." };

  const lot = await prisma.stockLot.findUnique({ where: { id }, select: { initialQuantity: true } });
  if (!lot) return { error: "Lot introuvable." };
  if (quantity > lot.initialQuantity) {
    return { error: `Maximum ${lot.initialQuantity} (quantité initiale). Pour ajouter du stock, créez un nouveau lot.` };
  }

  await prisma.stockLot.update({ where: { id }, data: { availableQuantity: quantity } });
  revalidatePath("/admin/stock");
  revalidatePath("/admin/dashboard");
  return { ok: "Quantité corrigée." };
}
