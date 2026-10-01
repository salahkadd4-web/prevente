import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**", // dossier de build imbriqué (prevente/prevente/.next) versionné par erreur
    "out/**",
    "build/**",
    "next-env.d.ts",
    "android/**", // projet natif Capacitor (JS du pont copié par `cap sync`)
  ]),
]);

export default eslintConfig;
