/**
 * Test d'intégration DE BOUT EN BOUT, sur base PostgreSQL JETABLE (migrations 001 à 007 appliquées) :
 *   Admin (produits, stock, client, planning) → Pré-vendeur (journée, visite, commande, clôture)
 *   → Admin (affectation) → Livreur (démarrage, échec, livraison) → statistiques des trois rôles.
 * Ce sont les VRAIES Server Actions qui sont appelées ; seule la lecture de session Supabase est
 * simulée (même règle que lib/auth/session.ts : le rôle doit correspondre, sinon « Accès refusé »).
 *
 * Ne tourne que si LIVREUR_TEST_DATABASE_URL pointe vers localhost (voir tests/helpers/test-db.ts) :
 *   LIVREUR_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5544/postgres npx vitest run tests/workflow.db.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_DB_SAFE } from "./helpers/test-db";

type Role = "admin" | "vendeur" | "livreur";
let current: { id: string; full_name: string; role: Role } | null = null;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/lib/cloudinary", () => ({ uploadImage: async () => { throw new Error("hors test"); }, deleteImage: async () => {} }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./helpers/test-db")).testPrisma() }));
vi.mock("@/lib/auth/session", () => {
  const guard = (role: Role) => async () => {
    if (!current || current.role !== role) throw new Error("Accès refusé");
    return current;
  };
  return { requireAdminAction: guard("admin"), requireVendeurAction: guard("vendeur"), requireLivreurAction: guard("livreur") };
});

describe.skipIf(!TEST_DB_SAFE)("workflow complet Admin → Pré-vendeur → Livreur — base jetable", () => {
  type Prisma = typeof import("@/lib/prisma")["prisma"];
  let prisma: Prisma;
  let admin: { orders: typeof import("@/app/admin/orders/actions"); products: typeof import("@/app/admin/products/actions"); stock: typeof import("@/app/admin/stock/actions"); customers: typeof import("@/app/admin/customers/actions"); planning: typeof import("@/app/admin/planning/actions") };
  let vendeur: typeof import("@/app/vendeur/actions");
  let livreur: typeof import("@/app/livreur/actions");
  let presaleQ: typeof import("@/lib/presale/queries");
  let livreurQ: typeof import("@/lib/livreur/queries");
  let adminDash: typeof import("@/lib/admin/dashboard");
  let periodLib: typeof import("@/lib/period");
  let dates: typeof import("@/lib/presale/dates");

  const users = {
    admin: { id: randomUUID(), full_name: "Admin Test", role: "admin" as const },
    v1: { id: randomUUID(), full_name: "Vendeur Un", role: "vendeur" as const },
    v2: { id: randomUUID(), full_name: "Vendeur Deux", role: "vendeur" as const },
    a: { id: randomUUID(), full_name: "Livreur A", role: "livreur" as const },
    b: { id: randomUUID(), full_name: "Livreur B", role: "livreur" as const },
  };
  const as = (u: (typeof users)[keyof typeof users] | null) => { current = u; };
  const fd = (o: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    return f;
  };
  /** Exécute une action qui se termine par redirect() : renvoie l'URL, ou le résultat si pas de redirection. */
  async function redirected(p: Promise<unknown>): Promise<string | unknown> {
    try { return await p; } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m.startsWith("REDIRECT:")) return m.slice(9);
      throw e;
    }
  }
  const lines = (l: { variantId: string; quantity: number | string }[]) => JSON.stringify(l);
  const today = () => periodLib.resolvePeriod({ period: "today" });
  const lot = (id: string) => prisma.stockLot.findUniqueOrThrow({ where: { id } });
  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  // Catalogue créé par l'admin dans le test.
  const cat = { product: "", choco: "", vanille: "", inactive: "", noPrice: "", lotChocoSoon: "", lotChocoLate: "", lotVanille: "" };
  let customerId = "";
  let customer2Id = "";
  let dayId = "";

  afterAll(async () => { await prisma?.$disconnect(); });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    admin = {
      orders: await import("@/app/admin/orders/actions"),
      products: await import("@/app/admin/products/actions"),
      stock: await import("@/app/admin/stock/actions"),
      customers: await import("@/app/admin/customers/actions"),
      planning: await import("@/app/admin/planning/actions"),
    };
    vendeur = await import("@/app/vendeur/actions");
    livreur = await import("@/app/livreur/actions");
    presaleQ = await import("@/lib/presale/queries");
    livreurQ = await import("@/lib/livreur/queries");
    adminDash = await import("@/lib/admin/dashboard");
    periodLib = await import("@/lib/period");
    dates = await import("@/lib/presale/dates");

    // Comptes : créés comme le ferait Supabase Auth + public.profiles (hors application).
    for (const u of Object.values(users)) {
      await prisma.$executeRaw`INSERT INTO auth.users (id, email) VALUES (${u.id}::uuid, ${u.id + "@test.local"})`;
      await prisma.profile.create({ data: { id: u.id, fullName: u.full_name, role: u.role } });
    }
  });

  // ------------------------------------------------------------------------------------------
  // Étape A — préparation par l'admin
  // ------------------------------------------------------------------------------------------
  it("A. l'admin prépare catalogue, prix, stock, client et planning ; les autres rôles sont refusés", async () => {
    as(users.admin);
    expect(await admin.products.createProduct({}, fd({ name: "Biscuit WF", saleUnit: "carton", salePrice: "100" }))).toMatchObject({ ok: expect.any(String) });
    expect(await admin.products.createProduct({}, fd({ name: "Sans prix WF", saleUnit: "sachet", salePrice: "" }))).toMatchObject({ ok: expect.any(String) });
    expect(await admin.products.createProduct({}, fd({ name: "Prix négatif", saleUnit: "sachet", salePrice: "-5" }))).toMatchObject({ error: expect.stringContaining("négative") });
    cat.product = (await prisma.product.findFirstOrThrow({ where: { name: "Biscuit WF" } })).id;
    const noPriceProduct = (await prisma.product.findFirstOrThrow({ where: { name: "Sans prix WF" } })).id;

    // Chocolat : prix du produit (100) ; Vanille : prix propre (12,50) ; Fraise : désactivée.
    await admin.products.createVariant({}, fd({ productId: cat.product, name: "Chocolat", salePrice: "" }));
    await admin.products.createVariant({}, fd({ productId: cat.product, name: "Vanille", salePrice: "12,50" }));
    await admin.products.createVariant({}, fd({ productId: cat.product, name: "Fraise", salePrice: "" }));
    await admin.products.createVariant({}, fd({ productId: noPriceProduct, name: "Nature", salePrice: "" }));
    const v = await prisma.productVariant.findMany({ where: { productId: { in: [cat.product, noPriceProduct] } } });
    cat.choco = v.find((x) => x.name === "Chocolat")!.id;
    cat.vanille = v.find((x) => x.name === "Vanille")!.id;
    cat.inactive = v.find((x) => x.name === "Fraise")!.id;
    cat.noPrice = v.find((x) => x.name === "Nature")!.id;
    expect(v.find((x) => x.name === "Vanille")!.salePrice?.toString()).toBe("12.5");
    expect(await admin.products.setVariantActive({}, fd({ id: cat.inactive, active: "false" }))).toMatchObject({ ok: expect.any(String) });
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: cat.inactive } })).isActive).toBe(false);

    // Stock : deux lots de chocolat (FEFO : le plus proche de l'expiration d'abord), un de vanille.
    expect(await admin.stock.createLot({}, fd({ variantId: cat.choco, quantity: "10", expiresAt: future(400), lotNumber: "CH-LATE", unitCost: "60" }))).toMatchObject({ ok: expect.any(String) });
    expect(await admin.stock.createLot({}, fd({ variantId: cat.choco, quantity: "4", expiresAt: future(30), lotNumber: "CH-SOON", unitCost: "55" }))).toMatchObject({ ok: expect.any(String) });
    expect(await admin.stock.createLot({}, fd({ variantId: cat.vanille, quantity: "20", expiresAt: future(200), lotNumber: "VA-1" }))).toMatchObject({ ok: expect.any(String) });
    expect(await admin.stock.createLot({}, fd({ variantId: cat.choco, quantity: "0", expiresAt: future(200) }))).toMatchObject({ error: expect.any(String) });
    const lots = await prisma.stockLot.findMany({ where: { variantId: { in: [cat.choco, cat.vanille] } } });
    cat.lotChocoSoon = lots.find((l) => l.lotNumber === "CH-SOON")!.id;
    cat.lotChocoLate = lots.find((l) => l.lotNumber === "CH-LATE")!.id;
    cat.lotVanille = lots.find((l) => l.lotNumber === "VA-1")!.id;

    expect(await admin.customers.createCustomer({}, fd({ businessName: "Supérette WF", address: "1 rue du Test", phone: "0555 11 22 33" }))).toMatchObject({ ok: expect.any(String) });
    expect(await admin.customers.createCustomer({}, fd({ businessName: "Kiosque WF", address: "2 rue du Test" }))).toMatchObject({ ok: expect.any(String) });
    expect(await admin.customers.createCustomer({}, fd({ businessName: "X", address: "y", phone: "abc" }))).toMatchObject({ error: expect.stringContaining("téléphone") });
    customerId = (await prisma.customer.findFirstOrThrow({ where: { businessName: "Supérette WF" } })).id;
    customer2Id = (await prisma.customer.findFirstOrThrow({ where: { businessName: "Kiosque WF" } })).id;

    // Planning : le client est prévu aujourd'hui pour Vendeur Un (sauf vendredi, interdit par la règle).
    const wd = dates.isoWeekday(dates.todayAlgiers());
    if (wd !== 5) {
      expect(await admin.planning.setCustomerSchedule({}, fd({ vendeurId: users.v1.id, customerId, weekday: String(wd) }))).toMatchObject({ ok: expect.any(String) });
    }
    expect(await admin.planning.setCustomerSchedule({}, fd({ vendeurId: users.v1.id, customerId, weekday: "5" }))).toMatchObject({ error: expect.stringContaining("vendredi") });
    // Planning pour un livreur : refusé.
    expect(await admin.planning.setCustomerSchedule({}, fd({ vendeurId: users.a.id, customerId, weekday: "1" }))).toMatchObject({ error: expect.any(String) });

    // Permissions : un pré-vendeur ou un livreur appelant directement une action admin est refusé.
    for (const u of [users.v1, users.a, null]) {
      as(u);
      await expect(admin.products.createProduct({}, fd({ name: "Pirate", saleUnit: "carton", salePrice: "1" }))).rejects.toThrow("Accès refusé");
      await expect(admin.orders.changeOrderStatus({}, fd({ id: randomUUID(), status: "livree" }))).rejects.toThrow("Accès refusé");
      await expect(admin.stock.correctLotQuantity({}, fd({ id: cat.lotVanille, quantity: "999", reason: "pirate" }))).rejects.toThrow("Accès refusé");
    }
    as(users.a);
    await expect(vendeur.startDay()).rejects.toThrow("Accès refusé");
    as(users.v1);
    await expect(livreur.startDelivery({}, fd({ orderId: randomUUID() }))).rejects.toThrow("Accès refusé");
    expect(await prisma.product.count({ where: { name: "Pirate" } })).toBe(0);
  });

  // ------------------------------------------------------------------------------------------
  // Étape B — commande par le pré-vendeur
  // ------------------------------------------------------------------------------------------
  it("B. journée démarrée une seule fois, clients du planning chargés, commande multi-produits au bon total", async () => {
    as(users.v1);
    expect(await vendeur.startDay()).toEqual({ ok: "Journée démarrée." });
    expect(await vendeur.startDay()).toEqual({ ok: "Journée démarrée." }); // idempotent
    const days = await prisma.workDay.findMany({ where: { vendeurId: users.v1.id } });
    expect(days).toHaveLength(1);
    dayId = days[0].id;
    expect(days[0].workDate.toISOString().slice(0, 10)).toBe(dates.todayAlgiers());

    const inDay = await prisma.workDayCustomer.findMany({ where: { workDayId: dayId } });
    if (dates.isoWeekday(dates.todayAlgiers()) !== 5) expect(inDay.map((x) => [x.customerId, x.source])).toEqual([[customerId, "planning"]]);
    else expect(await vendeur.addCustomerToDay({}, fd({ dayId, customerId }))).toMatchObject({ ok: expect.any(String) });
    expect(await vendeur.addCustomerToDay({}, fd({ dayId, customerId: customer2Id }))).toMatchObject({ ok: expect.any(String) });
    expect(await vendeur.addCustomerToDay({}, fd({ dayId, customerId: customer2Id }))).toMatchObject({ error: expect.stringContaining("déjà") });

    // Visite → saisie sans commencer la visite : refusée.
    const ids = { dayId, customerId };
    expect(await redirected(vendeur.saveOrderDraft({}, fd({ ...ids, lines: lines([{ variantId: cat.choco, quantity: 1 }]) })))).toMatchObject({ error: expect.stringContaining("visite") });
    expect(await redirected(vendeur.startVisit(fd(ids)))).toBe(`/vendeur/jour/${dayId}/visite/${customerId}`);

    // Saisies invalides : refusées sans rien écrire.
    for (const [raw, msg] of [
      [lines([{ variantId: cat.choco, quantity: -2 }]), "entier positif"],
      [lines([{ variantId: cat.choco, quantity: "1.5" }]), "entier positif"],
      [lines([{ variantId: cat.choco, quantity: 100_000 }]), "maximale"],
      [lines([{ variantId: cat.choco, quantity: 0 }]), "au moins un produit"],
      [lines([{ variantId: cat.choco, quantity: 1 }, { variantId: cat.choco, quantity: 2 }]), "deux fois"],
      ["pas du json", "illisibles"],
      [lines([{ variantId: cat.inactive, quantity: 1 }]), "inactif"],
      [lines([{ variantId: cat.noPrice, quantity: 1 }]), "prix"],
      [lines([{ variantId: randomUUID(), quantity: 1 }]), "n'existe plus"],
    ] as const) {
      expect(await redirected(vendeur.saveOrderDraft({}, fd({ ...ids, lines: raw })))).toMatchObject({ error: expect.stringContaining(msg) });
    }
    expect(await prisma.order.count({ where: { workDayId: dayId } })).toBe(0);

    // Commande valide : 3 × chocolat (100) + 4 × vanille (12,50) = 350,00 ; prix envoyés par le navigateur ignorés.
    const tampered = JSON.stringify([{ variantId: cat.choco, quantity: 3, unitPrice: "0.01" }, { variantId: cat.vanille, quantity: 4, unitPrice: "0" }]);
    expect(await redirected(vendeur.saveOrderDraft({}, fd({ ...ids, lines: tampered })))).toBe(`/vendeur/jour/${dayId}/visite/${customerId}/recap`);
    const order = await prisma.order.findFirstOrThrow({ where: { workDayId: dayId }, include: { items: true } });
    expect(order.status).toBe("brouillon");
    expect(order.confirmedAt).toBeNull();
    expect(order.createdById).toBe(users.v1.id);
    expect(order.items.map((i) => [i.flavorNameSnapshot, i.quantity, i.unitPrice.toString(), i.saleUnitSnapshot]).sort()).toEqual([["Chocolat", 3, "100", "carton"], ["Vanille", 4, "12.5", "carton"]]);
    // Brouillon non confirmé : hors compteurs et hors CA.
    expect(await presaleQ.getDayCounters(dayId)).toMatchObject({ confirmedOrders: 0, revenue: "0" });

    // Confirmation (double clic = sans effet).
    expect(await redirected(vendeur.confirmOrder({}, fd(ids)))).toBe(`/vendeur/jour/${dayId}/clients`);
    expect(await redirected(vendeur.confirmOrder({}, fd(ids)))).toBe(`/vendeur/jour/${dayId}/clients`);
    expect(await prisma.order.count({ where: { workDayId: dayId } })).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, note: "Confirmée par le pré-vendeur" } })).toBe(1);
    const counters = await presaleQ.getDayCounters(dayId);
    expect(counters).toMatchObject({ confirmedOrders: 1, visitedCustomers: 1 });
    expect(Number(counters.revenue)).toBe(350);
    // Le stock n'est pas touché avant la clôture.
    expect((await lot(cat.lotChocoSoon)).availableQuantity).toBe(4);
  });

  it("B'. un autre pré-vendeur ne peut ni lire ni modifier la journée / commande", async () => {
    as(users.v2);
    const ids = { dayId, customerId };
    expect(await presaleQ.getOwnDay(users.v2.id, dayId)).toBeNull();
    expect(await vendeur.cancelOrder({}, fd(ids))).toMatchObject({ error: "Journée introuvable." });
    expect(await redirected(vendeur.saveOrderDraft({}, fd({ ...ids, lines: lines([{ variantId: cat.choco, quantity: 1 }]) })))).toMatchObject({ error: "Journée introuvable." });
    expect(await vendeur.closeDay({}, fd({ dayId }))).toMatchObject({ error: "Journée introuvable." });
    expect(await vendeur.addCustomerToDay({}, fd(ids))).toMatchObject({ error: "Journée introuvable." });
  });

  it("B''. avant clôture : la commande n'est ni affectable ni visible du livreur, ni validable par l'admin", async () => {
    const order = await prisma.order.findFirstOrThrow({ where: { workDayId: dayId } });
    as(users.admin);
    expect(await admin.orders.assignDriver({}, fd({ id: order.id, driverId: users.a.id }))).toMatchObject({ error: expect.stringContaining("Brouillon") });
    // Règle documentée (LIVREUR.md) : c'est la CLÔTURE qui transmet les commandes d'une journée.
    expect(await admin.orders.changeOrderStatus({}, fd({ id: order.id, status: "en_attente" }))).toMatchObject({ error: expect.any(String) });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("brouillon");
    expect((await lot(cat.lotChocoSoon)).availableQuantity).toBe(4);
  });

  // ------------------------------------------------------------------------------------------
  // Étape C — clôture
  // ------------------------------------------------------------------------------------------
  it("C. clôture : refusée si visite en cours ou stock insuffisant (rien n'est modifié), puis réserve en FEFO une seule fois", async () => {
    as(users.v1);
    const ids2 = { dayId, customerId: customer2Id };
    // Kiosque : visite ouverte + brouillon de 20 chocolats (stock total 14).
    await redirected(vendeur.startVisit(fd(ids2)));
    expect(await vendeur.closeDay({}, fd({ dayId }))).toMatchObject({ error: expect.stringContaining("visite") });
    await redirected(vendeur.saveOrderDraft({}, fd({ ...ids2, lines: lines([{ variantId: cat.choco, quantity: 20 }]) })));
    await redirected(vendeur.confirmOrder({}, fd(ids2)));
    const before = await Promise.all([lot(cat.lotChocoSoon), lot(cat.lotChocoLate), lot(cat.lotVanille)]);
    const r = await vendeur.closeDay({}, fd({ dayId }));
    expect(r).toMatchObject({ error: expect.stringContaining("stock insuffisant") });
    // Atomicité : rien n'a bougé (ni stock, ni statut, ni journée).
    expect((await Promise.all([lot(cat.lotChocoSoon), lot(cat.lotChocoLate), lot(cat.lotVanille)])).map((l) => l.availableQuantity)).toEqual(before.map((l) => l.availableQuantity));
    expect(await prisma.order.count({ where: { workDayId: dayId, status: { not: "brouillon" } } })).toBe(0);
    expect((await prisma.workDay.findUniqueOrThrow({ where: { id: dayId } })).status).toBe("ouverte");
    expect(await prisma.orderItemAllocation.count()).toBe(0);

    // Correction : on annule la commande du kiosque, visite terminée sans commande.
    expect(await vendeur.cancelOrder({}, fd(ids2))).toMatchObject({ ok: expect.any(String) });
    expect(await vendeur.finishWithoutOrder({}, fd({ ...ids2, reason: "pas_de_besoin" }))).toMatchObject({ ok: expect.any(String) });

    expect(await vendeur.closeDay({}, fd({ dayId }))).toMatchObject({ ok: expect.stringContaining("clôturée") });
    const order = await prisma.order.findFirstOrThrow({ where: { workDayId: dayId, customerId }, include: { items: { include: { allocations: true } } } });
    expect(order.status).toBe("en_attente");
    // FEFO : 3 chocolats pris dans le lot qui expire le plus tôt.
    expect((await lot(cat.lotChocoSoon)).availableQuantity).toBe(1);
    expect((await lot(cat.lotChocoLate)).availableQuantity).toBe(10);
    expect((await lot(cat.lotVanille)).availableQuantity).toBe(16);
    expect(order.items.flatMap((i) => i.allocations).length).toBe(2);

    // Deuxième clôture, modification ou création après clôture : refusées.
    expect(await vendeur.closeDay({}, fd({ dayId }))).toMatchObject({ error: expect.stringContaining("clôturée") });
    expect(await redirected(vendeur.saveOrderDraft({}, fd({ dayId, customerId, lines: lines([{ variantId: cat.choco, quantity: 1 }]) })))).toMatchObject({ error: expect.stringContaining("clôturée") });
    expect(await vendeur.cancelOrder({}, fd({ dayId, customerId }))).toMatchObject({ error: expect.stringContaining("clôturée") });
    expect((await lot(cat.lotChocoSoon)).availableQuantity).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: "en_attente" } })).toBe(1);
  });

  // ------------------------------------------------------------------------------------------
  // Étapes D / E — affectation, livraison, statistiques
  // ------------------------------------------------------------------------------------------
  it("D-E. affectation, isolation des livreurs, échec puis livraison, CA cohérent entre les rôles", async () => {
    const order = await prisma.order.findFirstOrThrow({ where: { workDayId: dayId, customerId } });
    as(users.admin);
    expect(await admin.orders.assignDriver({}, fd({ id: order.id, driverId: users.v1.id }))).toMatchObject({ error: expect.stringContaining("livreur") });
    expect(await admin.orders.assignDriver({}, fd({ id: order.id, driverId: users.a.id }))).toMatchObject({ ok: "Livreur affecté." });
    expect(await admin.orders.assignDriver({}, fd({ id: order.id, driverId: users.a.id }))).toMatchObject({ error: expect.stringContaining("déjà") });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("assignee");

    // Le livreur A voit la commande avec tout ce qu'il faut pour livrer.
    const row = (await livreurQ.listToDeliver(users.a.id, "", 1)).rows.find((r) => r.id === order.id)!;
    expect(row).toMatchObject({ customerName: "Supérette WF", phone: "0555 11 22 33", address: "1 rue du Test", vendeurName: "Vendeur Un", total: "350.00", lines: 2, quantity: 7 });
    // Le livreur B ne voit rien et ne peut rien faire.
    expect((await livreurQ.listToDeliver(users.b.id, "", 1)).rows.map((r) => r.id)).not.toContain(order.id);
    expect(await livreurQ.getOrderForDriver(users.b.id, order.id)).toBeNull();
    as(users.b);
    expect(await livreur.startDelivery({}, fd({ orderId: order.id }))).toMatchObject({ error: expect.stringContaining("non affectée") });

    const stockBefore = (await lot(cat.lotChocoSoon)).availableQuantity;
    const marginBefore = await adminDash.getMarginSummary(today());
    as(users.a);
    expect(await livreur.startDelivery({}, fd({ orderId: order.id }))).toMatchObject({ ok: expect.any(String) });
    expect(await livreur.failDelivery({}, fd({ orderId: order.id, reason: "client_absent" }))).toMatchObject({ ok: expect.any(String) });
    expect(Number((await livreurQ.getDriverDashboard(users.a.id, today())).revenueInPeriod)).toBe(0);
    expect(await livreur.startDelivery({}, fd({ orderId: order.id }))).toMatchObject({ ok: expect.any(String) });
    expect(await livreur.confirmDelivery({}, fd({ orderId: order.id }))).toEqual({ ok: "Livraison confirmée." });
    expect(await livreur.confirmDelivery({}, fd({ orderId: order.id }))).toEqual({ ok: "Cette livraison était déjà confirmée." });

    const done = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { deliveryAttempts: true } });
    expect(done.status).toBe("livree");
    expect(done.deliveryAttempts.map((a) => [a.result, a.driverId === users.a.id, a.endedAt !== null]).sort()).toEqual([["echec", true, true], ["livree", true, true]]);
    expect((await lot(cat.lotChocoSoon)).availableQuantity).toBe(stockBefore); // la livraison ne touche pas au stock

    // Statistiques : livreur, admin (CA par pré-vendeur), pré-vendeur — même montant, compté une fois.
    const d = await livreurQ.getDriverDashboard(users.a.id, today());
    expect(d).toMatchObject({ deliveredInPeriod: 1, deliveredToday: 1, failedInPeriod: 1, toDeliver: 0, inProgress: 0 });
    expect(Number(d.revenueInPeriod)).toBe(350);
    const vendors = await adminDash.getVendorRevenue(today());
    expect(vendors.find((v) => v.id === users.v1.id)).toMatchObject({ deliveredOrders: 1, revenue: 350 });
    expect(vendors.find((v) => v.id === users.v2.id)).toMatchObject({ deliveredOrders: 0, revenue: 0 });
    expect(Number((await presaleQ.getDayCounters(dayId)).revenue)).toBe(350);
    // Marge brute : coût réel du lot alloué (3 × 55) ; la vanille (sans prix d'achat) est signalée, pas inventée.
    // (Écarts mesurés avant / après : la base jetable peut contenir d'autres livraisons du jour.)
    const m = await adminDash.getMarginSummary(today());
    if (!m.available || !marginBefore.available) throw new Error("marge indisponible");
    expect({
      costedLines: m.costedLines - marginBefore.costedLines,
      uncostedLines: m.uncostedLines - marginBefore.uncostedLines,
      costedRevenue: m.costedRevenue - marginBefore.costedRevenue,
      cost: m.cost - marginBefore.cost,
      uncostedRevenue: m.uncostedRevenue - marginBefore.uncostedRevenue,
    }).toEqual({ costedLines: 1, uncostedLines: 1, costedRevenue: 300, cost: 165, uncostedRevenue: 50 });

    // Un changement de prix catalogue ne modifie pas l'historique.
    as(users.admin);
    await admin.products.updateProduct({}, fd({ id: cat.product, name: "Biscuit WF", saleUnit: "carton", salePrice: "999" }));
    expect(Number((await livreurQ.getDriverDashboard(users.a.id, today())).revenueInPeriod)).toBe(350);
    expect((await adminDash.getVendorRevenue(today())).find((v) => v.id === users.v1.id)?.revenue).toBe(350);

    // Livrée : définitive (ni annulation, ni réaffectation).
    expect(await admin.orders.changeOrderStatus({}, fd({ id: order.id, status: "annulee" }))).toMatchObject({ error: expect.stringContaining("non autorisé") });
    expect(await admin.orders.assignDriver({}, fd({ id: order.id, driverId: users.b.id }))).toMatchObject({ error: expect.any(String) });
  });

  // ------------------------------------------------------------------------------------------
  // Scénarios alternatifs côté admin
  // ------------------------------------------------------------------------------------------
  async function closedOrder(qty = 2) {
    // Commande « hors journée » (créée hors module pré-vendeur) validée par l'admin : réservation FEFO.
    const o = await prisma.order.create({
      data: {
        customerId, createdById: users.v2.id, status: "brouillon",
        items: { create: [{ variantId: cat.vanille, productNameSnapshot: "Biscuit WF", flavorNameSnapshot: "Vanille", saleUnitSnapshot: "carton", quantity: qty, unitPrice: "12.50" }] },
      },
    });
    as(users.admin);
    expect(await admin.orders.changeOrderStatus({}, fd({ id: o.id, status: "en_attente" }))).toMatchObject({ ok: expect.any(String) });
    return o;
  }

  it("annulation admin d'une commande transmise : stock restitué une seule fois", async () => {
    const before = (await lot(cat.lotVanille)).availableQuantity;
    const o = await closedOrder(3);
    expect((await lot(cat.lotVanille)).availableQuantity).toBe(before - 3);
    expect(await admin.orders.changeOrderStatus({}, fd({ id: o.id, status: "annulee" }))).toMatchObject({ ok: expect.any(String) });
    expect(await admin.orders.changeOrderStatus({}, fd({ id: o.id, status: "annulee" }))).toMatchObject({ error: expect.any(String) });
    expect((await lot(cat.lotVanille)).availableQuantity).toBe(before);
  });

  it("annulation admin PENDANT la livraison : la tentative ouverte est refermée (pas de tentative orpheline)", async () => {
    const o = await closedOrder();
    await admin.orders.assignDriver({}, fd({ id: o.id, driverId: users.b.id }));
    as(users.b);
    await livreur.startDelivery({}, fd({ orderId: o.id }));
    as(users.admin);
    expect(await admin.orders.changeOrderStatus({}, fd({ id: o.id, status: "annulee" }))).toMatchObject({ ok: expect.any(String) });
    const open = await prisma.deliveryAttempt.count({ where: { orderId: o.id, result: "en_cours" } });
    expect(open).toBe(0);
    as(users.b);
    expect(await livreur.confirmDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("annulée") });
  });

  it("« livrée » posée par l'admin pendant la livraison : pas de tentative restée « en cours »", async () => {
    const o = await closedOrder();
    await admin.orders.assignDriver({}, fd({ id: o.id, driverId: users.b.id }));
    as(users.b);
    await livreur.startDelivery({}, fd({ orderId: o.id }));
    as(users.admin);
    expect(await admin.orders.changeOrderStatus({}, fd({ id: o.id, status: "livree" }))).toMatchObject({ ok: expect.any(String) });
    expect(await prisma.deliveryAttempt.count({ where: { orderId: o.id, result: "en_cours" } })).toBe(0);
    // Le livreur ne peut plus rien faire sur cette commande.
    as(users.b);
    expect(await livreur.confirmDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("déjà livrée") });
  });

  it("le livreur ne peut pas livrer une commande non éligible (en attente, non affectée)", async () => {
    const o = await closedOrder();
    as(users.a);
    expect(await livreur.startDelivery({}, fd({ orderId: o.id }))).toMatchObject({ error: expect.stringContaining("non affectée") });
    expect(await livreur.startDelivery({}, fd({ orderId: "pas-un-uuid" }))).toMatchObject({ error: "Commande invalide." });
    expect(await livreur.startDelivery({}, fd({ orderId: randomUUID() }))).toMatchObject({ error: expect.stringContaining("introuvable") });
  });

  it("journée sans commande : clôture possible, aucune commande créée, compteurs à zéro", async () => {
    as(users.v2);
    expect(await vendeur.startDay()).toMatchObject({ ok: expect.any(String) });
    const day = await prisma.workDay.findFirstOrThrow({ where: { vendeurId: users.v2.id } });
    expect(await vendeur.closeDay({}, fd({ dayId: day.id }))).toMatchObject({ ok: expect.any(String) });
    expect(await presaleQ.getDayCounters(day.id)).toMatchObject({ confirmedOrders: 0, revenue: "0" });
    expect(await prisma.order.count({ where: { workDayId: day.id } })).toBe(0);
  });
});
