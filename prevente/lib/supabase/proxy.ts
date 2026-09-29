import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPrivatePath } from "@/lib/auth/roles";

/**
 * Exécuté par proxy.ts à chaque requête : renouvelle les jetons Supabase
 * (cookies) et bloque l'accès anonyme aux chemins privés.
 * Contrôle « optimiste » uniquement : aucune requête base de données ici.
 * Le rôle est vérifié côté serveur dans chaque page (lib/auth/session.ts).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          pendingHeaders = headers ?? {};
          Object.entries(pendingHeaders).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  // Ne rien exécuter entre createServerClient et getClaims (recommandation Supabase SSR).
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  if (!isAuthenticated && isPrivatePath(pathname)) {
    const hadSession = request.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith("sb-"));

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = hadSession ? "?error=session" : "";

    const redirectResponse = NextResponse.redirect(url);
    // Conserver les cookies éventuellement rafraîchis/supprimés par Supabase.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    Object.entries(pendingHeaders).forEach(([key, value]) =>
      redirectResponse.headers.set(key, value)
    );
    return redirectResponse;
  }

  return response;
}
