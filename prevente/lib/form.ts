export type ActionResult = { error?: string; ok?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function optionalText(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

/** Entier strict (chaîne vide ou décimal => null). */
export function integer(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** "YYYY-MM-DD" => Date UTC à minuit (colonnes @db.Date). */
export function dateOnly(formData: FormData, key: string): Date | null {
  const raw = text(formData, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? null : d;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
