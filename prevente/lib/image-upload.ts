import "server-only";

/** Limite serveur d'une image envoyée (l'image est déjà réduite côté navigateur). */
export const MAX_IMAGE_BYTES = 800_000;

/**
 * Validation serveur d'une image reçue : jamais de confiance au type MIME
 * annoncé par le navigateur, on contrôle aussi la signature du fichier (JPEG).
 */
export async function validateJpeg(file: unknown): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return "Aucune image reçue.";
  if (file.size > MAX_IMAGE_BYTES) return "Image trop lourde (800 Ko maximum après réduction).";
  if (file.type !== "image/jpeg") return "Format d'image non pris en charge (JPEG attendu).";
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) return "Le fichier n'est pas une image JPEG valide.";
  return null;
}
