import { logout } from "@/lib/auth/actions";
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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white"
            >
              G
            </div>
            <span className="text-base font-semibold text-slate-900">Grossiste Pro</span>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>

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
          Les fonctionnalités métier seront ajoutées prochainement.
        </p>
      </main>
    </div>
  );
}
