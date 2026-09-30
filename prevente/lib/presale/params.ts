type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export const MAX_Q = 80;

/** Paramètres d'URL des listes : toujours revalidés (jamais transmis tels quels à Prisma). */
export function parseListParams(raw: Raw, opts: { defaultLimit?: number; maxLimit?: number } = {}) {
  const q = one(raw.q).slice(0, MAX_Q);
  const pageNum = Number(one(raw.page));
  const page = Number.isSafeInteger(pageNum) && pageNum >= 1 && pageNum <= 100_000 ? pageNum : 1;
  const defaultLimit = opts.defaultLimit ?? 30;
  const maxLimit = opts.maxLimit ?? 300;
  const limitNum = Number(one(raw.limit));
  const limit = Number.isSafeInteger(limitNum) && limitNum >= defaultLimit ? Math.min(limitNum, maxLimit) : defaultLimit;
  const vue = one(raw.vue) === "tous" ? ("tous" as const) : ("jour" as const);
  return { q, page, limit, vue };
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== 0) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
