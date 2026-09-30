import { describe, expect, it } from "vitest";
import { isFriday, isoWeekday, todayAlgiers, workDateValue, isIsoDate, isPlannableWeekday } from "@/lib/presale/dates";
import { centsToString, lineTotalCents, orderTotalString, toCents } from "@/lib/presale/money";
import {
  canVisitTransition, isDayEditable, isNoOrderReason, parseOrderLines, parseQuantity, vendeurOrderState,
} from "@/lib/presale/rules";
import { parseListParams } from "@/lib/presale/params";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

describe("dates (Algérie, UTC+1)", () => {
  it("bascule au jour suivant à 23h UTC (minuit à Alger)", () => {
    expect(todayAlgiers(new Date("2026-09-29T22:59:59Z"))).toBe("2026-09-29");
    expect(todayAlgiers(new Date("2026-09-29T23:00:00Z"))).toBe("2026-09-30");
  });
  it("jour ISO et vendredi", () => {
    expect(isoWeekday("2026-09-30")).toBe(3); // mercredi
    expect(isFriday("2026-10-02")).toBe(true);
    expect(isFriday("2026-10-03")).toBe(false); // samedi
    expect(isoWeekday("2026-10-04")).toBe(7); // dimanche
  });
  it("le vendredi n'est pas planifiable, samedi → jeudi oui", () => {
    expect(isPlannableWeekday(5)).toBe(false);
    for (const d of [6, 7, 1, 2, 3, 4]) expect(isPlannableWeekday(d)).toBe(true);
  });
  it("valide les dates", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(() => workDateValue("nope")).toThrow();
    expect(workDateValue("2026-09-30").toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
});

describe("montants exacts", () => {
  it("évite les erreurs de flottants", () => {
    expect(0.1 * 3).not.toBe(0.3); // rappel du problème
    expect(centsToString(lineTotalCents("0.10", 3))).toBe("0.30");
    expect(centsToString(lineTotalCents("19.99", 3))).toBe("59.97");
  });
  it("calcule les totaux de plusieurs lignes", () => {
    expect(orderTotalString([
      { unitPrice: "1250.50", quantity: 2 },
      { unitPrice: "300", quantity: 3 },
      { unitPrice: "0.05", quantity: 7 },
    ])).toBe("3401.35");
  });
  it("refuse les montants invalides", () => {
    expect(() => toCents("-1")).toThrow();
    expect(() => toCents("1.234")).toThrow();
    expect(() => toCents("abc")).toThrow();
  });
  it("gère de très grands montants sans perte", () => {
    expect(centsToString(lineTotalCents("9999999999.99", 99999))).toBe("999989999999000.01");
  });
});

describe("quantités et lignes de commande", () => {
  it("vide ou zéro = non sélectionné", () => {
    expect(parseQuantity("")).toEqual({ quantity: 0 });
    expect(parseQuantity("0")).toEqual({ quantity: 0 });
    expect(parseQuantity(undefined)).toEqual({ quantity: 0 });
  });
  it("refuse négatif, décimal, texte, trop grand", () => {
    for (const bad of ["-1", "1.5", "abc", "1e3", "100000"]) expect("error" in parseQuantity(bad)).toBe(true);
  });
  it("commande plusieurs produits / variantes et ignore les quantités nulles", () => {
    const r = parseOrderLines(JSON.stringify([
      { variantId: U1, quantity: 2 }, { variantId: U2, quantity: "3" }, { variantId: "33333333-3333-4333-8333-333333333333", quantity: 0 },
    ]));
    expect(r).toEqual({ lines: [{ variantId: U1, quantity: 2 }, { variantId: U2, quantity: 3 }] });
  });
  it("refuse les doublons, identifiants invalides et JSON illisible", () => {
    expect("error" in parseOrderLines(JSON.stringify([{ variantId: U1, quantity: 1 }, { variantId: U1, quantity: 2 }]))).toBe(true);
    expect("error" in parseOrderLines(JSON.stringify([{ variantId: "x", quantity: 1 }]))).toBe(true);
    expect("error" in parseOrderLines("{")).toBe(true);
  });
  it("ignore tout prix ou total envoyé par le navigateur", () => {
    const r = parseOrderLines(JSON.stringify([{ variantId: U1, quantity: 1, unitPrice: "0.01", total: "0" }]));
    expect(r).toEqual({ lines: [{ variantId: U1, quantity: 1 }] });
  });
});

describe("états et transitions", () => {
  it("transitions de visite", () => {
    expect(canVisitTransition("en_cours", "commandee")).toBe(true);
    expect(canVisitTransition("en_cours", "sans_commande")).toBe(true);
    expect(canVisitTransition("sans_commande", "en_cours")).toBe(true);
    expect(canVisitTransition("commandee", "annulee")).toBe(false);
  });
  it("journée clôturée non modifiable", () => {
    expect(isDayEditable("ouverte")).toBe(true);
    expect(isDayEditable("cloturee")).toBe(false);
  });
  it("motifs sans commande", () => {
    expect(isNoOrderReason("client_absent")).toBe(true);
    expect(isNoOrderReason("pas_de_besoin")).toBe(true);
    expect(isNoOrderReason("autre")).toBe(false);
  });
  it("état d'une commande côté pré-vendeur", () => {
    expect(vendeurOrderState({ status: "brouillon", confirmedAt: null }).label).toBe("À confirmer");
    expect(vendeurOrderState({ status: "brouillon", confirmedAt: new Date() }).label).toBe("Confirmée");
    expect(vendeurOrderState({ status: "en_attente", confirmedAt: new Date() }).label).toBe("Transmise");
    expect(vendeurOrderState({ status: "annulee", confirmedAt: new Date() }).label).toBe("Annulée");
  });
});

describe("paramètres de recherche", () => {
  it("revalide q, page, limit, vue", () => {
    expect(parseListParams({ q: "  abc  ", page: "0", limit: "9999", vue: "x" })).toEqual({ q: "abc", page: 1, limit: 300, vue: "jour" });
    expect(parseListParams({ q: "x".repeat(200) }).q).toHaveLength(80);
    expect(parseListParams({ page: "3", vue: "tous" })).toMatchObject({ page: 3, vue: "tous" });
  });
});
