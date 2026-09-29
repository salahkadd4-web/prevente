"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { parseCustomerForm } from "@/lib/customers";
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
