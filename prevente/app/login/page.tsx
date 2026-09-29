import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/session";
import { isLoginNoticeKey, LOGIN_NOTICES, ROLE_HOME } from "@/lib/auth/roles";
import LoginForm from "./login-form";

export const metadata = {
  title: "Connexion · Grossiste Pro",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const state = await getSessionState();

  // Utilisateur déjà connecté : direction son espace.
  if (state.status === "ok") redirect(ROLE_HOME[state.profile.role]);
  // Session existante mais inutilisable : la supprimer proprement.
  if (state.status === "inactive") redirect("/auth/invalid?reason=desactive");
  if (state.status === "no_profile") redirect("/auth/invalid?reason=profil");

  const { error } = await searchParams;
  const key = Array.isArray(error) ? error[0] : error;
  const notice = isLoginNoticeKey(key) ? LOGIN_NOTICES[key] : undefined;
  const noticeIsInfo = key === "deconnecte";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            aria-hidden="true"
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-2xl font-bold text-white shadow-sm"
          >
            G
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Grossiste Pro
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Connectez-vous pour accéder à votre espace
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {notice && (
            <p
              role="status"
              className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
                noticeIsInfo
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {notice}
            </p>
          )}
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Accès réservé. Les comptes sont créés par l&apos;administrateur.
        </p>
      </div>
    </main>
  );
}
