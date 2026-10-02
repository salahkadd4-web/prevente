/**
 * Règle métier : la quantité d'un produit n'est JAMAIS saisie ni stockée à part. Elle est la somme des
 * quantités disponibles de tous ses parfums (stock rattaché à la variante, par lots) ; un produit sans
 * parfum utilise son parfum technique « Sans parfum ». Une seule source de calcul pour la liste et les
 * détails : la somme des parfums affichés égale donc toujours la quantité du produit.
 */

/** Quantité disponible d'un parfum = somme des quantités disponibles de ses lots (jamais négative). */
export function variantQuantity(lots: readonly { availableQuantity: number }[]): number {
  return lots.reduce((n, l) => n + (l.availableQuantity > 0 ? l.availableQuantity : 0), 0);
}

/** Quantité d'un produit = somme des quantités de TOUS ses parfums (actifs ou non : ils portent du stock réel). */
export function productQuantity(variantIds: readonly string[], qtyByVariant: ReadonlyMap<string, number>): number {
  return variantIds.reduce((n, id) => n + (qtyByVariant.get(id) ?? 0), 0);
}
