/**
 * Montants : aucune arithmétique en virgule flottante. Les prix sont des chaînes décimales
 * (« 12.50 », comme Prisma Decimal(12,2)) converties en centimes BigInt pour les calculs.
 */
const DECIMAL = /^\d{1,10}(\.\d{1,2})?$/;

export function toCents(value: string): bigint {
  const s = value.trim();
  if (!DECIMAL.test(s)) throw new Error(`Montant invalide : ${value}`);
  const [int, frac = ""] = s.split(".");
  return BigInt(int) * BigInt(100) + BigInt(frac.padEnd(2, "0"));
}

export function centsToString(cents: bigint): string {
  const neg = cents < BigInt(0);
  const abs = neg ? -cents : cents;
  const int = abs / BigInt(100);
  const frac = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${int}.${frac}`;
}

export function lineTotalCents(unitPrice: string, quantity: number): bigint {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Quantité invalide.");
  return toCents(unitPrice) * BigInt(quantity);
}

export function sumCents(values: bigint[]): bigint {
  return values.reduce((a, b) => a + b, BigInt(0));
}

/** Total d'une liste de lignes { unitPrice, quantity }, en chaîne décimale exacte. */
export function orderTotalString(lines: { unitPrice: string; quantity: number }[]): string {
  return centsToString(sumCents(lines.map((l) => lineTotalCents(l.unitPrice, l.quantity))));
}
