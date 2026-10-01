/**
 * Base de test JETABLE pour les tests d'intégration (*.db.test.ts).
 *
 * Les tests ne tournent que si LIVREUR_TEST_DATABASE_URL pointe vers localhost / 127.0.0.1 : ils ne
 * peuvent jamais viser la vraie base (DATABASE_URL du projet est ignoré).
 *
 * Le client Prisma de test utilise UNE seule connexion : il fonctionne aussi bien avec un PostgreSQL
 * local qu'avec PGlite (base en mémoire, une seule session). Les appels « simultanés » sont alors
 * sérialisés : ils vérifient l'idempotence, pas la concurrence réelle des verrous FOR UPDATE.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

export const TEST_DB_URL = process.env.LIVREUR_TEST_DATABASE_URL ?? "";
export const TEST_DB_SAFE = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(TEST_DB_URL);

let client: PrismaClient | undefined;

/** Client Prisma de la base jetable (refuse toute URL non locale). */
export function testPrisma(): PrismaClient {
  if (!TEST_DB_SAFE) throw new Error("LIVREUR_TEST_DATABASE_URL doit pointer vers une base locale jetable.");
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DB_URL, max: 1 }) });
  return client;
}
