/** Utilitaires navigateur partagés pour préparer une photo avant l'envoi au serveur. */
export const MAX_SOURCE_BYTES = 15_000_000; // photo brute d'un téléphone : refus au-delà

/** Message d'erreur si le fichier choisi n'est pas une image exploitable, sinon null. */
export function checkPickedImage(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Ce fichier n'est pas une image.";
  if (file.size > MAX_SOURCE_BYTES) return "Photo trop volumineuse (15 Mo maximum).";
  return null;
}

/** Réduit la photo (max 1200 px, JPEG) : rapide sur mobile et sous la limite serveur (800 Ko). */
export async function shrink(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Image illisible ou format non pris en charge.");
  }
  for (const [side, quality] of [[1200, 0.8], [1000, 0.65], [800, 0.55]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= 750_000) {
      bitmap.close();
      return blob;
    }
  }
  bitmap.close();
  throw new Error("Image trop lourde même après réduction.");
}
