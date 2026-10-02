import { redirect } from "next/navigation";

/** La page Stock est fusionnée dans « Produits et stock » : les anciens liens et favoris continuent de fonctionner. */
export default async function Page({ searchParams }: PageProps<"/admin/stock">) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const key of ["filter", "q"] as const) {
    const v = Array.isArray(sp[key]) ? sp[key][0] : sp[key];
    if (v) p.set(key, v);
  }
  const qs = p.toString();
  redirect(qs ? `/admin/products?${qs}` : "/admin/products");
}
