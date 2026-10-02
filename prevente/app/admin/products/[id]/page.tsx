import { notFound } from "next/navigation";
import AdminShell from "@/components/admin-shell";
import { alertCls, cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { DEFAULT_FLAVOR_NAME, SALE_UNITS, SALE_UNIT_LABEL } from "@/lib/catalog";
import { isUuid } from "@/lib/form";
import { moneyInputValue } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import ProductEditor, { type EditorProduct } from "../product-editor";

export const metadata = { title: "Détails du produit · Grossiste Pro" };

export default async function Page({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const saved = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: { orderBy: { name: "asc" } } },
  });
  if (!product) notFound();

  // Quantité de chaque parfum = somme de ses lots disponibles (même calcul que la liste).
  const variantIds = product.variants.map((v) => v.id);
  const stock = variantIds.length
    ? await prisma.stockLot.groupBy({
        by: ["variantId"],
        where: { variantId: { in: variantIds }, availableQuantity: { gt: 0 } },
        _sum: { availableQuantity: true },
      })
    : [];
  const qtyByVariant = new Map(stock.map((s) => [s.variantId, s._sum.availableQuantity ?? 0]));

  // Produit sans parfum : son stock (parfum technique « Sans parfum ») s'édite comme la quantité du produit.
  const technical = product.variants.find((v) => v.name === DEFAULT_FLAVOR_NAME);
  const flavors = product.variants.filter((v) => v.name !== DEFAULT_FLAVOR_NAME);
  const rows = flavors.length > 0 ? product.variants : [];

  const data: EditorProduct = {
    id: product.id,
    name: product.name,
    saleUnit: product.saleUnit,
    salePrice: moneyInputValue(product.salePrice),
    description: product.description ?? "",
    imageUrl: product.imageSecureUrl,
    quantity: flavors.length === 0 && technical ? qtyByVariant.get(technical.id) ?? 0 : 0,
    flavors: rows.map((v) => ({
      id: v.id,
      name: v.name,
      salePrice: moneyInputValue(v.salePrice),
      quantity: qtyByVariant.get(v.id) ?? 0,
      imageUrl: v.imageSecureUrl,
      isActive: v.isActive,
      technical: v.name === DEFAULT_FLAVOR_NAME,
    })),
  };

  return (
    <AdminShell current="products" title={product.name} back={{ href: "/admin/products", label: "Produits et stock" }}>
      {saved === "1" && <p role="status" className={alertCls.info}>Produit enregistré.</p>}
      {saved === "photo-failed" && (
        <p role="status" className={alertCls.warn}>Produit enregistré, mais une ou plusieurs photos n&apos;ont pas pu être envoyées. Réessayez.</p>
      )}

      <section className={cardCls}>
        {/* La clé recrée le formulaire avec les valeurs enregistrées après chaque enregistrement. */}
        <ProductEditor
          key={JSON.stringify(data)}
          product={data}
          units={SALE_UNITS.map((u) => ({ value: u, label: SALE_UNIT_LABEL[u] }))}
        />
      </section>
    </AdminShell>
  );
}
