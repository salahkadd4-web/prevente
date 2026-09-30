/**
 * Dates de journée de travail. La « date du jour » est celle d'Algérie (Africa/Algiers = UTC+1 toute
 * l'année, sans changement d'heure — même convention que lib/period.ts), calculée côté serveur :
 * jamais depuis l'horloge ou le fuseau du navigateur.
 */
const OFFSET_MS = 3_600_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" du jour courant en Algérie. */
export function todayAlgiers(now: Date = new Date()): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Valeur pour une colonne @db.Date : minuit UTC du jour indiqué. */
export function workDateValue(isoDay: string): Date {
  if (!isIsoDate(isoDay)) throw new Error(`Date invalide : ${isoDay}`);
  return new Date(`${isoDay}T00:00:00.000Z`);
}

/** Jour ISO : 1 = lundi … 5 = vendredi … 7 = dimanche. */
export function isoWeekday(isoDay: string): number {
  const d = workDateValue(isoDay).getUTCDay(); // 0 = dimanche
  return d === 0 ? 7 : d;
}

export const FRIDAY = 5;

/** Vendredi : aucun client n'est chargé automatiquement. */
export function isFriday(isoDay: string): boolean {
  return isoWeekday(isoDay) === FRIDAY;
}

/** Jours planifiables, dans l'ordre de la semaine algérienne (samedi → jeudi). */
export const PLANNABLE_WEEKDAYS = [6, 7, 1, 2, 3, 4] as const;

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi", 7: "Dimanche",
};

export function isPlannableWeekday(n: number): boolean {
  return (PLANNABLE_WEEKDAYS as readonly number[]).includes(n);
}

export function formatWorkDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
