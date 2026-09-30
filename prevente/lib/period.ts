/**
 * Périodes de reporting. Les bornes sont calculées en heure d'Algérie
 * (Africa/Algiers = UTC+1 toute l'année, sans changement d'heure) puis
 * converties en instants UTC pour les requêtes : [start, end[ (fin exclusive).
 */
const OFFSET = "+01:00";
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const PERIODS = ["today", "7d", "month", "custom"] as const;
export type PeriodKey = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Aujourd'hui",
  "7d": "7 derniers jours",
  month: "Mois courant",
  custom: "Période personnalisée",
};

export type Period = {
  key: PeriodKey;
  /** Instant UTC de début (inclus). */
  start: Date;
  /** Instant UTC de fin (exclu). */
  end: Date;
  /** Jours "YYYY-MM-DD" (heure d'Algérie), fin incluse, pour préremplir les champs. */
  fromDay: string;
  toDay: string;
  label: string;
};

export function isPeriodKey(value: unknown): value is PeriodKey {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

/** "YYYY-MM-DD" strict et réel (refuse 2026-02-31). */
export function isIsoDay(value: string | undefined | null): value is string {
  if (!value || !ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Jour civil courant en Algérie, "YYYY-MM-DD". */
export function algiersToday(now = new Date()): string {
  return new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Début (inclus) d'un jour algérien, en instant UTC. */
export function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000${OFFSET}`);
}

/** Début du jour suivant (borne de fin exclusive). */
export function dayEndExclusive(day: string): Date {
  return dayStart(addDays(day, 1));
}

const MAX_CUSTOM_DAYS = 731;

/**
 * Construit la période à partir des paramètres d'URL, sans jamais faire
 * confiance à l'entrée : valeur inconnue => mois courant ; dates invalides ou
 * inversées => mois courant également (avec `error` pour informer l'utilisateur).
 */
export function resolvePeriod(
  params: { period?: string; from?: string; to?: string },
  now = new Date(),
): Period & { error?: string } {
  const today = algiersToday(now);
  const monthStart = `${today.slice(0, 7)}-01`;

  const build = (key: PeriodKey, fromDay: string, toDay: string): Period => ({
    key,
    fromDay,
    toDay,
    start: dayStart(fromDay),
    end: dayEndExclusive(toDay),
    label:
      key === "custom"
        ? `du ${fromDay.split("-").reverse().join("/")} au ${toDay.split("-").reverse().join("/")}`
        : PERIOD_LABEL[key].toLowerCase(),
  });

  const key = isPeriodKey(params.period) ? params.period : "month";
  if (key === "today") return build("today", today, today);
  if (key === "7d") return build("7d", addDays(today, -6), today);
  if (key === "month") return build("month", monthStart, today);

  if (!isIsoDay(params.from) || !isIsoDay(params.to)) {
    return { ...build("month", monthStart, today), error: "Dates invalides : le mois courant est affiché." };
  }
  if (params.from > params.to) {
    return { ...build("month", monthStart, today), error: "La date de début doit précéder la date de fin : le mois courant est affiché." };
  }
  const span = (Date.parse(params.to) - Date.parse(params.from)) / DAY_MS;
  if (span > MAX_CUSTOM_DAYS) {
    return { ...build("month", monthStart, today), error: "Période trop longue (2 ans maximum) : le mois courant est affiché." };
  }
  return build("custom", params.from, params.to);
}
