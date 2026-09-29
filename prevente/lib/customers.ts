import { optionalText, text } from "@/lib/form";

const MAPS_HOSTS = ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl", "goo.gl"];
const PHONE = /^\+?[0-9 .()-]{6,20}$/;

export type CustomerInput = {
  businessName: string;
  phone: string | null;
  address: string;
  googleMapsUrl: string | null;
  notes: string | null;
};

/** Lien Google Maps : https uniquement et hôte connu (jamais de javascript: ni de site tiers). */
function mapsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && MAPS_HOSTS.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Validation partagée admin / vendeur. */
export function parseCustomerForm(formData: FormData): { error: string } | { data: CustomerInput } {
  const businessName = text(formData, "businessName");
  const address = text(formData, "address");
  const phone = optionalText(formData, "phone");
  const rawMaps = optionalText(formData, "googleMapsUrl");
  const notes = optionalText(formData, "notes");

  if (!businessName || businessName.length > 120) return { error: "Nom de la boutique obligatoire (120 caractères max)." };
  if (!address || address.length > 300) return { error: "Adresse obligatoire (300 caractères max)." };
  if (phone && !PHONE.test(phone)) return { error: "Numéro de téléphone invalide." };
  if (notes && notes.length > 1000) return { error: "Notes : 1000 caractères max." };

  let googleMapsUrl: string | null = null;
  if (rawMaps) {
    googleMapsUrl = mapsUrl(rawMaps);
    if (!googleMapsUrl) return { error: "Le lien doit être un lien Google Maps (https://maps.app.goo.gl/… ou https://www.google.com/maps/…)." };
  }
  return { data: { businessName, phone, address, googleMapsUrl, notes } };
}
