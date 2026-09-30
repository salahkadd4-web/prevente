import "server-only";

import { createHash } from "node:crypto";

/**
 * Cloudinary via l'API REST signée, sans dépendance supplémentaire.
 * Le secret ne quitte jamais le serveur ; la base ne stocke que public_id et secure_url.
 */
function config() {
  let cloud = process.env.CLOUDINARY_CLOUD_NAME;
  let key = process.env.CLOUDINARY_API_KEY;
  let secret = process.env.CLOUDINARY_API_SECRET;

  // Repli : CLOUDINARY_URL au format officiel « cloudinary://<clé>:<secret>@<cloud> ».
  if ((!cloud || !key || !secret) && process.env.CLOUDINARY_URL) {
    try {
      const url = new URL(process.env.CLOUDINARY_URL);
      if (url.protocol === "cloudinary:") {
        cloud = cloud || url.hostname;
        key = key || decodeURIComponent(url.username);
        secret = secret || decodeURIComponent(url.password);
      }
    } catch {
      // URL mal formée : on retombe sur l'erreur de configuration ci-dessous (sans afficher la valeur).
    }
  }

  if (!cloud || !key || !secret) {
    throw new Error("Cloudinary non configuré : définir CLOUDINARY_URL, ou CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET.");
  }
  return { cloud, key, secret };
}

export function signParams(params: Record<string, string | number>, secret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + secret).digest("hex");
}

export async function uploadImage(file: Blob, folder: string): Promise<{ publicId: string; secureUrl: string }> {
  const { cloud, key, secret } = config();
  const timestamp = Math.floor(Date.now() / 1000);

  const body = new FormData();
  body.set("file", file, "photo.jpg");
  body.set("api_key", key);
  body.set("timestamp", String(timestamp));
  body.set("folder", folder);
  body.set("signature", signParams({ folder, timestamp }, secret));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { public_id?: string; secure_url?: string; error?: { message?: string } };
  if (!res.ok || !json.public_id || !json.secure_url) {
    throw new Error(`Cloudinary upload : ${json.error?.message ?? res.status}`);
  }
  return { publicId: json.public_id, secureUrl: json.secure_url };
}

/** Suppression d'un fichier (un fichier déjà absent n'est pas une erreur). */
export async function deleteImage(publicId: string): Promise<void> {
  const { cloud, key, secret } = config();
  const timestamp = Math.floor(Date.now() / 1000);

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: key,
    signature: signParams({ public_id: publicId, timestamp }, secret),
  });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, { method: "POST", body });
  if (!res.ok) throw new Error(`Cloudinary destroy : ${res.status}`);
}
