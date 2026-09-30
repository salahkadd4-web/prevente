"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { isUuid, text, type ActionResult } from "@/lib/form";
import { isPlannableWeekday } from "@/lib/presale/dates";

/**
 * Définit les jours de visite d'un client pour un pré-vendeur (remplace l'ensemble existant).
 * Aucun jour coché = le client est retiré du planning de ce pré-vendeur. Le vendredi (5) est refusé
 * ici ET par un CHECK SQL. Seul l'admin modifie le planning ; les journées déjà démarrées ne changent pas.
 */
export async function setCustomerSchedule(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const vendeurId = text(formData, "vendeurId");
  const customerId = text(formData, "customerId");
  if (!isUuid(vendeurId) || !isUuid(customerId)) return { error: "Requête invalide." };

  const days = [...new Set(formData.getAll("weekday").map((v) => Number(v)))];
  if (days.some((d) => !Number.isInteger(d) || !isPlannableWeekday(d))) {
    return { error: "Jour invalide (aucun client n'est planifié le vendredi)." };
  }

  const [vendeur, customer] = await Promise.all([
    prisma.profile.findUnique({ where: { id: vendeurId }, select: { role: true, isActive: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }),
  ]);
  if (!vendeur || vendeur.role !== "vendeur" || !vendeur.isActive) return { error: "Pré-vendeur introuvable ou désactivé." };
  if (!customer) return { error: "Client introuvable." };

  await prisma.$transaction([
    prisma.customerSchedule.deleteMany({ where: { vendeurId, customerId } }),
    prisma.customerSchedule.createMany({ data: days.map((weekday) => ({ vendeurId, customerId, weekday })) }),
  ]);
  revalidatePath("/admin/planning");
  return { ok: days.length > 0 ? "Planning enregistré." : "Client retiré du planning." };
}
