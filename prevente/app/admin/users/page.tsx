import ActionForm from "@/components/action-form";
import AdminShell from "@/components/admin-shell";
import CollapsibleSection from "@/components/collapsible-section";
import ConfirmButton from "@/components/confirm-button";
import LiveSearch from "@/components/live-search";
import { badgeCls, badgeTone, btnGhost, btnPrimary, cardCls, inputCls, labelCls, summaryCls } from "@/components/ui";
import EmptyState from "@/components/empty-state";
import FilterChips from "@/components/filter-chips";
import { ROLES, ROLE_LABEL, isRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUser, resetUserPassword, setUserActive, updateUser } from "./actions";

export const metadata = { title: "Utilisateurs · Grossiste Pro" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/** E-mails depuis Supabase Auth (paginé) — les e-mails ne sont jamais copiés dans les tables métier. */
async function loadEmails(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const map = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    for (const u of data.users) map.set(u.id, u.email ?? "");
    if (data.users.length < 200) break;
  }
  return map;
}

export default async function Page({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireRole("admin");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 80).toLowerCase();
  const roleParam = one(sp.role);
  const role = isRole(roleParam) ? roleParam : "";
  const statusParam = one(sp.status);
  const status = statusParam === "active" || statusParam === "inactive" ? statusParam : "";

  const [profiles, emailById] = await Promise.all([
    prisma.profile.findMany({
      where: { ...(role ? { role } : {}), ...(status ? { isActive: status === "active" } : {}) },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      take: 1000,
    }),
    loadEmails(),
  ]);

  // Recherche nom / e-mail / rôle en mémoire : l'e-mail vit dans Supabase Auth, et l'effectif est réduit.
  const rows = q
    ? profiles.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          (emailById.get(p.id) ?? "").toLowerCase().includes(q) ||
          p.role.toLowerCase().includes(q) ||
          (isRole(p.role) && ROLE_LABEL[p.role].toLowerCase().includes(q)),
      )
    : profiles;
  const filtered = Boolean(q || role || status);

  return (
    <AdminShell current="users" title="Utilisateurs">
      <section className={cardCls}>
        <CollapsibleSection label="Ajouter un compte">
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
            <label htmlFor="u-pass" className={labelCls}>Mot de passe initial (8 caractères min.)</label>
            <input id="u-pass" name="password" type="text" required minLength={8} autoComplete="off" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}>Créer le compte</button>
          </div>
        </ActionForm>
        </CollapsibleSection>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold text-slate-900">Comptes</h2>
        <div className="mt-3">
          <LiveSearch id="f-q" label="Rechercher un compte" placeholder="Rechercher : nom, email ou rôle" />
        </div>
        <div className="mt-3 space-y-2">
          <FilterChips
            label="Filtrer par rôle"
            basePath="/admin/users"
            param="role"
            current={role}
            params={{ q: q || undefined, role: role || undefined, status: status || undefined }}
            options={[{ value: "", label: "Tous les rôles" }, ...ROLES.map((r) => ({ value: r as string, label: ROLE_LABEL[r] }))]}
          />
          <FilterChips
            label="Filtrer par statut"
            basePath="/admin/users"
            param="status"
            current={status}
            params={{ q: q || undefined, role: role || undefined, status: status || undefined }}
            options={[{ value: "", label: "Tous les statuts" }, { value: "active", label: "Actifs" }, { value: "inactive", label: "Désactivés" }]}
          />
        </div>
        <p className="mt-3 text-sm text-slate-600" aria-live="polite">{rows.length} compte{rows.length > 1 ? "s" : ""}</p>

        {rows.length === 0 && (
          <EmptyState
            title={filtered ? "Aucun compte ne correspond." : "Aucun compte."}
            hint={filtered ? "Modifiez la recherche ou les filtres." : "Créez un compte avec « Ajouter un compte » ci-dessus."}
            action={filtered ? { href: "/admin/users", label: "Réinitialiser" } : undefined}
          />
        )}
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.map((p) => {
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
                      {p.isActive ? (
                        <ConfirmButton message={`Désactiver le compte de ${p.fullName} ? Il ne pourra plus se connecter ; son historique est conservé.`} className={btnGhost}>
                          Désactiver
                        </ConfirmButton>
                      ) : (
                        <button type="submit" className={btnGhost}>Réactiver</button>
                      )}
                    </ActionForm>
                  )}
                </div>
                {manageable && (
                  <div className="mt-1 flex flex-wrap gap-x-4">
                    <details>
                      <summary className={summaryCls}>Modifier nom / rôle</summary>
                      <ActionForm action={updateUser} className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                        <input type="hidden" name="id" value={p.id} />
                        <input name="fullName" required maxLength={100} defaultValue={p.fullName} aria-label="Nom complet" className={inputCls} />
                        <select name="role" defaultValue={p.role} aria-label="Rôle" className={inputCls}>
                          <option value="vendeur">Pré-vendeur</option>
                          <option value="livreur">Livreur</option>
                        </select>
                        <ConfirmButton message="Enregistrer les modifications de ce compte ?" className={btnGhost + " h-12"}>Enregistrer</ConfirmButton>
                      </ActionForm>
                    </details>
                    <details>
                      <summary className={summaryCls}>Réinitialiser le mot de passe</summary>
                      <ActionForm action={resetUserPassword} className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input type="hidden" name="id" value={p.id} />
                        <input name="password" type="text" required minLength={8} autoComplete="off" placeholder="Nouveau mot de passe" aria-label="Nouveau mot de passe" className={inputCls} />
                        <ConfirmButton message={`Remplacer le mot de passe de ${p.fullName} ?`} className={btnGhost}>Valider</ConfirmButton>
                      </ActionForm>
                    </details>
                  </div>
                )}
                {p.role === "admin" && <p className="mt-1 text-xs text-slate-500">Compte administrateur : non modifiable depuis l&apos;interface.</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </AdminShell>
  );
}
