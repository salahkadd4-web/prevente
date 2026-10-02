import "server-only";

import { revalidatePath } from "next/cache";

/** Rafraîchit la page Produits (qui porte aussi le stock), ses pages Détails et le tableau de bord. */
export function revalidateCatalog() {
  revalidatePath("/admin/products");
  revalidatePath("/admin/products/[id]", "page");
  revalidatePath("/admin/dashboard");
}
