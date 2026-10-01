import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Adresse de l'application Next.js déployée sur Vercel.
 * L'application a besoin de son serveur (actions serveur, Prisma, Supabase) : l'APK n'embarque
 * pas le site, il l'ouvre en plein écran dans une WebView. CAP_SERVER_URL permet de viser une
 * autre adresse au moment de `npx cap sync` (ex. `npm run dev` sur le réseau local).
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://grossiste-pro.vercel.app";

const config: CapacitorConfig = {
  appId: "com.grossistepro.app",
  appName: "Grossiste Pro",
  // Pages locales embarquées : « adresse non configurée » et « pas de connexion ».
  webDir: "capacitor-www",
  backgroundColor: "#eef1ec",
  server: serverUrl
    ? {
        url: serverUrl,
        // Affichée quand le serveur est injoignable (pas de réseau en tournée).
        errorPath: "offline.html",
        // Autorise http:// uniquement pour tester contre `npm run dev` sur le réseau local.
        cleartext: serverUrl.startsWith("http://"),
      }
    : undefined,
  plugins: {
    SystemBars: {
      // Marges natives : le contenu ne passe ni sous la barre d'état ni sous la barre de navigation.
      insetsHandling: "native",
      // Icônes claires sur les bandes vert camion (couleur posée par android:windowBackground).
      style: "DARK",
    },
  },
};

export default config;
