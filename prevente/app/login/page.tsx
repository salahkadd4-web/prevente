import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/session";
import { isLoginNoticeKey, LOGIN_NOTICES, ROLE_HOME } from "@/lib/auth/roles";
import { alertCls } from "@/components/ui";
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
    <main className="flex min-h-dvh flex-col bg-slate-50">
      {/* Bande vert camion : le seul grand moment visuel de l'application. */}
      <div className="bg-emerald-900 px-4 pb-20 pt-14 text-white sm:pt-20">
        <div className="mx-auto flex w-full max-w-md flex-col items-start">
          <div aria-hidden="true" className="font-display flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-4xl text-emerald-800">
            G
          </div>
          <h1 className="font-display mt-6 text-[2.5rem] leading-none sm:text-5xl">Grossiste Pro</h1>
          <p className="mt-3 text-base text-emerald-100/85">Commandes, tournées et livraisons</p>
        </div>
      </div>

      <div className="mx-auto -mt-12 w-full max-w-md px-4 pb-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="font-display mb-5 text-xl text-slate-900">Connexion</h2>
          {notice && (
            <p role="status" className={`mb-5 ${noticeIsInfo ? alertCls.info : alertCls.warn}`}>
              {notice}
            </p>
          )}
          <LoginForm />
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Accès réservé. Les comptes sont créés par l&apos;administrateur.
        </p>
      </div>
    </main>
  );
}
