export const ROLES = ["admin", "vendeur", "livreur"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin/dashboard",
  vendeur: "/vendeur/dashboard",
  livreur: "/livreur/dashboard",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrateur",
  vendeur: "Pré-vendeur",
  livreur: "Livreur",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Préfixes d'URL privés : toute requête sous ces chemins exige une session. */
export const PRIVATE_PREFIXES = ["/admin", "/vendeur", "/livreur"] as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Messages affichables sur /login, choisis via une clé (jamais du texte libre dans l'URL). */
export const LOGIN_NOTICES = {
  session: "Votre session a expiré. Veuillez vous reconnecter.",
  desactive:
    "Ce compte est désactivé. Contactez l'administrateur pour retrouver l'accès.",
  profil:
    "Aucun profil n'est associé à ce compte. Contactez l'administrateur.",
  erreur: "Une erreur est survenue. Veuillez réessayer dans un instant.",
  deconnecte: "Vous avez été déconnecté.",
} as const;

export type LoginNoticeKey = keyof typeof LOGIN_NOTICES;

export function isLoginNoticeKey(value: unknown): value is LoginNoticeKey {
  return typeof value === "string" && value in LOGIN_NOTICES;
}
