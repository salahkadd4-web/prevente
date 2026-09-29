import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLoginNoticeKey } from "@/lib/auth/roles";

/**
 * Supprime la session d'un compte désactivé / sans profil, puis renvoie vers /login.
 * Passer par ce point d'entrée (et non un simple redirect vers /login) évite
 * qu'une session valide mais inutilisable ne provoque une boucle de redirection.
 */
export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  const key = isLoginNoticeKey(reason) ? reason : "erreur";

  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL(`/login?error=${key}`, request.url));
}
