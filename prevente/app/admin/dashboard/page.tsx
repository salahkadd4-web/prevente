import Link from "next/link";
import AdminShell from "@/components/admin-shell";
import { cardCls } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { alertLimitDate } from "@/lib/stock/expiry";

export const metadata = {
  title: "Administration · Grossiste Pro",
};

export default async function Page() {
  const profile = await requireRole("admin");

  const [customers, products, users, expiring] = await Promise.all([
    prisma.customer.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.profile.count({ where: { isActive: true, role: { in: ["vendeur", "livreur"] } } }),
    prisma.stockLot.count({ where: { availableQuantity: { gt: 0 }, expiresAt: { lte: alertLimitDate() } } }),
  ]);

  return (
    <AdminShell current="dashboard" title={`Bonjour ${profile.full_name}`}>
      {expiring > 0 && (
        <Link
          href="/admin/stock"
          className="block rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-inset ring-amber-300"
        >
          <strong>{expiring}</strong> lot{expiring > 1 ? "s" : ""} en stock expire{expiring > 1 ? "nt" : ""} dans moins de 3 mois (ou
          {expiring > 1 ? " sont" : " est"} déjà expiré{expiring > 1 ? "s" : ""}). Voir le stock →
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/customers" className={cardCls}>
          <p className="text-3xl font-semibold text-slate-900">{customers}</p>
          <p className="mt-1 text-sm text-slate-600">clients actifs — fiches et historique</p>
        </Link>
        <Link href="/admin/products" className={cardCls}>
          <p className="text-3xl font-semibold text-slate-900">{products}</p>
          <p className="mt-1 text-sm text-slate-600">produits actifs — gérer le catalogue</p>
        </Link>
        <Link href="/admin/users" className={cardCls}>
          <p className="text-3xl font-semibold text-slate-900">{users}</p>
          <p className="mt-1 text-sm text-slate-600">vendeurs et livreurs actifs — gérer les comptes</p>
        </Link>
      </div>
    </AdminShell>
  );
}
