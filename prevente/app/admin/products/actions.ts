"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { deleteImage, uploadImage } from "@/lib/cloudinary";
import { isSaleUnit } from "@/lib/catalog";
import { isUniqueViolation, isUuid, optionalText, text, type ActionResult } from "@/lib/form";

const done = (ok: string): ActionResult => {
  revalidatePath("/admin/products");
  revalidatePath("/admin/stock");
  return { ok };
};

export async function createProduct(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const name = text(formData, "name");
  const unit = text(formData, "saleUnit");
  if (!name || name.length > 120) return { error: "Nom du produit obligatoire (120 caractères max)." };
  if (!isSaleUnit(unit)) return { error: "Choisissez une unité de vente." };

  await prisma.product.create({
    data: { name, saleUnit: unit, description: optionalText(formData, "description") },
  });
  return done("Produit ajouté.");
}

export async function updateProduct(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!isUuid(id)) return { error: "Produit invalide." };
  if (!name || name.length > 120) return { error: "Nom du produit obligatoire (120 caractères max)." };

  // L'unité n'est volontairement pas modifiable : les quantités du stock en dépendent.
  await prisma.product.update({
    where: { id },
    data: { name, description: optionalText(formData, "description") },
  });
  return done("Produit modifié.");
}

export async function setProductActive(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Produit invalide." };
  await prisma.product.update({ where: { id }, data: { isActive: text(formData, "active") === "true" } });
  return done("Statut du produit mis à jour.");
}

export async function createVariant(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const productId = text(formData, "productId");
  const name = text(formData, "name");
  if (!isUuid(productId)) return { error: "Produit invalide." };
  if (!name || name.length > 80) return { error: "Nom du parfum obligatoire (80 caractères max)." };

  try {
    await prisma.productVariant.create({
      data: { productId, name, sku: optionalText(formData, "sku") },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Ce parfum ou cette référence existe déjà." };
    throw e;
  }
  return done("Parfum ajouté.");
}

export async function updateVariant(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!isUuid(id)) return { error: "Parfum invalide." };
  if (!name || name.length > 80) return { error: "Nom du parfum obligatoire (80 caractères max)." };

  try {
    await prisma.productVariant.update({
      where: { id },
      data: { name, sku: optionalText(formData, "sku") },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Ce parfum ou cette référence existe déjà." };
    throw e;
  }
  return done("Parfum modifié.");
}

export async function setVariantActive(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Parfum invalide." };
  await prisma.productVariant.update({ where: { id }, data: { isActive: text(formData, "active") === "true" } });
  return done("Statut du parfum mis à jour.");
}

const MAX_IMAGE_BYTES = 800_000; // l'image est réduite côté navigateur ; limite de sécurité côté serveur

export async function setVariantImage(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "variantId");
  const file = formData.get("image");
  if (!isUuid(id)) return { error: "Parfum invalide." };
  if (!(file instanceof File) || file.size === 0) return { error: "Aucune image reçue." };
  if (file.type !== "image/jpeg") return { error: "Format d'image non pris en charge." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Image trop lourde." };

  const variant = await prisma.productVariant.findUnique({ where: { id }, select: { imagePublicId: true } });
  if (!variant) return { error: "Parfum introuvable." };

  let uploaded;
  try {
    uploaded = await uploadImage(file, "prevente/variants");
  } catch (e) {
    console.error("[setVariantImage]", e instanceof Error ? e.message : e);
    return { error: "Envoi de la photo impossible. Voir le message dans le terminal." };
  }

  try {
    await prisma.productVariant.update({
      where: { id },
      data: { imagePublicId: uploaded.publicId, imageSecureUrl: uploaded.secureUrl },
    });
  } catch (e) {
    await deleteImage(uploaded.publicId).catch(() => {}); // pas de fichier orphelin
    throw e;
  }
  if (variant.imagePublicId) await deleteImage(variant.imagePublicId).catch(() => {}); // ancienne photo

  revalidatePath("/admin/products");
  return { ok: "Photo enregistrée." };
}

export async function removeVariantImage(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Parfum invalide." };

  const variant = await prisma.productVariant.findUnique({ where: { id }, select: { imagePublicId: true } });
  if (!variant) return { error: "Parfum introuvable." };

  if (variant.imagePublicId) {
    try {
      await deleteImage(variant.imagePublicId);
    } catch (e) {
      console.error("[removeVariantImage]", e instanceof Error ? e.message : e);
      return { error: "Suppression de la photo impossible. Réessayez." };
    }
  }
  await prisma.productVariant.update({ where: { id }, data: { imagePublicId: null, imageSecureUrl: null } });
  revalidatePath("/admin/products");
  return { ok: "Photo supprimée." };
}
