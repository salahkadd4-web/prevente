import { describe, expect, it } from "vitest";
import { ORDER_TRANSITIONS, canTransition } from "@/lib/orders";
import {
  checkFinish, checkStart, deliveryState, isOrderEligible, orderNumberFromQuery, parseFailure, parseHistoryParams,
  parseOrderId, parseSearchParams, parseSection, progressPercent, type DeliveryContext,
} from "@/lib/livreur/rules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const ctx = (over: Partial<DeliveryContext> = {}): DeliveryContext => ({
  status: "assignee", workDayStatus: "cloturee", assignedDriverId: A, openAttemptDriverId: null, ...over,
});

describe("éligibilité après clôture de la journée du pré-vendeur", () => {
  it("une commande dont la journée est ouverte n'est pas disponible", () => {
    expect(isOrderEligible("assignee", "ouverte")).toBe(false);
    expect(checkStart(ctx({ workDayStatus: "ouverte" }), A)).toMatchObject({ ok: false });
  });
  it("après clôture elle devient éligible ; sans journée (créée par l'admin) aussi", () => {
    expect(isOrderEligible("assignee", "cloturee")).toBe(true);
    expect(isOrderEligible("en_livraison", "cloturee")).toBe(true);
    expect(isOrderEligible("assignee", null)).toBe(true);
  });
  it("brouillon, en attente (non affectée), livrée et annulée ne sont jamais à livrer", () => {
    for (const s of ["brouillon", "en_attente", "livree", "annulee"] as const) expect(isOrderEligible(s, "cloturee")).toBe(false);
  });
});

describe("commencer la livraison", () => {
  it("accepte une commande affectée, éligible", () => {
    expect(checkStart(ctx(), A)).toEqual({ ok: true, takeover: false });
  });
  it("refuse la commande d'un autre livreur ou non affectée, sans révéler laquelle", () => {
    const other = checkStart(ctx({ assignedDriverId: B }), A);
    const none = checkStart(ctx({ assignedDriverId: null }), A);
    expect(other).toMatchObject({ ok: false });
    expect(other).toEqual(none);
  });
  it("refuse une commande annulée ou déjà livrée", () => {
    expect(checkStart(ctx({ status: "annulee" }), A)).toMatchObject({ ok: false, error: expect.stringContaining("annulée") });
    expect(checkStart(ctx({ status: "livree" }), A)).toMatchObject({ ok: false, error: expect.stringContaining("déjà livrée") });
  });
  it("refuse un double démarrage mais autorise la reprise après réaffectation", () => {
    expect(checkStart(ctx({ status: "en_livraison", openAttemptDriverId: A }), A)).toMatchObject({ ok: false });
    expect(checkStart(ctx({ status: "en_livraison", openAttemptDriverId: B }), A)).toEqual({ ok: true, takeover: true });
    expect(checkStart(ctx({ status: "en_livraison", openAttemptDriverId: null }), A)).toEqual({ ok: true, takeover: false });
  });
});

describe("confirmer / échec : la livraison doit avoir été démarrée par ce livreur", () => {
  it("ok seulement en_livraison avec sa tentative ouverte", () => {
    expect(checkFinish(ctx({ status: "en_livraison", openAttemptDriverId: A }), A)).toEqual({ ok: true });
    expect(checkFinish(ctx(), A)).toMatchObject({ ok: false });
    expect(checkFinish(ctx({ status: "en_livraison", openAttemptDriverId: B }), A)).toMatchObject({ ok: false });
  });
  it("jamais pour la commande d'un autre, annulée ou déjà livrée", () => {
    expect(checkFinish(ctx({ status: "en_livraison", openAttemptDriverId: A, assignedDriverId: B }), A)).toMatchObject({ ok: false });
    expect(checkFinish(ctx({ status: "annulee" }), A)).toMatchObject({ ok: false });
    expect(checkFinish(ctx({ status: "livree" }), A)).toMatchObject({ ok: false });
  });
});

describe("livraison non effectuée", () => {
  it("motif obligatoire et connu", () => {
    expect(parseFailure("", "")).toEqual({ error: "Choisissez un motif." });
    expect(parseFailure("inconnu", "")).toEqual({ error: "Choisissez un motif." });
    expect(parseFailure("client_absent", "")).toEqual({ reason: "client_absent", comment: null });
  });
  it("« autre » exige un commentaire ; limite de longueur", () => {
    expect("error" in parseFailure("autre", "   ")).toBe(true);
    expect(parseFailure("autre", " Portail fermé ")).toEqual({ reason: "autre", comment: "Portail fermé" });
    expect("error" in parseFailure("client_absent", "x".repeat(301))).toBe(true);
  });
  it("transition en_livraison → assignee autorisée (même livreur), livrée / annulée restent définitives", () => {
    expect(canTransition("en_livraison", "assignee")).toBe(true);
    expect(ORDER_TRANSITIONS.livree).toEqual([]);
    expect(ORDER_TRANSITIONS.annulee).toEqual([]);
    expect(canTransition("annulee", "livree")).toBe(false);
  });
});

describe("états affichés", () => {
  it("une commande en cours n'est pas « livrée » ; l'échec est dérivé de la dernière tentative", () => {
    expect(deliveryState("en_livraison", null).label).toBe("En cours de livraison");
    expect(deliveryState("assignee", null).label).toBe("À livrer");
    expect(deliveryState("assignee", { result: "echec", endedAt: new Date() }).label).toContain("Échec");
    expect(deliveryState("livree", { result: "livree", endedAt: new Date() }).tone).toBe("ok");
  });
  it("progression bornée", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(1, 3)).toBe(25);
    expect(progressPercent(5, 0)).toBe(100);
  });
});

describe("paramètres d'URL (recherche et filtres)", () => {
  it("revalide q, page, section, statut et dates", () => {
    expect(parseSearchParams({ q: "  abc ", page: "0" })).toEqual({ q: "abc", page: 1 });
    expect(parseSearchParams({ q: "x".repeat(200), page: "3" })).toMatchObject({ page: 3 });
    expect(parseSection({ section: "echecs" })).toBe("echecs");
    expect(parseSection({ section: "n'importe quoi" })).toBe("tous");
    const h = parseHistoryParams({ status: "x", from: "2026-02-31", to: "2026-03-01" });
    expect(h.status).toBe("");
    expect(h.from).toBe("");
    expect(h.warnings.length).toBe(2);
    expect(parseHistoryParams({ from: "2026-03-02", to: "2026-03-01" })).toMatchObject({ from: "", to: "" });
    expect(parseHistoryParams({ status: "livree", from: "2026-03-01", to: "2026-03-02" })).toMatchObject({ status: "livree", from: "2026-03-01" });
  });
  it("identifiant de commande strict, numéro de commande", () => {
    expect(parseOrderId(A)).toBe(A);
    expect(parseOrderId("1; DROP TABLE")).toBeNull();
    expect(orderNumberFromQuery("#42")).toBe(42);
    expect(orderNumberFromQuery("épicerie")).toBeNull();
  });
});
