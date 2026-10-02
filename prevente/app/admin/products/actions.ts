"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { deleteImage, uploadImage } from "@/lib/cloudinary";
import { isSaleUnit } from "@/lib/catalog";
import { validateJpeg } from "@/lib/image-upload";
import { isUniqueViolation, isUuid, optionalText, text, type ActionResult } from "@/lib/form";
import { parseMoney } from "@/lib/money";

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
  const price = parseMoney(text(formData, "salePrice"), "Prix de vente");
  if ("error" in price) return { error: price.error };

  await prisma.product.create({
    data: { name, saleUnit: unit, description: optionalText(formData, "description"), salePrice: price.value },
  });
  return done("Produit ajouté.");
}

export async function updateProduct(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!isUuid(id)) return { error: "Produit invalide." };
  if (!name || name.length > 120) return { error: "Nom du produit obligatoire (120 caractères max)." };
  const price = parseMoney(text(formData, "salePrice"), "Prix de vente");
  if ("error" in price) return { error: price.error };

  // L'unité n'est volontairement pas modifiable : les quantités du stock en dépendent.
  // Le prix de vente catalogue ne touche pas les commandes existantes (order_items.unit_price est un instantané).
  await prisma.product.update({
    where: { id },
    data: { name, description: optionalText(formData, "description"), salePrice: price.value },
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
  const price = parseMoney(text(formData, "salePrice"), "Prix de vente du parfum");
  if ("error" in price) return { error: price.error };

  try {
    await prisma.productVariant.create({
      data: { productId, name, sku: optionalText(formData, "sku"), salePrice: price.value },
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
  const price = parseMoney(text(formData, "salePrice"), "Prix de vente du parfum");
  if ("error" in price) return { error: price.error };

  try {
    await prisma.productVariant.update({
      where: { id },
      data: { name, sku: optionalText(formData, "sku"), salePrice: price.value },
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

export async function setVariantImage(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "variantId");
  const file = formData.get("image");
  if (!isUuid(id)) return { error: "Parfum invalide." };
  const invalid = await validateJpeg(file);
  if (invalid) return { error: invalid };

  const variant = await prisma.productVariant.findUnique({ where: { id }, select: { imagePublicId: true } });
  if (!variant) return { error: "Parfum introuvable." };

  let uploaded;
  try {
    uploaded = await uploadImage(file as File, "prevente/variants");
  } catch (e) {
    console.error("[setVariantImage]", e instanceof Error ? e.message : e);
    return { error: "Envoi de la photo impossible (service d'images indisponible ou mal configuré). L'ancienne photo est conservée." };
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
  revalidatePath("/admin/stock"); // vignettes de la page Stock
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
  revalidatePath("/admin/stock"); // vignettes de la page Stock
  return { ok: "Photo supprimée." };
}

/** Colonnes photo de products : ajoutées par la migration 004. */
function isMissingImageColumn(e: unknown): boolean {
  return e instanceof Error && /image_public_id|image_secure_url|does not exist|Unknown argument/i.test(e.message);
}
const MIGRATION_004 = "Photo produit indisponible : la migration 004 n'est pas encore appliquée sur la base.";

export async function setProductImage(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "productId");
  const file = formData.get("image");
  if (!isUuid(id)) return { error: "Produit invalide." };
  const invalid = await validateJpeg(file);
  if (invalid) return { error: invalid };

  let product;
  try {
    product = await prisma.product.findUnique({ where: { id }, select: { imagePublicId: true } });
  } catch (e) {
    if (isMissingImageColumn(e)) return { error: MIGRATION_004 };
    throw e;
  }
  if (!product) return { error: "Produit introuvable." };

  let uploaded;
  try {
    uploaded = await uploadImage(file as File, "prevente/products");
  } catch (e) {
    console.error("[setProductImage]", e instanceof Error ? e.message : e);
    return { error: "Envoi de la photo impossible (service d'images indisponible ou mal configuré). L'ancienne photo est conservée." };
  }

  try {
    await prisma.product.update({
      where: { id },
      data: { imagePublicId: uploaded.publicId, imageSecureUrl: uploaded.secureUrl },
    });
  } catch (e) {
    await deleteImage(uploaded.publicId).catch(() => {}); // pas de fichier orphelin
    throw e;
  }
  if (product.imagePublicId) await deleteImage(product.imagePublicId).catch(() => {}); // ancienne photo

  revalidatePath("/admin/products");
  revalidatePath("/admin/stock"); // vignettes de la page Stock
  return { ok: "Photo du produit enregistrée." };
}

export async function removeProductImage(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Produit invalide." };

  let product;
  try {
    product = await prisma.product.findUnique({ where: { id }, select: { imagePublicId: true } });
  } catch (e) {
    if (isMissingImageColumn(e)) return { error: MIGRATION_004 };
    throw e;
  }
  if (!product) return { error: "Produit introuvable." };

  // Cloudinary d'abord : en cas d'échec, la référence en base est conservée.
  if (product.imagePublicId) {
    try {
      await deleteImage(product.imagePublicId);
    } catch (e) {
      console.error("[removeProductImage]", e instanceof Error ? e.message : e);
      return { error: "Suppression de la photo impossible. Réessayez." };
    }
  }
  await prisma.product.update({ where: { id }, data: { imagePublicId: null, imageSecureUrl: null } });
  revalidatePath("/admin/products");
  revalidatePath("/admin/stock"); // vignettes de la page Stock
  return { ok: "Photo du produit supprimée." };
}
