/**
 * Prix de vente « catalogue » effectif d'un parfum : le sien s'il en a un, sinon celui du produit.
 * À utiliser par le futur flux de création de commande pour remplir order_items.unit_price
 * (instantané copié à la commande : modifier le catalogue ensuite ne touche jamais les commandes existantes).
 */
export function effectiveSalePrice(
  variant: { salePrice: { toString(): string } | null },
  product: { salePrice: { toString(): string } | null },
): string | null {
  return (variant.salePrice ?? product.salePrice)?.toString() ?? null;
}
