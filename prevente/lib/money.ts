/**
 * Montants : toujours manipulés comme CHAÎNES décimales (« 12.50 ») entre formulaire, serveur et
 * Prisma Decimal(12,2) — jamais via des flottants. Partagé client / serveur (aucune dépendance serveur).
 */
export const MAX_AMOUNT = "9999999999.99"; // Decimal(12,2) : 10 chiffres avant la virgule

export type MoneyResult = { value: string | null } | { error: string };

/**
 * Valide une saisie de montant : « 12 », « 12.5 », « 12,50 » (espaces ignorés). Refuse le négatif,
 * le non numérique, plus de 2 décimales et les valeurs hors capacité de la colonne.
 * Chaîne vide : `null` si `required` est faux, sinon erreur.
 */
export function parseMoney(raw: string, label: string, required = false): MoneyResult {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return required ? { error: `${label} obligatoire.` } : { value: null };
  if (s.startsWith("-")) return { error: `${label} : la valeur ne peut pas être négative.` };
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) {
    return { error: `${label} invalide : nombre positif avec 2 décimales maximum (ex. 1250 ou 1250,50).` };
  }
  return { value: Number(s).toFixed(2) };
}

/** Valeur de champ <input> à partir d'un Decimal/chaîne Prisma (point décimal, sans zéros inutiles). */
export function moneyInputValue(value: { toString(): string } | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.toString();
}
