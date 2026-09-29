import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase avec la clé secrète (service_role) : réservé au serveur.
 * Ne JAMAIS l'importer depuis un composant client ni préfixer la variable par NEXT_PUBLIC_.
 * Sert uniquement à créer / modifier les comptes Auth depuis l'espace admin.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY est manquante dans .env.local");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
