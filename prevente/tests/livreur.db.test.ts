/**
 * Tests d'INTÉGRATION du module livreur contre une base PostgreSQL JETABLE (migrations 002 à 007 appliquées).
 * Ils ne tournent que si LIVREUR_TEST_DATABASE_URL est défini ET pointe vers localhost : ils ne
 * peuvent jamais viser la vraie base (DATABASE_URL du projet est ignoré).
 *   LIVREUR_TEST_DATABASE_URL=postgresql://gp:gp@localhost:5432/gp_scratch npx vitest run tests/livreur.db.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const URL_ = process.env.LIVREUR_TEST_DATABASE_URL ?? "";
const SAFE = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL_);

let current: { id: string; full_name: string; role: "livreur" } = { id: "", full_name: "", role: "livreur" };

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Client Prisma à une seule connexion vers la base jetable (voir tests/helpers/test-db.ts).
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./helpers/test-db")).testPrisma() }));
vi.mock("@/lib/auth/session", () => ({
  requireLivreurAction: async () => {
    if (!current.id) throw new Error("Accès refusé");
    return current;
  },
}));

describe.skipIf(!SAFE)("module livreur — base jetable", () => {
  type Prisma = typeof import("@/lib/prisma")["prisma"];
  let prisma: Prisma;
  let actions: typeof import("@/app/livreur/actions");
  let queries: typeof import("@/lib/livreur/queries");
  let adminDash: typeof import("@/lib/admin/dashboard");
  let periodLib: typeof import("@/lib/period");

  const ids = { admin: randomUUID(), vendeur: randomUUID(), a: randomUUID(), b: randomUUID(), customer: randomUUID(), variant: randomUUID(), product: randomUUID(), lot: randomUUID() };
  const asDriver = (id: string, name: string) => { current = { id, full_name: name, role: "livreur" }; };
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const today = () => periodLib.resolvePeriod({ period: "today" });

  async function makeOrder(opts: { dayStatus?: "ouverte" | "cloturee" | null; status?: "brouillon" | "en_attente" | "assignee" | "annulee"; driver?: string | null; unit?: string; qty?: number } = {}) {
    const { dayStatus = "cloturee", status = "assignee", driver = ids.a, unit = "100.00", qty = 3 } = opts;
    let workDayId: string | null = null;
    if (dayStatus) {
      const day = await prisma.workDay.create({
        data: {
          vendeurId: ids.vendeur, workDate: new Date(Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 1e9) * 86_400_00),
          status: dayStatus, closedAt: dayStatus === "cloturee" ? new Date() : null,
        },
      });
      workDayId = day.id;
    }
    const order = await prisma.order.create({
      data: {
        customerId: ids.customer, createdById: ids.vendeur, status, workDayId,
        items: { create: [{ variantId: ids.variant, productNameSnapshot: "Biscuit", flavorNameSnapshot: "Chocolat", saleUnitSnapshot: "carton", quantity: qty, unitPrice: unit }] },
      },
    });
    if (driver) await prisma.orderAssignment.create({ data: { orderId: order.id, driverId: driver, assignedById: ids.admin } });
    return order;
  }
  const status = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
  const attempts = (id: string) => prisma.deliveryAttempt.findMany({ where: { orderId: id }, orderBy: { startedAt: "asc" } });
  const revenue = async (driver: string, p = today()) => Number((await queries.getDriverDashboard(driver, p)).revenueInPeriod);

  afterAll(async () => { await prisma?.$disconnect(); });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_;
    prisma = (await import("@/lib/prisma")).prisma;
    actions = await import("@/app/livreur/actions");
    queries = await import("@/lib/livreur/queries");
    adminDash = await import("@/lib/admin/dashboard");
    periodLib = await import("@/lib/period");

    for (const [id, role, name] of [[ids.admin, "admin", "Admin"], [ids.vendeur, "vendeur", "Vendeur"], [ids.a, "livreur", "Livreur A"], [ids.b, "livreur", "Livreur B"]] as const) {
      await prisma.$executeRaw`INSERT INTO auth.users (id, email) VALUES (${id}::uuid, ${id + "@test.local"})`;
      await prisma.profile.create({ data: { id, fullName: name, role } });
    }
    await prisma.customer.create({ data: { id: ids.customer, businessName: "Épicerie du Port", phone: "0555123456", address: "12 rue des Oliviers", createdById: ids.vendeur } });
    await prisma.product.create({ data: { id: ids.product, name: "Biscuit", saleUnit: "carton", salePrice: "100.00" } });
    await prisma.productVariant.create({ data: { id: ids.variant, productId: ids.product, name: "Chocolat" } });
    await prisma.stockLot.create({ data: { id: ids.lot, variantId: ids.variant, lotNumber: "L1", initialQuantity: 50, availableQuantity: 50 } });
  });

  it("une commande dont la journée est ouverte n'est ni listée ni livrable ; après clôture elle l'est", async () => {
    const o = await makeOrder({ dayStatus: "ouverte" });
    asDriver(ids.a, "Livreur A");
    expect((await queries.listToDeliver(ids.a, "", 1)).rows.map((r) => r.id)).not.toContain(o.id);
    expect(await actions.startDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("clôturée") });
    expect(await status(o.id)).toBe("assignee");

    await prisma.workDay.update({ where: { id: o.workDayId! }, data: { status: "cloturee", closedAt: new Date() } });
    expect((await queries.listToDeliver(ids.a, "", 1)).rows.map((r) => r.id)).toContain(o.id);
  });

  it("le livreur ne voit et ne livre que ses commandes ; rien d'un autre livreur", async () => {
    const o = await makeOrder({ driver: ids.a });
    asDriver(ids.b, "Livreur B");
    expect((await queries.listToDeliver(ids.b, "", 1)).rows.map((r) => r.id)).not.toContain(o.id);
    expect(await queries.getOrderForDriver(ids.b, o.id)).toBeNull();
    expect(await actions.startDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("non affectée") });
    expect(await actions.confirmDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.any(String) });
    expect(await status(o.id)).toBe("assignee");
    expect(await attempts(o.id)).toHaveLength(0);
    // Un non-livreur (session absente) est refusé par la garde serveur.
    current = { id: "", full_name: "", role: "livreur" };
    await expect(actions.startDelivery({}, fd({ orderId: o.id }))).rejects.toThrow("Accès refusé");
  });

  it("commencer → en cours (non compté), double démarrage refusé, stock inchangé", async () => {
    const o = await makeOrder();
    asDriver(ids.a, "Livreur A");
    const before = await revenue(ids.a);
    expect(await actions.startDelivery({}, fd({ orderId: o.id }))).toEqual({ ok: "Livraison commencée." });
    expect(await status(o.id)).toBe("en_livraison");
    expect(await actions.startDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("déjà en cours") });
    const list = await attempts(o.id);
    expect(list).toHaveLength(1);
    expect(list[0].result).toBe("en_cours");
    expect(await revenue(ids.a)).toBe(before); // en cours ≠ livrée
    const hist = await prisma.orderStatusHistory.findMany({ where: { orderId: o.id } });
    expect(hist.map((h) => h.toStatus)).toEqual(["en_livraison"]);
    expect((await prisma.stockLot.findUniqueOrThrow({ where: { id: ids.lot } })).availableQuantity).toBe(50);
  });

  it("confirmer : CA +300 une seule fois, double confirmation sans effet, heure et livreur enregistrés", async () => {
    const o = await makeOrder({ unit: "100.00", qty: 3 });
    asDriver(ids.a, "Livreur A");
    const before = await revenue(ids.a);
    const doneBefore = (await queries.getDriverDashboard(ids.a, today())).deliveredInPeriod;
    // Confirmer sans avoir commencé : refusé.
    expect(await actions.confirmDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("Commencez") });
    await actions.startDelivery({}, fd({ orderId: o.id }));
    expect(await actions.confirmDelivery({}, fd({ orderId: o.id }))).toEqual({ ok: "Livraison confirmée." });
    expect(await actions.confirmDelivery({}, fd({ orderId: o.id }))).toEqual({ ok: "Cette livraison était déjà confirmée." });
    expect(await status(o.id)).toBe("livree");
    const [att] = await attempts(o.id);
    expect(att.result).toBe("livree");
    expect(att.driverId).toBe(ids.a);
    expect(att.endedAt).not.toBeNull();
    expect(await revenue(ids.a)).toBe(before + 300);
    expect((await queries.getDriverDashboard(ids.a, today())).deliveredInPeriod).toBe(doneBefore + 1);
    const livreeRows = await prisma.orderStatusHistory.count({ where: { orderId: o.id, toStatus: "livree" } });
    expect(livreeRows).toBe(1);
    expect((await prisma.stockLot.findUniqueOrThrow({ where: { id: ids.lot } })).availableQuantity).toBe(50);
    // Livrée : n'apparaît plus parmi les commandes à livrer, reste consultable.
    expect((await queries.listToDeliver(ids.a, "", 1)).rows.map((r) => r.id)).not.toContain(o.id);
    expect(await queries.getOrderForDriver(ids.a, o.id)).not.toBeNull();
    // Pas de modification possible après livraison.
    expect(await actions.startDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("déjà livrée") });
  });

  it("deux confirmations simultanées : une seule livraison comptée", async () => {
    const o = await makeOrder({ unit: "50.00", qty: 2 });
    asDriver(ids.a, "Livreur A");
    await actions.startDelivery({}, fd({ orderId: o.id }));
    const before = await revenue(ids.a);
    const results = await Promise.all([1, 2, 3].map(() => actions.confirmDelivery({}, fd({ orderId: o.id }))));
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await attempts(o.id)).filter((a) => a.result === "livree")).toHaveLength(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: o.id, toStatus: "livree" } })).toBe(1);
    expect(await revenue(ids.a)).toBe(before + 100);
  });

  it("échec : motif obligatoire, CA inchangé, commande reste affectée, nouvelle tentative avec historique conservé", async () => {
    const o = await makeOrder({ unit: "10.00", qty: 5 });
    asDriver(ids.a, "Livreur A");
    await actions.startDelivery({}, fd({ orderId: o.id }));
    const before = await revenue(ids.a);
    const failedBefore = (await queries.getDriverDashboard(ids.a, today())).failedInPeriod;
    expect(await actions.failDelivery({}, fd({ orderId: o.id, reason: "" }))).toMatchObject({ error: "Choisissez un motif." });
    expect(await actions.failDelivery({}, fd({ orderId: o.id, reason: "autre", comment: "" }))).toMatchObject({ error: expect.stringContaining("Précisez") });
    expect(await actions.failDelivery({}, fd({ orderId: o.id, reason: "client_absent", comment: "Boutique fermée" }))).toMatchObject({ ok: expect.any(String) });
    expect(await status(o.id)).toBe("assignee");
    expect(await revenue(ids.a)).toBe(before);
    expect((await queries.getDriverDashboard(ids.a, today())).failedInPeriod).toBe(failedBefore + 1);
    // Reste dans les commandes du livreur, classée « échec » aujourd'hui.
    expect((await queries.listToDeliver(ids.a, "", 1)).rows.find((r) => r.id === o.id)?.last?.result).toBe("echec");
    expect((await queries.listDay(ids.a, "echecs", "", 1)).rows.map((r) => r.id)).toContain(o.id);
    expect((await queries.listDay(ids.a, "a_livrer", "", 1)).rows.map((r) => r.id)).not.toContain(o.id);
    // Nouvelle tentative puis réussite : les deux tentatives sont conservées.
    expect(await actions.startDelivery({}, fd({ orderId: o.id }))).toMatchObject({ ok: expect.any(String) });
    expect((await queries.listDay(ids.a, "en_cours", "", 1)).rows.map((r) => r.id)).toContain(o.id);
    await actions.confirmDelivery({}, fd({ orderId: o.id }));
    const list = await attempts(o.id);
    expect(list.map((a) => a.result)).toEqual(["echec", "livree"]);
    expect(list[0]).toMatchObject({ failureReason: "client_absent", comment: "Boutique fermée" });
    expect(await revenue(ids.a)).toBe(before + 50);
    expect((await queries.listDay(ids.a, "livrees", "", 1)).rows.map((r) => r.id)).toContain(o.id);
    expect((await queries.listDay(ids.a, "echecs", "", 1)).rows.map((r) => r.id)).not.toContain(o.id);
  });

  it("une commande annulée ne peut pas être livrée ni listée", async () => {
    const o = await makeOrder({ status: "annulee" });
    asDriver(ids.a, "Livreur A");
    expect((await queries.listToDeliver(ids.a, "", 1)).rows.map((r) => r.id)).not.toContain(o.id);
    expect(await actions.startDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("annulée") });
    // Annulée pendant la livraison : confirmation refusée.
    const o2 = await makeOrder();
    await actions.startDelivery({}, fd({ orderId: o2.id }));
    await prisma.order.update({ where: { id: o2.id }, data: { status: "annulee" } });
    expect(await actions.confirmDelivery({}, fd({ orderId: o2.id }))).toMatchObject({ error: expect.stringContaining("annulée") });
  });

  it("réaffectation en cours de livraison : l'ancienne tentative est « interrompue », le nouveau livreur reprend", async () => {
    const o = await makeOrder();
    asDriver(ids.a, "Livreur A");
    await actions.startDelivery({}, fd({ orderId: o.id }));
    // L'ancien livreur ne peut plus confirmer après réaffectation (simulée comme assignDriver de l'admin).
    await prisma.orderAssignment.updateMany({ where: { orderId: o.id, unassignedAt: null }, data: { unassignedAt: new Date() } });
    await prisma.orderAssignment.create({ data: { orderId: o.id, driverId: ids.b, assignedById: ids.admin } });
    expect(await actions.confirmDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("non affectée") });
    asDriver(ids.b, "Livreur B");
    expect(await actions.startDelivery({}, fd({ orderId: o.id }))).toMatchObject({ ok: expect.any(String) });
    expect((await attempts(o.id)).map((a) => [a.driverId === ids.a ? "A" : "B", a.result])).toEqual([["A", "interrompue"], ["B", "en_cours"]]);
    const failedA = (await queries.getDriverDashboard(ids.a, today())).failedInPeriod;
    expect(failedA).toBeGreaterThanOrEqual(0);
    expect(await actions.confirmDelivery({}, fd({ orderId: o.id }))).toMatchObject({ ok: "Livraison confirmée." });
  });

  it("CA : prix historiques (pas le catalogue), exclut les livraisons hors période, cohérent avec le CA admin", async () => {
    const o = await makeOrder({ unit: "70.00", qty: 4 });
    asDriver(ids.a, "Livreur A");
    await actions.startDelivery({}, fd({ orderId: o.id }));
    await actions.confirmDelivery({}, fd({ orderId: o.id }));
    const before = await revenue(ids.a);
    await prisma.product.update({ where: { id: ids.product }, data: { salePrice: "999.00" } });
    expect(await revenue(ids.a)).toBe(before);
    // Même commande déplacée à hier : sort de « aujourd'hui », reste dans « 7 jours ».
    const week = periodLib.resolvePeriod({ period: "7d" });
    const weekBefore = await revenue(ids.a, week);
    await prisma.$executeRaw`UPDATE public.delivery_attempts SET ended_at = now() - interval '1 day', started_at = now() - interval '1 day 1 hour' WHERE order_id = ${o.id}::uuid`;
    expect(await revenue(ids.a)).toBe(before - 280);
    expect(await revenue(ids.a, week)).toBe(weekBefore);
    // Le CA du pré-vendeur côté admin (par l'historique de statuts) compte aussi cette commande.
    const vendors = await adminDash.getVendorRevenue(week);
    const v = vendors.find((x) => x.id === ids.vendeur)!;
    expect(v.revenue).toBeGreaterThanOrEqual(280);
  });

  it("recherche serveur combinée aux sections et à l'historique (filtres statut / dates)", async () => {
    const o = await makeOrder({ unit: "5.00", qty: 1 });
    asDriver(ids.a, "Livreur A");
    const byName = await queries.listToDeliver(ids.a, "port", 1);
    expect(byName.rows.map((r) => r.id)).toContain(o.id);
    expect((await queries.listToDeliver(ids.a, "0555123", 1)).rows.map((r) => r.id)).toContain(o.id);
    expect((await queries.listToDeliver(ids.a, `#${o.number}`, 1)).rows.map((r) => r.id)).toEqual([o.id]);
    expect((await queries.listToDeliver(ids.a, "introuvable-xyz", 1)).total).toBe(0);
    expect((await queries.listDay(ids.a, "en_cours", `#${o.number}`, 1)).total).toBe(0);
    await actions.startDelivery({}, fd({ orderId: o.id }));
    expect((await queries.listDay(ids.a, "en_cours", `#${o.number}`, 1)).total).toBe(1);
    await actions.failDelivery({}, fd({ orderId: o.id, reason: "client_injoignable" }));

    const all = await queries.listHistory(ids.a, { q: "", page: 1, status: "", from: "", to: "" });
    const fails = await queries.listHistory(ids.a, { q: "", page: 1, status: "echec", from: "", to: "" });
    const done = await queries.listHistory(ids.a, { q: "", page: 1, status: "livree", from: "", to: "" });
    expect(all.total).toBe(fails.total + done.total);
    expect(fails.rows.every((r) => r.result === "echec")).toBe(true);
    expect(done.rows.every((r) => r.result === "livree")).toBe(true);
    const todayDay = periodLib.algiersToday();
    expect((await queries.listHistory(ids.a, { q: `#${o.number}`, page: 1, status: "", from: todayDay, to: todayDay })).total).toBe(1);
    expect((await queries.listHistory(ids.a, { q: "", page: 1, status: "", from: "2001-01-01", to: "2001-01-02" })).total).toBe(0);
    // Historique du livreur B : rien des tentatives de A.
    expect((await queries.listHistory(ids.b, { q: `#${o.number}`, page: 1, status: "", from: "", to: "" })).total).toBe(0);
  });

  it("le total affiché d'une commande = somme des lignes historiques", async () => {
    const o = await makeOrder({ unit: "19.99", qty: 3 });
    const row = (await queries.listToDeliver(ids.a, `#${o.number}`, 1)).rows[0];
    expect(row.total).toBe("59.97");
    const detail = await queries.getOrderForDriver(ids.a, o.id);
    expect(detail?.items[0].unitPrice.toString()).toBe("19.99");
  });

  it("les contraintes de la migration refusent un état incohérent", async () => {
    const o = await makeOrder();
    await expect(prisma.deliveryAttempt.create({ data: { orderId: o.id, driverId: ids.a, result: "echec", endedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.deliveryAttempt.create({ data: { orderId: o.id, driverId: ids.a, result: "echec", endedAt: new Date(), failureReason: "autre" } })).rejects.toThrow();
    await prisma.deliveryAttempt.create({ data: { orderId: o.id, driverId: ids.a } });
    await expect(prisma.deliveryAttempt.create({ data: { orderId: o.id, driverId: ids.b } })).rejects.toThrow(); // une seule tentative ouverte
  });
});
