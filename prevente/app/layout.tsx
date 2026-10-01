import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// Une seule famille : largeur normale pour le texte, élargie pour les titres et les chiffres (classe `font-display`).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Grossiste Pro",
  description: "Gestion commerciale pour grossiste alimentaire",
  applicationName: "Grossiste Pro",
};

export const viewport: Viewport = {
  // Barre d'état du téléphone dans le vert de l'en-tête.
  themeColor: "#064e3b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
