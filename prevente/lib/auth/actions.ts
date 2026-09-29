"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRole, ROLE_HOME } from "@/lib/auth/roles";

export type LoginState = {
  error?: string;
  email?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_ERROR = "Une erreur est survenue. Veuillez réessayer dans un instant.";

function messageForAuthError(error: { code?: string; status?: number }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Email ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Cette adresse email n'est pas encore confirmée. Contactez l'administrateur.";
    case "user_banned":
      return "Ce compte est suspendu. Contactez l'administrateur.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
    default:
      return error.status === 429 ? "Trop de tentatives. Patientez quelques minutes avant de réessayer." : GENERIC_ERROR;
  }
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email) return { error: "Veuillez saisir votre adresse email.", email };
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { error: "L'adresse email n'est pas valide.", email };
  }
  if (!password) return { error: "Veuillez saisir votre mot de passe.", email };
  if (password.length > 256) return { error: "Email ou mot de passe incorrect.", email };

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: error ? messageForAuthError(error) : GENERIC_ERROR, email };
  }

  // Le rôle vient exclusivement de public.profiles, lu ici côté serveur.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return { error: GENERIC_ERROR, email };
  }

  if (!profile) {
    await supabase.auth.signOut();
    return {
      error: "Aucun profil n'est associé à ce compte. Contactez l'administrateur.",
      email,
    };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return {
      error: "Ce compte est désactivé. Contactez l'administrateur pour retrouver l'accès.",
      email,
    };
  }

  if (!isRole(profile.role)) {
    await supabase.auth.signOut();
    return { error: GENERIC_ERROR, email };
  }

  redirect(ROLE_HOME[profile.role]);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?error=deconnecte");
}
