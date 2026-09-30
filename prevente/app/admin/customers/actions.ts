"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { deleteImage, uploadImage } from "@/lib/cloudinary";
import { MAX_CUSTOMER_PHOTOS, parseCustomerForm } from "@/lib/customers";
import { validateJpeg } from "@/lib/image-upload";
import { isUuid, text, type ActionResult } from "@/lib/form";

export async function createCustomer(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminAction();
  const parsed = parseCustomerForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  await prisma.customer.create({ data: { ...parsed.data, createdById: admin.id } });
  revalidatePath("/admin/customers");
  return { ok: "Client ajouté." };
}

export async function updateCustomer(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Client invalide." };
  const parsed = parseCustomerForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  await prisma.customer.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
  return { ok: "Client modifié." };
}

export async function setCustomerActive(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Client invalide." };

  await prisma.customer.update({ where: { id }, data: { isActive: text(formData, "active") === "true" } });
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
  return { ok: "Statut du client mis à jour." };
}

/** Ajoute UNE photo (le navigateur envoie les photos une par une, déjà réduites). */
export async function addCustomerPhoto(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminAction();
  const customerId = text(formData, "customerId");
  const file = formData.get("image");
  if (!isUuid(customerId)) return { error: "Client invalide." };
  const invalid = await validateJpeg(file);
  if (invalid) return { error: invalid };

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) return { error: "Client introuvable." };
  const count = await prisma.customerPhoto.count({ where: { customerId } });
  if (count >= MAX_CUSTOMER_PHOTOS) return { error: `Maximum ${MAX_CUSTOMER_PHOTOS} photos par boutique.` };

  let uploaded;
  try {
    uploaded = await uploadImage(file as File, `prevente/customers/${customerId}`);
  } catch (e) {
    console.error("[addCustomerPhoto]", e instanceof Error ? e.message : e);
    return { error: "Envoi de la photo impossible (service d'images indisponible ou mal configuré)." };
  }

  try {
    await prisma.customerPhoto.create({
      data: { customerId, imagePublicId: uploaded.publicId, imageSecureUrl: uploaded.secureUrl, addedById: admin.id, takenAt: new Date() },
    });
  } catch (e) {
    await deleteImage(uploaded.publicId).catch(() => {}); // pas de fichier orphelin
    console.error("[addCustomerPhoto:db]", e instanceof Error ? e.message : e);
    return { error: "Photo non enregistrée. Réessayez." };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: "Photo ajoutée." };
}

/**
 * Retire une photo : le fichier Cloudinary est supprimé AVANT la ligne. Si la
 * suppression Cloudinary échoue, la ligne est conservée (la photo reste visible
 * et l'opération peut être relancée). Le client et ses commandes ne sont pas touchés.
 */
export async function removeCustomerPhoto(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Photo invalide." };

  const photo = await prisma.customerPhoto.findUnique({ where: { id }, select: { imagePublicId: true, customerId: true } });
  if (!photo) return { error: "Photo introuvable (déjà supprimée ?)." };

  try {
    await deleteImage(photo.imagePublicId);
  } catch (e) {
    console.error("[removeCustomerPhoto]", e instanceof Error ? e.message : e);
    return { error: "Suppression de la photo impossible. Réessayez." };
  }
  await prisma.customerPhoto.deleteMany({ where: { id } });

  revalidatePath(`/admin/customers/${photo.customerId}`);
  return { ok: "Photo retirée." };
}
