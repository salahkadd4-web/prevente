import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import VendeurShell from "@/components/vendeur/vendeur-shell";
import ActionForm from "@/components/action-form";
import CustomerFields from "@/components/customer-fields";
import SubmitButton from "@/components/submit-button";
import { btnPrimary, cardCls } from "@/components/ui";
import { createCustomerForDay } from "@/app/vendeur/actions";
import { requireRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/form";
import { getOwnDay } from "@/lib/presale/queries";

export const metadata = { title: "Nouveau client · Grossiste Pro" };

export default async function Page({ params }: PageProps<"/vendeur/jour/[dayId]/clients/nouveau">) {
  const profile = await requireRole("vendeur");
  const { dayId } = await params;
  if (!isUuid(dayId)) notFound();
  const day = await getOwnDay(profile.id, dayId);
  if (!day) notFound();
  const back = `/vendeur/jour/${dayId}/clients`;
  if (day.status !== "ouverte") redirect(back);

  return (
    <VendeurShell current="clients" title="Nouveau client" dayId={dayId}>
      <section className={cardCls}>
        <p className="mb-4 text-sm text-slate-600">
          Enregistrez un client rencontré sur le terrain. Il sera ajouté à la base et à votre journée en cours.
        </p>
        <ActionForm action={createCustomerForDay} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="dayId" value={dayId} />
          <CustomerFields prefix="new" />
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <SubmitButton pendingLabel="Enregistrement…" className={btnPrimary}>Enregistrer le client</SubmitButton>
            <Link href={back} className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-base font-semibold text-slate-800 hover:bg-slate-100">Annuler</Link>
          </div>
        </ActionForm>
      </section>
    </VendeurShell>
  );
}
