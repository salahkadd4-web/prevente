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
