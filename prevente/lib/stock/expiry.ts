/** Alerte d'expiration : à partir de 3 mois avant la date. */
export const EXPIRY_ALERT_MONTHS = 3;

function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Les lots dont expiresAt <= cette date sont « à signaler » (expirés inclus). */
export function alertLimitDate(now = new Date()): Date {
  const t = todayUtc(now);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + EXPIRY_ALERT_MONTHS, t.getUTCDate()));
}

export type ExpiryInfo = { tone: "expired" | "soon" | "ok" | "none"; label: string };

export function expiryInfo(expiresAt: Date | null, now = new Date()): ExpiryInfo {
  if (!expiresAt) return { tone: "none", label: "Sans date" };
  const days = Math.round((expiresAt.getTime() - todayUtc(now).getTime()) / 86_400_000);
  if (days < 0) return { tone: "expired", label: `Expiré depuis ${-days} j` };
  if (expiresAt <= alertLimitDate(now)) {
    return { tone: "soon", label: days === 0 ? "Expire aujourd'hui" : `Expire dans ${days} j` };
  }
  return { tone: "ok", label: "OK" };
}

export function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "—";
}
