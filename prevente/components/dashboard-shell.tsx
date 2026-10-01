import AppHeader from "@/components/app-header";
import { ROLE_LABEL } from "@/lib/auth/roles";
import type { Profile } from "@/lib/auth/session";

export default function DashboardShell({
  title,
  profile,
}: {
  title: string;
  profile: Profile;
}) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <AppHeader space={ROLE_LABEL[profile.role]} />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-[1.75rem] leading-tight text-slate-900 sm:text-3xl">{title}</h1>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-slate-500">Utilisateur connecté</dt>
              <dd className="mt-1 text-lg font-medium text-slate-900">{profile.full_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Rôle</dt>
              <dd className="mt-1">
                <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  {ROLE_LABEL[profile.role]}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <p className="mt-6 text-sm text-slate-500">
          Les fonctionnalités de livraison seront ajoutées prochainement.
        </p>
      </main>
    </div>
  );
}
