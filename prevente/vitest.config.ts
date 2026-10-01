import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // Fichiers en série : les tests *.db.test.ts partagent une base jetable à connexion unique (PGlite).
  test: { include: ["tests/**/*.test.ts"], environment: "node", fileParallelism: false },
});
