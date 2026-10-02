"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { revalidateCatalog } from "@/lib/admin/revalidate";
import { deleteImage, uploadImage } from "@/lib/cloudinary";
import type { Prisma, SaleUnit } from "@/app/generated/prisma/client";
import { DEFAULT_FLAVOR_NAME, isSaleUnit } from "@/lib/catalog";
import { validateJpeg } from "@/lib/image-upload";
import { isUniqueViolation, isUuid, text, type ActionResult } from "@/lib/form";
import { parseMoney } from "@/lib/money";

const done = (ok: string): ActionResult => {
  revalidateCatalog();
  return { ok };
};

const MAX_QUANTITY = 1_000_000; // garde-fou contre une faute de frappe (et contre le dépassement d'entier)
const MAX_FLAVORS = 100;
const QUANTITY_REASON = "Quantité modifiée depuis la fiche produit";

/** Un parfum du formulaire produit. `quantity` = quantité voulue, `initialQuantity` = celle affichée à l'ouverture. */
export type FlavorInput = {
  key: string;
  id?: string;
  name: string;
  salePrice: string;
  isActive: boolean;
  quantity: number;
  initialQuantity: number;
};

/** Formulaire produit complet (ajout ou modification). `quantity` ne sert qu'au produit sans parfum. */
export type SaveProductInput = {
  id?: string;
  name: string;
  saleUnit: string;
  salePrice: string;
  description: string;
  quantity: number;
  initialQuantity: number;
  flavors: FlavorInput[];
};

/** `variantIds` : id de chaque parfum par clé du formulaire, pour envoyer ensuite les photos. */
export type SaveProductResult = ActionResult & { id?: string; variantIds?: Record<string, string> };

class Refusal extends Error {}
type LotChange = { lotId: string; previousQuantity: number; newQuantity: number };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isQuantity = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= MAX_QUANTITY;

/**
 * Ajoute ou modifie un produit et ses parfums en une fois. Les quantités s'appliquent en ÉCART
 * (voulue − affichée à l'ouverture) : une commande passée entre-temps n'est jamais « recréée ».
 * Hausse = nouveau lot ; baisse = retirée des lots disponibles, expiration la plus proche d'abord.
 * Les photos sont envoyées ensuite, une par une (setProductImage / setVariantImage).
 */
export async function saveProduct(input: SaveProductInput): Promise<SaveProductResult> {
  const admin = await requireAdminAction();
  const id = str(input?.id);
  const name = str(input?.name);
  const unit = str(input?.saleUnit);
  const description = str(input?.description) || null;
  if (id && !isUuid(id)) return { error: "Produit invalide." };
  if (!name || name.length > 120) return { error: "Nom du produit obligatoire (120 caractères max)." };
  if (!id && !isSaleUnit(unit)) return { error: "Choisissez une unité de vente." };
  const price = parseMoney(str(input?.salePrice), "Prix de vente");
  if ("error" in price) return { error: price.error };
  if (!isQuantity(input?.quantity) || !isQuantity(input?.initialQuantity)) {
    return { error: `Quantité invalide (nombre entier de 0 à ${MAX_QUANTITY}).` };
  }

  const raw = Array.isArray(input?.flavors) ? input.flavors : [];
  if (raw.length > MAX_FLAVORS) return { error: `${MAX_FLAVORS} parfums maximum.` };
  const flavors: { key: string; id: string | null; name: string; salePrice: string | null; isActive: boolean; delta: number }[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    const fName = str(f?.name);
    const fId = str(f?.id);
    if (fId && !isUuid(fId)) return { error: "Parfum invalide." };
    if (!fName || fName.length > 80) return { error: "Nom du parfum obligatoire (80 caractères max)." };
    // « Sans parfum » est réservé au parfum technique (déjà existant) d'un produit sans parfum.
    if (!fId && fName.toLowerCase() === DEFAULT_FLAVOR_NAME.toLowerCase()) {
      return { error: `« ${DEFAULT_FLAVOR_NAME} » est réservé : choisissez un autre nom de parfum.` };
    }
    if (seen.has(fName.toLowerCase())) return { error: `Deux parfums s'appellent « ${fName} ».` };
    seen.add(fName.toLowerCase());
    const fPrice = parseMoney(str(f?.salePrice), `Prix du parfum « ${fName} »`);
    if ("error" in fPrice) return { error: fPrice.error };
    if (!isQuantity(f?.quantity) || !isQuantity(f?.initialQuantity)) {
      return { error: `Quantité invalide pour « ${fName} » (nombre entier de 0 à ${MAX_QUANTITY}).` };
    }
    flavors.push({ key: str(f?.key), id: fId || null, name: fName, salePrice: fPrice.value, isActive: f?.isActive !== false, delta: f.quantity - f.initialQuantity });
  }

  const changes: LotChange[] = [];
  const variantIds: Record<string, string> = {};
  let productId: string;
  try {
    productId = await prisma.$transaction(async (tx) => {
      let pid: string;
      if (id) {
        // L'unité n'est volontairement pas modifiable : les quantités du stock en dépendent.
        // Le prix catalogue ne touche pas les commandes existantes (order_items.unit_price est un instantané).
        const res = await tx.product.updateMany({ where: { id }, data: { name, description, salePrice: price.value } });
        if (res.count !== 1) throw new Refusal("Produit introuvable.");
        pid = id;
      } else {
        pid = (await tx.product.create({
          data: { name, saleUnit: unit as SaleUnit, description, salePrice: price.value },
          select: { id: true },
        })).id;
      }

      for (const f of flavors) {
        let vid: string;
        if (f.id) {
          const res = await tx.productVariant.updateMany({
            where: { id: f.id, productId: pid },
            data: { name: f.name, salePrice: f.salePrice, isActive: f.isActive },
          });
          if (res.count !== 1) throw new Refusal(`Parfum « ${f.name} » introuvable.`);
          vid = f.id;
        } else {
          vid = (await tx.productVariant.create({
            data: { productId: pid, name: f.name, salePrice: f.salePrice, isActive: f.isActive },
            select: { id: true },
          })).id;
        }
        variantIds[f.key] = vid;
        await applyQuantity(tx, vid, f.delta, changes);
      }

      // Produit sans parfum : son stock est porté par le parfum technique « Sans parfum », créé au premier besoin.
      const delta = input.quantity - input.initialQuantity;
      if (flavors.length === 0 && delta !== 0) {
        let technical = await tx.productVariant.findUnique({
          where: { productId_name: { productId: pid, name: DEFAULT_FLAVOR_NAME } },
          select: { id: true },
        });
        if (!technical && delta > 0) {
          technical = await tx.productVariant.create({ data: { productId: pid, name: DEFAULT_FLAVOR_NAME }, select: { id: true } });
        }
        if (technical) await applyQuantity(tx, technical.id, delta, changes);
      }
      return pid;
    });
  } catch (e) {
    if (e instanceof Refusal) return { error: e.message };
    if (isUniqueViolation(e)) return { error: "Un parfum porte déjà ce nom pour ce produit." };
    console.error("[saveProduct]", e instanceof Error ? e.message : e);
    return { error: "Enregistrement impossible. Réessayez." };
  }

  // Traçabilité des baisses (stock_adjustments, migration 003) : hors transaction, pour ne jamais bloquer l'enregistrement.
  if (changes.length > 0) {
    await prisma.stockAdjustment
      .createMany({ data: changes.map((c) => ({ ...c, reason: QUANTITY_REASON, changedById: admin.id })) })
      .catch((e) => console.error("[saveProduct:journal]", e instanceof Error ? e.message : e));
  }

  return { ...done(id ? "Produit enregistré." : "Produit ajouté."), id: productId, variantIds };
}

async function applyQuantity(tx: Prisma.TransactionClient, variantId: string, delta: number, changes: LotChange[]) {
  if (delta > 0) {
    await tx.stockLot.create({ data: { variantId, initialQuantity: delta, availableQuantity: delta } });
    return;
  }
  let rest = -delta;
  if (rest === 0) return;
  const lots = await tx.$queryRaw<{ id: string; available_quantity: number }[]>`
    SELECT id, available_quantity FROM public.stock_lots
    WHERE variant_id = ${variantId}::uuid AND available_quantity > 0
    ORDER BY expires_at ASC NULLS LAST, received_at ASC
    FOR UPDATE
  `;
  for (const lot of lots) {
    if (rest === 0) break;
    const take = Math.min(rest, lot.available_quantity);
    const next = lot.available_quantity - take;
    await tx.stockLot.update({ where: { id: lot.id }, data: { availableQuantity: next } });
    changes.push({ lotId: lot.id, previousQuantity: lot.available_quantity, newQuantity: next });
    rest -= take;
  }
}

export async function setProductActive(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Produit invalide." };
  await prisma.product.update({ where: { id }, data: { isActive: text(formData, "active") === "true" } });
  return done("Statut du produit mis à jour.");
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

  revalidateCatalog();
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
  revalidateCatalog();
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

  revalidateCatalog();
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
  revalidateCatalog();
  return { ok: "Photo du produit supprimée." };
}
