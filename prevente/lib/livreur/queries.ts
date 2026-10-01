import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { algiersToday, dayEndExclusive, dayStart, type Period } from "@/lib/period";
import { orderTotalString } from "@/lib/presale/money";
import {
  orderNumberFromQuery, type AttemptResultKey, type DaySection, type FailureReasonKey, type HistoryStatus,
  type OrderStatusKey,
} from "@/lib/livreur/rules";

export const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------------------------
// Filtres Prisma (point unique : toute lecture du livreur passe par ici)
// ---------------------------------------------------------------------------------------------

/** Affectation COURANTE à ce livreur : la seule façon de voir une commande « à livrer ». */
const assignedTo = (driverId: string): Prisma.OrderWhereInput => ({
  assignments: { some: { driverId, unassignedAt: null } },
});

/**
 * Éligibles : affectées à ce livreur, au statut « assignee » ou « en_livraison », et — si issues d'une
 * journée de pré-vendeur — journée CLÔTURÉE (miroir de isOrderEligible dans lib/livreur/rules.ts).
 */
export function eligibleWhere(driverId: string, statuses: ("assignee" | "en_livraison")[] = ["assignee", "en_livraison"]): Prisma.OrderWhereInput {
  return {
    AND: [
      assignedTo(driverId),
      { status: { in: statuses } },
      { OR: [{ workDayId: null }, { workDay: { status: "cloturee" } }] },
    ],
  };
}

/** Recherche serveur : n° de commande, client, téléphone, adresse, pré-vendeur. */
export function searchWhere(q: string): Prisma.OrderWhereInput {
  if (!q) return {};
  const n = orderNumberFromQuery(q);
  return {
    OR: [
      { customer: { businessName: { contains: q, mode: "insensitive" } } },
      { customer: { phone: { contains: q } } },
      { customer: { address: { contains: q, mode: "insensitive" } } },
      { createdBy: { fullName: { contains: q, mode: "insensitive" } } },
      ...(n !== null ? [{ number: n }] : []),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Lignes de liste
// ---------------------------------------------------------------------------------------------

export type OrderRow = {
  id: string;
  number: number;
  customerName: string;
  phone: string | null;
  address: string;
  vendeurName: string;
  createdAt: Date;
  /** Total historique exact (Σ prix de la ligne au moment de la commande × quantité). */
  total: string;
  lines: number;
  quantity: number;
  status: OrderStatusKey;
  last: { result: AttemptResultKey; startedAt: Date; endedAt: Date | null; failureReason: FailureReasonKey | null } | null;
};

const orderRowSelect = (driverId: string) =>
  ({
    id: true, number: true, status: true, createdAt: true,
    customer: { select: { businessName: true, phone: true, address: true } },
    createdBy: { select: { fullName: true } },
    items: { select: { unitPrice: true, quantity: true } },
    deliveryAttempts: {
      where: { driverId },
      orderBy: { startedAt: "desc" },
      take: 1,
      select: { result: true, startedAt: true, endedAt: true, failureReason: true },
    },
  }) satisfies Prisma.OrderSelect;

type RawOrderRow = Prisma.OrderGetPayload<{ select: ReturnType<typeof orderRowSelect> }>;

function toRow(o: RawOrderRow): OrderRow {
  return {
    id: o.id,
    number: o.number,
    customerName: o.customer.businessName,
    phone: o.customer.phone,
    address: o.customer.address,
    vendeurName: o.createdBy.fullName,
    createdAt: o.createdAt,
    total: orderTotalString(o.items.map((i) => ({ unitPrice: i.unitPrice.toString(), quantity: i.quantity }))),
    lines: o.items.length,
    quantity: o.items.reduce((s, i) => s + i.quantity, 0),
    status: o.status,
    last: o.deliveryAttempts[0] ?? null,
  };
}

async function pagedOrders(
  driverId: string, where: Prisma.OrderWhereInput, orderBy: Prisma.OrderOrderByWithRelationInput[], rawPage: number,
) {
  const total = await prisma.order.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(rawPage, pages);
  const rows = await prisma.order.findMany({
    where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: orderRowSelect(driverId),
  });
  return { total, pages, page, rows: rows.map(toRow) };
}

/** « Commandes à livrer » : éligibles, au statut « assignee » (les plus anciennes d'abord). */
export function listToDeliver(driverId: string, q: string, page: number) {
  return pagedOrders(
    driverId,
    { AND: [eligibleWhere(driverId, ["assignee"]), searchWhere(q)] },
    [{ createdAt: "asc" }, { number: "asc" }],
    page,
  );
}

/** Où les commandes se rangent aujourd'hui : chaque commande n'apparaît que dans UNE section. */
export function daySectionWhere(driverId: string, section: DaySection, now = new Date()): Prisma.OrderWhereInput {
  const today = { gte: dayStart(algiersToday(now)), lt: dayEndExclusive(algiersToday(now)) };
  const failedToday: Prisma.OrderWhereInput = { deliveryAttempts: { some: { driverId, result: "echec", endedAt: today } } };
  const where: Record<Exclude<DaySection, "tous">, Prisma.OrderWhereInput> = {
    a_livrer: { AND: [eligibleWhere(driverId, ["assignee"]), { NOT: failedToday }] },
    en_cours: eligibleWhere(driverId, ["en_livraison"]),
    livrees: { status: "livree", deliveryAttempts: { some: { driverId, result: "livree", endedAt: today } } },
    echecs: { AND: [{ status: { notIn: ["livree", "en_livraison"] } }, failedToday] },
  };
  return section === "tous" ? { OR: Object.values(where) } : where[section];
}

export function listDay(driverId: string, section: DaySection, q: string, page: number) {
  return pagedOrders(
    driverId,
    { AND: [daySectionWhere(driverId, section), searchWhere(q)] },
    [{ updatedAt: "desc" }, { number: "desc" }],
    page,
  );
}

// ---------------------------------------------------------------------------------------------
// Historique : une ligne PAR TENTATIVE (les anciennes ne sont jamais écrasées)
// ---------------------------------------------------------------------------------------------

export type HistoryRow = {
  id: string;
  orderId: string;
  number: number;
  customerName: string;
  total: string;
  result: AttemptResultKey;
  failureReason: FailureReasonKey | null;
  comment: string | null;
  startedAt: Date;
  endedAt: Date;
};

export async function listHistory(
  driverId: string,
  f: { q: string; page: number; status: HistoryStatus; from: string; to: string },
) {
  const where: Prisma.DeliveryAttemptWhereInput = {
    driverId,
    result: f.status ? f.status : { in: ["livree", "echec"] },
    ...(f.from || f.to
      ? { endedAt: { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lt: dayEndExclusive(f.to) } : {}) } }
      : {}),
    ...(f.q ? { order: searchWhere(f.q) } : {}),
  };
  const total = await prisma.deliveryAttempt.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const attempts = await prisma.deliveryAttempt.findMany({
    where,
    orderBy: [{ endedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true, result: true, failureReason: true, comment: true, startedAt: true, endedAt: true,
      order: { select: { id: true, number: true, customer: { select: { businessName: true } }, items: { select: { unitPrice: true, quantity: true } } } },
    },
  });
  const rows: HistoryRow[] = attempts.map((a) => ({
    id: a.id,
    orderId: a.order.id,
    number: a.order.number,
    customerName: a.order.customer.businessName,
    total: orderTotalString(a.order.items.map((i) => ({ unitPrice: i.unitPrice.toString(), quantity: i.quantity }))),
    result: a.result,
    failureReason: a.failureReason,
    comment: a.comment,
    startedAt: a.startedAt,
    endedAt: a.endedAt ?? a.startedAt,
  }));
  return { total, pages, page, rows };
}

// ---------------------------------------------------------------------------------------------
// Détail d'une commande
// ---------------------------------------------------------------------------------------------

/**
 * Une commande n'est consultable que si elle est AFFECTÉE à ce livreur (affectation courante) ou si
 * ce livreur a déjà une tentative dessus (son propre historique). Sinon : null (« introuvable »).
 */
export function getOrderForDriver(driverId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, OR: [assignedTo(driverId), { deliveryAttempts: { some: { driverId } } }] },
    select: {
      id: true, number: true, status: true, notes: true, createdAt: true, confirmedAt: true,
      workDay: { select: { status: true } },
      customer: { select: { businessName: true, phone: true, address: true, googleMapsUrl: true, notes: true } },
      createdBy: { select: { fullName: true } },
      items: {
        orderBy: [{ productNameSnapshot: "asc" }, { flavorNameSnapshot: "asc" }],
        select: { id: true, productNameSnapshot: true, flavorNameSnapshot: true, saleUnitSnapshot: true, quantity: true, unitPrice: true },
      },
      assignments: { where: { unassignedAt: null }, select: { driverId: true } },
      deliveryAttempts: {
        where: { driverId },
        orderBy: { startedAt: "desc" },
        select: { id: true, result: true, failureReason: true, comment: true, startedAt: true, endedAt: true },
      },
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------

export type DriverDashboard = {
  /** Aujourd'hui, quelle que soit la période choisie. */
  toDeliver: number;
  inProgress: number;
  deliveredToday: number;
  /** Période choisie. */
  deliveredInPeriod: number;
  failedInPeriod: number;
  revenueInPeriod: string;
  /** Une commande en cours de livraison (pour l'accès direct à la tournée), si elle existe. */
  activeOrderId: string | null;
};

/**
 * Chiffre d'affaires livré (calculé en SQL NUMERIC exact, sur données persistées uniquement) :
 *  - périmètre : tentatives `livree` de CE livreur dont ended_at est dans la période ;
 *  - la commande doit être au statut « livree » (jamais annulée, jamais en cours) ;
 *  - montant = Σ quantité × prix unitaire des LIGNES de la commande (prix historiques, jamais le catalogue) ;
 *  - une seule tentative `livree` par commande (index unique partiel) : aucune commande comptée deux fois.
 * Les commandes affectées, en cours, échouées ou livrées hors période n'y figurent pas.
 */
export async function getDriverDashboard(driverId: string, period: Period, now = new Date()): Promise<DriverDashboard> {
  const todayStart = dayStart(algiersToday(now));
  const todayEnd = dayEndExclusive(algiersToday(now));

  const [toDeliver, inProgress, active, agg] = await Promise.all([
    prisma.order.count({ where: eligibleWhere(driverId, ["assignee"]) }),
    prisma.order.count({ where: eligibleWhere(driverId, ["en_livraison"]) }),
    prisma.order.findFirst({
      where: { AND: [eligibleWhere(driverId, ["en_livraison"]), { deliveryAttempts: { some: { driverId, result: "en_cours" } } }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }),
    prisma.$queryRaw<{ delivered_period: number; delivered_today: number; failed_period: number; revenue: string }[]>`
      SELECT
        (SELECT count(*)::int FROM public.delivery_attempts a JOIN public.orders o ON o.id = a.order_id AND o.status = 'livree'
          WHERE a.driver_id = ${driverId}::uuid AND a.result = 'livree'
            AND a.ended_at >= ${period.start} AND a.ended_at < ${period.end}) AS delivered_period,
        (SELECT count(*)::int FROM public.delivery_attempts a JOIN public.orders o ON o.id = a.order_id AND o.status = 'livree'
          WHERE a.driver_id = ${driverId}::uuid AND a.result = 'livree'
            AND a.ended_at >= ${todayStart} AND a.ended_at < ${todayEnd}) AS delivered_today,
        (SELECT count(*)::int FROM public.delivery_attempts a
          WHERE a.driver_id = ${driverId}::uuid AND a.result = 'echec'
            AND a.ended_at >= ${period.start} AND a.ended_at < ${period.end}) AS failed_period,
        (SELECT COALESCE(SUM(i.quantity * i.unit_price), 0)::text
          FROM public.delivery_attempts a
          JOIN public.orders o ON o.id = a.order_id AND o.status = 'livree'
          JOIN public.order_items i ON i.order_id = o.id
          WHERE a.driver_id = ${driverId}::uuid AND a.result = 'livree'
            AND a.ended_at >= ${period.start} AND a.ended_at < ${period.end}) AS revenue
    `,
  ]);
  const r = agg[0];
  return {
    toDeliver,
    inProgress,
    deliveredToday: r.delivered_today,
    deliveredInPeriod: r.delivered_period,
    failedInPeriod: r.failed_period,
    revenueInPeriod: r.revenue,
    activeOrderId: active?.id ?? null,
  };
}
