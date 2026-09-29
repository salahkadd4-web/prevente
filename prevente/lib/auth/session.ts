import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRole, ROLE_HOME, type Role } from "@/lib/auth/roles";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
};

export type SessionState =
  | { status: "anonymous" }
  | { status: "no_profile" }
  | { status: "inactive" }
  | { status: "error" }
  | { status: "ok"; profile: Profile };

/**
 * Source de vérité côté serveur : vérifie la session auprès de Supabase Auth
 * (getUser contacte le serveur Auth, donc une session révoquée est détectée),
 * puis lit le profil dans public.profiles (soumis à la RLS).
 * Mémoïsé le temps d'un rendu.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { status: "anonymous" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) return { status: "error" };
  if (!profile) return { status: "no_profile" };
  if (!profile.is_active) return { status: "inactive" };
  if (!isRole(profile.role)) return { status: "error" };

  return {
    status: "ok",
    profile: { id: profile.id, full_name: profile.full_name, role: profile.role },
  };
});

/**
 * Redirige selon un état de session non nominal.
 * Les états « désactivé » et « sans profil » passent par /auth/invalid,
 * qui supprime la session avant d'afficher /login (évite toute boucle).
 */
export function redirectForState(state: Exclude<SessionState, { status: "ok" }>): never {
  switch (state.status) {
    case "anonymous":
      redirect("/login?error=session");
    case "inactive":
      redirect("/auth/invalid?reason=desactive");
    case "no_profile":
      redirect("/auth/invalid?reason=profil");
    case "error":
      redirect("/auth/invalid?reason=erreur");
  }
}

/**
 * À appeler en tête de CHAQUE page privée (les layouts ne sont pas
 * re-rendus à chaque navigation, ils ne suffisent pas à protéger).
 * Un utilisateur connecté mais d'un autre rôle est renvoyé vers son propre espace.
 */
export async function requireRole(role: Role): Promise<Profile> {
  const state = await getSessionState();
  if (state.status !== "ok") redirectForState(state);
  if (state.profile.role !== role) redirect(ROLE_HOME[state.profile.role]);
  return state.profile;
}

/**
 * À appeler en tête de CHAQUE Server Action admin : une action est joignable
 * par POST direct, la protection de la page ne suffit pas. Lève une erreur
 * (pas de redirection) si l'appelant n'est pas un admin actif.
 */
export async function requireAdminAction(): Promise<Profile> {
  const state = await getSessionState();
  if (state.status !== "ok" || state.profile.role !== "admin") {
    throw new Error("Accès refusé");
  }
  return state.profile;
}
