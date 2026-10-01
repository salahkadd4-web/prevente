// Génère l'icône « G » vert de Grossiste Pro : icône web (app/icon.svg) et sources des icônes
// et écrans de démarrage Android (resources/), ensuite déclinés par `npx capacitor-assets generate`.
// Usage : node scripts/generate-app-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const GREEN = "#047857"; // emerald-700, le vert du logo de l'en-tête
const WHITE = "#ffffff";

/** Le « G » tracé en chemin (aucune police requise), centré sur une toile de 1024 px. */
function glyph(scale, color) {
  const r = 236 * scale;
  const w = 104 * scale;
  const c = 512;
  const sx = c + r * Math.SQRT1_2;
  const sy = c - r * Math.SQRT1_2;
  return `<path d="M ${sx} ${sy} A ${r} ${r} 0 1 0 ${c + r} ${c} L ${c + 28 * scale} ${c}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="miter" stroke-linecap="butt"/>`;
}

const svg = (body, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;

const roundedLogo = svg(`<rect width="1024" height="1024" rx="224" fill="${GREEN}"/>${glyph(1, WHITE)}`);
// Icône d'ancienne génération : carré plein, le lanceur applique son propre masque.
const iconOnly = svg(`<rect width="1024" height="1024" fill="${GREEN}"/>${glyph(0.85, WHITE)}`);
// Icône adaptative : capacitor-assets la réduit déjà de 16,7 % par côté (zone sûre), d'où l'échelle 1.
const iconForeground = svg(glyph(1, WHITE));
const iconBackground = svg(`<rect width="1024" height="1024" fill="${GREEN}"/>`);

const SPLASH = 2732;
const LOGO = 560;
const offset = (SPLASH - LOGO) / 2;
const splash = (bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH}" height="${SPLASH}"><rect width="100%" height="100%" fill="${bg}"/><svg x="${offset}" y="${offset}" width="${LOGO}" height="${LOGO}" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="224" fill="${GREEN}"/>${glyph(1, WHITE)}</svg></svg>`;

const png = (markup, file) => sharp(Buffer.from(markup)).png().toFile(file);

await mkdir("resources", { recursive: true });
await writeFile("app/icon.svg", roundedLogo);
await Promise.all([
  png(iconOnly, "resources/icon-only.png"),
  png(iconForeground, "resources/icon-foreground.png"),
  png(iconBackground, "resources/icon-background.png"),
  png(splash(WHITE), "resources/splash.png"),
  png(splash("#0f172a"), "resources/splash-dark.png"),
]);
console.log("Icônes générées : app/icon.svg, resources/*.png");
