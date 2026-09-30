import { SaleUnit } from "@/app/generated/prisma/enums";

export const SALE_UNIT_LABEL: Record<SaleUnit, string> = {
  carton: "Carton",
  sachet: "Sachet",
  triplette: "Triplette",
  pot: "Pot",
  boite: "Boîte",
  bouteille: "Bouteille",
  unite: "Unité",
};

export const SALE_UNITS = Object.values(SaleUnit) as SaleUnit[];

export function isSaleUnit(value: string): value is SaleUnit {
  return (SALE_UNITS as string[]).includes(value);
}

/** Miniature Cloudinary (recadrée, format et qualité automatiques). */
export function thumbUrl(secureUrl: string, size = 96): string {
  return secureUrl.replace("/upload/", `/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`);
}

/**
 * Nom du parfum technique créé automatiquement pour un produit SANS parfum : le stock et
 * les commandes se rattachent toujours à un parfum, cette variante unique en tient lieu.
 */
export const DEFAULT_FLAVOR_NAME = "Sans parfum";

/** Libellé d'une ligne : « Produit — Parfum », ou simplement « Produit » pour un produit sans parfum. */
export function itemLabel(productName: string, flavorName: string, separator = " — "): string {
  return flavorName === DEFAULT_FLAVOR_NAME ? productName : `${productName}${separator}${flavorName}`;
}
