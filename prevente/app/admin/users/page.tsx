import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";
import { ROLE_LABEL, isRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUser, resetUserPassword, setUserActive } from "./actions";

export const metadata = { title: "Utilisateurs · Grossiste Pro" };

export default async function Page() {
  const me = await requireRole("admin");

  const [profiles, authUsers] = await Promise.all([
    prisma.profile.findMany({ orderBy: [{ role: "asc" }, { fullName: "asc" }] }),
    createAdminClient().auth.admin.listUsers({ perPage: 200 }),
  ]);
  const emailById = new Map((authUsers.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return (
    <AdminShell current="users" title="Vendeurs et livreurs">
      <section className={cardCls}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Nouveau compte</h2>
        <ActionForm action={createUser} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="u-name" className={labelCls}>Nom complet</label>
            <input id="u-name" name="fullName" required maxLength={100} autoComplete="off" className={inputCls} />
          </div>
          <div>
            <label htmlFor="u-role" className={labelCls}>Rôle</label>
            <select id="u-role" name="role" required defaultValue="" className={inputCls}>
              <option value="" disabled>Choisir…</option>
              <option value="vendeur">Pré-vendeur</option>
              <option value="livreur">Livreur</option>
            </select>
          </div>
          <div>
            <label htmlFor="u-email" className={labelCls}>Email (sert d&apos;identifiant)</label>
            <input id="u-email" name="email" type="email" required autoComplete="off" className={inputCls} />
          </div>
          <div>
            <label htmlFor="u-pass" className={labelCls}>Mot de passe (8 caractères min.)</label>
            <input id="u-pass" name="password" type="text" required minLength={8} autoComplete="off" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}>Créer le compte</button>
          </div>
        </ActionForm>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Comptes</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {profiles.map((p) => {
            const manageable = p.role !== "admin" && p.id !== me.id;
            return (
              <li key={p.id} className={`py-3 ${p.isActive ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{p.fullName}</p>
                    <p className="text-sm text-slate-600">{emailById.get(p.id) || "—"}</p>
                    <p className="mt-1 flex gap-2">
                      <span className={`${badgeCls} ${badgeTone.none}`}>{isRole(p.role) ? ROLE_LABEL[p.role] : p.role}</span>
                      {!p.isActive && <span className={`${badgeCls} ${badgeTone.expired}`}>Désactivé</span>}
                    </p>
                  </div>
                  {manageable && (
                    <ActionForm action={setUserActive}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.isActive)} />
                      <button type="submit" className={btnGhost}>{p.isActive ? "Désactiver" : "Réactiver"}</button>
                    </ActionForm>
                  )}
                </div>
                {manageable && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-emerald-800">Changer le mot de passe</summary>
                    <ActionForm action={resetUserPassword} className="mt-2 flex gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="password" type="text" required minLength={8} autoComplete="off" placeholder="Nouveau mot de passe" aria-label="Nouveau mot de passe" className={inputCls} />
                      <button type="submit" className={btnGhost}>Valider</button>
                    </ActionForm>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </AdminShell>
  );
}
