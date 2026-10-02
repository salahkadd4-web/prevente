import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Chaque instance serverless ouvre son propre pool : on le garde petit et on ferme vite les connexions
// inactives, sinon les instances réunies saturent le pooler Supabase (EMAXCONNSESSION, pool_size 15).
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
  idleTimeoutMillis: 10_000,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter });

// Un seul client par instance, en production aussi (pas de second pool au rechargement d'un module).
globalForPrisma.prisma = prisma;