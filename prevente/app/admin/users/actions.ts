"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid, text, type ActionResult } from "@/lib/form";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const CREATABLE_ROLES = ["vendeur", "livreur"];

export async function createUser(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const fullName = text(formData, "fullName");
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = text(formData, "role");

  if (!fullName || fullName.length > 100) return { error: "Nom complet obligatoire (100 caractères max)." };
  if (!EMAIL.test(email) || email.length > 254) return { error: "Adresse email invalide." };
  if (password.length < MIN_PASSWORD) return { error: `Mot de passe : ${MIN_PASSWORD} caractères minimum.` };
  if (!CREATABLE_ROLES.includes(role)) return { error: "Rôle invalide." };

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    return { error: error?.code === "email_exists" ? "Cet email est déjà utilisé." : "Création du compte impossible." };
  }

  try {
    // upsert : tolère un éventuel trigger Supabase qui créerait déjà le profil.
    await prisma.profile.upsert({
      where: { id: data.user.id },
      create: { id: data.user.id, fullName, role, isActive: true },
      update: { fullName, role, isActive: true },
    });
  } catch {
    await supabase.auth.admin.deleteUser(data.user.id); // pas de compte sans profil
    return { error: "Profil non créé : le compte a été annulé. Réessayez." };
  }

  revalidatePath("/admin/users");
  return { ok: `Compte créé pour ${email}.` };
}

/**
 * Un compte ne peut pas changer de rôle tant qu'il est engagé dans des commandes
 * ouvertes (créées par lui s'il est pré-vendeur, affectées à lui s'il est livreur).
 * Les commandes terminées ne bloquent pas : leur historique référence l'utilisateur
 * par son identifiant et reste intact.
 */
async function openWorkFor(user: { id: string; role: string }): Promise<number> {
  const OPEN = ["brouillon", "en_attente", "assignee", "en_livraison"] as const;
  if (user.role === "vendeur") {
    return prisma.order.count({ where: { createdById: user.id, status: { in: [...OPEN] } } });
  }
  if (user.role === "livreur") {
    return prisma.orderAssignment.count({ where: { driverId: user.id, unassignedAt: null, order: { status: { in: [...OPEN] } } } });
  }
  return 0;
}

export async function updateUser(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const user = await targetUser(text(formData, "id"));
  const fullName = text(formData, "fullName");
  const role = text(formData, "role");
  if (!user) return { error: "Utilisateur introuvable ou non modifiable." };
  if (!fullName || fullName.length > 100) return { error: "Nom complet obligatoire (100 caractères max)." };
  if (!CREATABLE_ROLES.includes(role)) return { error: "Rôle invalide." };

  if (role !== user.role) {
    const open = await openWorkFor(user);
    if (open > 0) {
      return {
        error: `Changement de rôle impossible : ${open} commande${open > 1 ? "s" : ""} ouverte${open > 1 ? "s" : ""} liée${open > 1 ? "s" : ""} à ce compte. Terminez-les ou réaffectez-les d'abord.`,
      };
    }
  }

  await prisma.profile.update({ where: { id: user.id }, data: { fullName, role } });
  revalidatePath("/admin/users");
  return { ok: "Compte modifié." };
}

async function targetUser(id: string) {
  if (!isUuid(id)) return null;
  const user = await prisma.profile.findUnique({ where: { id } });
  // Les comptes admin ne se gèrent pas depuis l'interface (SQL Editor uniquement) : cela garantit
  // qu'aucune action ne peut modifier, rétrograder ou désactiver le dernier administrateur.
  return user && user.role !== "admin" ? user : null;
}

export async function setUserActive(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const user = await targetUser(text(formData, "id"));
  if (!user) return { error: "Utilisateur introuvable ou non modifiable." };

  await prisma.profile.update({ where: { id: user.id }, data: { isActive: text(formData, "active") === "true" } });
  revalidatePath("/admin/users");
  return { ok: "Statut mis à jour." };
}

export async function resetUserPassword(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdminAction();
  const user = await targetUser(text(formData, "id"));
  const password = String(formData.get("password") ?? "");
  if (!user) return { error: "Utilisateur introuvable ou non modifiable." };
  if (password.length < MIN_PASSWORD) return { error: `Mot de passe : ${MIN_PASSWORD} caractères minimum.` };

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, { password });
  return error ? { error: "Changement du mot de passe impossible." } : { ok: "Mot de passe modifié." };
}
