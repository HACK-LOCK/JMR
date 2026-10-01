import {
  balanceAmount,
  isClosedStatus,
  payableAmount,
  round2,
  type OrderPart,
  type OrderStatus,
  type OrderWithParts,
  type Payment,
  type RepairOrder,
} from '../../../shared/domain';
import { isToday, shopDateString } from '../core/datetime';
import { NotFoundError, ValidationError } from '../core/errors';
import { nowIso } from '../core/id';
import { mutate, read, type MutationResult } from '../data/mutate';
import {
  addPayment,
  addStatusHistory,
  cancelOrder,
  deliverOrder,
  findOrder,
  nextOrderId,
  orderPartsTotal,
  recalcOrder,
  removePayment,
  updatePayment as correctPayment,
} from '../domain/orderOps';
import {
  consumeOrderPart,
  removeOrderPart,
  reserveOrderPart,
  returnOrderPart,
} from '../domain/stockOps';
import { findOrCreateCustomer } from './customers';
import { ensureBill } from './bills';
import { syncAllToSupabase, syncOrderToSupabase } from './supabaseSync';
import type { z } from 'zod';
import type { orderCreateSchema, orderUpdateSchema } from '../validation/schemas';

type OrderCreateInput = z.infer<typeof orderCreateSchema>;
type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;

/** How many of each to offer. Enough to fill a phone screen, no more. */
const HINT_LIMIT = 12;

/** Brands and models the shop has used, most used first. */
export interface DeviceHints {
  brands: string[];
  /** Each model keeps its brand, so the caller can narrow without asking again. */
  models: { label: string; brand: string }[];
}

export type OrderScope =
  | 'all'
  | 'today'
  | 'active'
  | 'repairing'
  | 'ready'
  | 'pendingPickup'
  | 'unpaid'
  | 'delivered'
  | 'cancelled';

export interface OrderListItem extends RepairOrder {
  balance: number;
  payable: number;
  partCount: number;
  partsPending: number;
}

function decorate(order: RepairOrder, parts: OrderPart[]): OrderListItem {
  return {
    ...order,
    balance: balanceAmount(order),
    payable: payableAmount(order),
    partCount: parts.length,
    partsPending: parts.filter((line) => !line.consumed).length,
  };
}

function matchesScope(order: RepairOrder, scope: OrderScope): boolean {
  switch (scope) {
    case 'today':
      return isToday(order.receivedAt);
    case 'active':
      return !isClosedStatus(order.status);
    case 'repairing':
      return ['Checking', 'Approved', 'Repairing', 'Waiting for Part'].includes(order.status);
    case 'ready':
      return order.status === 'Ready';
    case 'pendingPickup':
      return order.status === 'Ready';
    case 'unpaid':
      return order.status !== 'Cancelled' && order.paymentStatus !== 'Paid' && order.finalAmount > 0;
    case 'delivered':
      return order.status === 'Delivered';
    case 'cancelled':
      return order.status === 'Cancelled' || order.status === 'Unable to Repair';
    default:
      return true;
  }
}

function searchOrder(order: RepairOrder, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D+/g, '');
  return (
    order.id.toLowerCase().includes(needle) ||
    order.customerName.toLowerCase().includes(needle) ||
    order.brand.toLowerCase().includes(needle) ||
    order.model.toLowerCase().includes(needle) ||
    order.complaint.toLowerCase().includes(needle) ||
    order.technician.toLowerCase().includes(needle) ||
    (digits.length >= 3 && order.mobile.includes(digits))
  );
}

export function listOrders(input: {
  scope?: OrderScope;
  q?: string;
  status?: OrderStatus;
  limit?: number;
} = {}): OrderListItem[] {
  const db = read();
  const partsByOrder = new Map<string, OrderPart[]>();
  for (const line of db.orderParts) {
    const list = partsByOrder.get(line.orderId) ?? [];
    list.push(line);
    partsByOrder.set(line.orderId, list);
  }

  const scope = input.scope ?? 'all';
  const q = input.q ?? '';
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  return db.orders
    .filter((order) => (input.status ? order.status === input.status : matchesScope(order, scope)))
    .filter((order) => searchOrder(order, q))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map((order) => decorate(order, partsByOrder.get(order.id) ?? []));
}

/* ------------------------------------------------------------------ */
/* Date report                                                         */
/* ------------------------------------------------------------------ */

export interface ReportBucket {
  count: number;
  amount: number;
}

export interface OrderDateReport {
  from: string;
  to: string;
  /** Bills created inside the range. */
  received: ReportBucket;
  /** Devices handed over inside the range. */
  delivered: ReportBucket;
  /** Bills from the range that are still open, with money still owed. */
  pending: ReportBucket;
  /** Money actually taken inside the range. */
  collected: number;
}

/**
 * From Date / To Date totals for the billing side. Every figure is clickable in
 * the app by reusing the same status filters the list already understands.
 */
export function orderDateReport(input: { from?: string; to?: string } = {}): OrderDateReport {
  const db = read();
  const today = shopDateString();
  let from = (input.from ?? '').trim() || shopDateString(new Date(Date.now() - 29 * 86_400_000));
  let to = (input.to ?? '').trim() || today;
  if (from > to) [from, to] = [to, from];

  const inRange = (value: string | undefined): boolean => {
    if (!value) return false;
    const day = shopDateString(new Date(value));
    return day >= from && day <= to;
  };

  const received: ReportBucket = { count: 0, amount: 0 };
  const delivered: ReportBucket = { count: 0, amount: 0 };
  const pending: ReportBucket = { count: 0, amount: 0 };

  for (const order of db.orders) {
    const cancelled = order.status === 'Cancelled';
    if (!cancelled && inRange(order.receivedAt)) {
      received.count += 1;
      received.amount = round2(received.amount + payableAmount(order));
      if (!isClosedStatus(order.status)) {
        pending.count += 1;
        pending.amount = round2(pending.amount + balanceAmount(order));
      }
    }
    if (order.status === 'Delivered' && inRange(order.deliveredAt)) {
      delivered.count += 1;
      delivered.amount = round2(delivered.amount + payableAmount(order));
    }
  }

  let collected = 0;
  for (const payment of db.payments) {
    if (!inRange(payment.date)) continue;
    const order = db.orders.find((item) => item.id === payment.orderId);
    if (order?.status === 'Cancelled') continue;
    collected = round2(collected + payment.amount);
  }

  return { from, to, received, delivered, pending, collected };
}

export function getOrderDetail(orderId: string): OrderWithParts {
  const db = read();
  const order = findOrder(db, orderId);
  const parts = db.orderParts.filter((line) => line.orderId === orderId);
  const payments = db.payments
    .filter((payment) => payment.orderId === orderId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const history = db.statusHistory
    .filter((entry) => entry.orderId === orderId)
    .sort((a, b) => a.at.localeCompare(b.at));
  const customer = db.customers.find((item) => item.id === order.customerId);

  return {
    ...decorate(order, parts),
    parts,
    payments,
    history,
    customer,
  };
}

export function nextOrderIdPreview(): string {
  const db = read();
  // The counter is a plain number, so a copy of meta is enough to run the real
  // rule against without touching the live snapshot.
  const draft = { ...db, meta: { ...db.meta } };
  return nextOrderId(draft);
}

/* ------------------------------------------------------------------ */
/* Suggestions                                                         */
/* ------------------------------------------------------------------ */

/**
 * Brands and models this shop has actually repaired, most used first.
 *
 * The new bill screen offers these so a bill says "Galaxy M30" the way the
 * shop wrote it before, rather than however it was spelled this time. The words
 * come from the shop's own bills and its own stock, which is the only list that
 * is right for this counter - a generic list of every brand made would offer
 * names nobody here has ever repaired.
 *
 * Ordered by how often each one turns up, so the thing this shop fixes most
 * often is the first thing offered. Passing a brand narrows the models to that
 * brand, which is what stops "M30" from matching a laptop.
 */
export function deviceHints(input: { q?: string } = {}): DeviceHints {
  const db = read();
  const q = (input.q ?? '').trim().toLowerCase();

  const brandTally = new Map<string, { label: string; count: number }>();
  const modelTally = new Map<string, { label: string; count: number; brand: string }>();

  const addBrand = (value: string, weight: number): void => {
    const label = value.trim();
    if (!label) return;
    const key = label.toLowerCase();
    const existing = brandTally.get(key);
    // One bill, one brand - so a single order is counted once no matter how
    // many of its lines repeat it.
    brandTally.set(key, { label: existing?.label ?? label, count: (existing?.count ?? 0) + weight });
  };

  const addModel = (value: string, modelBrand: string, weight: number): void => {
    const label = value.trim();
    if (!label) return;
    const key = `${modelBrand.trim().toLowerCase()}|${label.toLowerCase()}`;
    const existing = modelTally.get(key);
    modelTally.set(key, {
      label: existing?.label ?? label,
      count: (existing?.count ?? 0) + weight,
      brand: existing?.brand ?? modelBrand.trim(),
    });
  };

  for (const order of db.orders) {
    addBrand(order.brand, 1);
    addModel(order.model, order.brand, 1);
  }
  // Stock knows about models that have not come through the repair counter yet,
  // and a part is a real thing the shop holds, so its wording counts too.
  for (const part of db.parts) {
    addBrand(part.brand, 1);
    addModel(part.model, part.brand, 1);
  }

  const ranked = (tally: Map<string, { label: string; count: number }>): string[] =>
    [...tally.values()]
      .filter((item) => (q ? item.label.toLowerCase().includes(q) : true))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, HINT_LIMIT)
      .map((item) => item.label);

  const models = [...modelTally.values()]
    .filter((item) => (q ? item.label.toLowerCase().includes(q) : true))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, HINT_LIMIT)
    .map((item) => ({ label: item.label, brand: item.brand }));

  return { brands: ranked(brandTally), models };
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export async function createOrder(
  input: OrderCreateInput,
  user: string,
): Promise<MutationResult<OrderWithParts>> {
  const { customer, created } = await findOrCreateCustomer({
    name: input.customerName,
    mobile: input.mobile,
  });

  const result = await mutate((draft) => {
    if (input.customerId) {
      const linked = draft.customers.find((item) => item.id === input.customerId);
      if (linked) {
        linked.name = input.customerName;
        linked.mobile = input.mobile;
        linked.updatedAt = nowIso();
      }
    }

    const now = nowIso();
    const orderId = nextOrderId(draft);
    const order: RepairOrder = {
      id: orderId,
      customerId: customer.id,
      customerName: input.customerName,
      mobile: input.mobile,
      deviceType: input.deviceType,
      brand: input.brand,
      model: input.model,
      complaint: input.complaint,
      imei: input.imei,
      deviceCondition: input.deviceCondition,
      accessories: input.accessories,
      expectedDelivery: input.expectedDelivery,
      technician: input.technician,
      notes: input.notes,
      photos: [],
      status: 'Received',
      receivedAt: now,
      deliveredAt: '',
      deliveredTo: '',
      estimatedAmount: round2(input.estimatedAmount),
      finalAmount: round2(input.estimatedAmount),
      discount: round2(input.discount),
      paidAmount: 0,
      paymentStatus: 'Unpaid',
      paymentMode: 'Cash',
      billDriveFileId: '',
      billDriveLink: '',
      billPrintedAt: '',
      createdBy: user,
      createdAt: now,
      updatedAt: now,
      pendingSync: false,
    };
    draft.orders.push(order);

    addStatusHistory(draft, { orderId, from: '', to: 'Received', user });

    // Parts are only RESERVED here. Stock is untouched until the employee
    // confirms "Part Used" (or the device is delivered for consumables).
    for (const line of input.parts) {
      const part = draft.parts.find((item) => item.id === line.partId);
      if (!part) throw new NotFoundError('One of the selected parts is not in stock list.');
      reserveOrderPart(draft, {
        orderId,
        partId: line.partId,
        quantity: line.quantity,
        unitPrice: line.unitPrice || part.sellingPrice,
      });
    }

    if (input.advance > 0) {
      addPayment(draft, {
        orderId,
        amount: input.advance,
        mode: input.advanceMode,
        note: 'Advance at receiving',
        user,
        idempotencyKey: `${orderId}-advance`,
      });
    } else {
      recalcOrder(draft, order);
    }

    return order.id;
  });

  const warnings = result.warning
    ? [result.warning]
    : [];
  // Saving to Drive is a side effect here, not the point of the action, so an
  // unconnected folder stays quiet - the Sheet Sync screen says that already.
  const bill = await ensureBill(result.data, { quietWhenNotConnected: true });
  if (!bill.saved && bill.message) {
    warnings.push({ code: 'BILL_PENDING', message: `Order saved. ${bill.message}` });
  }

  try {
    await syncOrderToSupabase(result.data);
  } catch (err) {
    console.warn('[supabase] Sync error for new bill:', err);
  }
  // Auto sync all records to keep Supabase completely synchronized
  void syncAllToSupabase().catch(() => undefined);

  return warnings[0]
    ? { data: getOrderDetail(result.data), warning: warnings[0] }
    : { data: getOrderDetail(result.data) };
}

/* ------------------------------------------------------------------ */
/* Edit / status / parts                                               */
/* ------------------------------------------------------------------ */

export async function updateOrder(
  orderId: string,
  patch: OrderUpdateInput,
): Promise<MutationResult<OrderWithParts>> {
  const result = await mutate((draft) => {
    const order = findOrder(draft, orderId);
    if (patch.customerName !== undefined) order.customerName = patch.customerName;
    if (patch.mobile !== undefined) order.mobile = patch.mobile;
    if (patch.deviceType !== undefined) order.deviceType = patch.deviceType;
    if (patch.brand !== undefined) order.brand = patch.brand;
    if (patch.model !== undefined) order.model = patch.model;
    if (patch.complaint !== undefined) order.complaint = patch.complaint;
    if (patch.imei !== undefined) order.imei = patch.imei;
    if (patch.deviceCondition !== undefined) order.deviceCondition = patch.deviceCondition;
    if (patch.accessories !== undefined) order.accessories = patch.accessories;
    if (patch.expectedDelivery !== undefined) order.expectedDelivery = patch.expectedDelivery;
    if (patch.technician !== undefined) order.technician = patch.technician;
    if (patch.notes !== undefined) order.notes = patch.notes;
    if (patch.estimatedAmount !== undefined) order.estimatedAmount = round2(patch.estimatedAmount);
    if (patch.finalAmount !== undefined) order.finalAmount = round2(patch.finalAmount);
    if (patch.discount !== undefined) order.discount = round2(patch.discount);

    if (patch.finalAmount !== undefined && patch.finalAmount < order.paidAmount) {
      throw new ValidationError(
        `Final amount cannot be less than the ${order.paidAmount} already paid.`,
      );
    }
    if (patch.finalAmount !== undefined) {
      const partsTotal = orderPartsTotal(draft, order.id);
      if (patch.finalAmount < partsTotal) {
        throw new ValidationError(
          `Final amount cannot be less than the ${partsTotal} of parts on this repair. Give a discount instead.`,
          [`Parts total: ${partsTotal}`],
        );
      }
    }
    recalcOrder(draft, order);
    return null;
  });

  const bill = await ensureBill(orderId, { quietWhenNotConnected: true });
  return mergeBill(result, orderId, bill.saved, bill.message);
}

export async function changeStatus(
  orderId: string,
  status: OrderStatus,
  user: string,
): Promise<MutationResult<OrderWithParts>> {
  // Asking for the status the order already has is a no-op, not a failure: the
  // same tap can easily arrive twice on a slow shop connection, and refusing it
  // only ever showed the user an error for something that is already true.
  const current = read().orders.find((item) => item.id === orderId);
  if (!current) throw new NotFoundError('Repair order not found.');
  if (current.status === status) return { data: getOrderDetail(orderId) };

  const result = await mutate((draft) => {
    const order = findOrder(draft, orderId);
    if (order.status === status) return null;
    const from = order.status;

    if (status === 'Cancelled') {
      cancelOrder(draft, { orderId, from, user });
      return null;
    }
    if (status === 'Delivered') {
      deliverOrder(draft, { orderId, deliveredTo: '', user, from });
      return null;
    }

    order.status = status;
    addStatusHistory(draft, { orderId, from, to: status, user });
    recalcOrder(draft, order);
    return null;
  });

  const bill = await ensureBill(orderId, { quietWhenNotConnected: true });
  return mergeBill(result, orderId, bill.saved, bill.message);
}

function mergeBill(
  result: MutationResult<unknown>,
  orderId: string,
  billSaved: boolean,
  message: string,
): { data: OrderWithParts; warning?: { code: string; message: string } } {
  void syncOrderToSupabase(orderId).catch((err) => {
    console.warn('[supabase] Background sync error on order update:', err);
  });
  void syncAllToSupabase().catch(() => undefined);
  const data = getOrderDetail(orderId);
  const warning =
    result.warning ?? (!billSaved && message ? { code: 'BILL_PENDING', message } : undefined);
  return warning ? { data, warning } : { data };
}

export async function addOrderPart(
  orderId: string,
  input: { partId: string; name: string; quantity: number; unitPrice: number },
): Promise<MutationResult<OrderWithParts>> {
  const result = await mutate((draft) => {
    const order = findOrder(draft, orderId);
    const before = orderPartsTotal(draft, orderId);
    reserveOrderPart(draft, { orderId, ...input });
    // A part fitted after the estimate still has to be billed, so the amount
    // due moves with the parts list instead of silently under-charging.
    const delta = round2(orderPartsTotal(draft, orderId) - before);
    if (delta !== 0) order.finalAmount = round2(Math.max(0, order.finalAmount) + delta);
    recalcOrder(draft, order);
    return { id: orderId };
  });
  const bill = await ensureBill(orderId, { quietWhenNotConnected: true });
  return mergeBill(result, orderId, bill.saved, bill.message);
}

export async function deleteOrderPart(
  orderId: string,
  lineId: string,
): Promise<MutationResult<OrderWithParts>> {
  const result = await mutate((draft) => {
    const order = findOrder(draft, orderId);
    const before = orderPartsTotal(draft, orderId);
    removeOrderPart(draft, orderId, lineId);
    const delta = round2(orderPartsTotal(draft, orderId) - before);
    if (delta !== 0) order.finalAmount = round2(Math.max(0, order.finalAmount + delta));
    recalcOrder(draft, order);
    return { id: orderId };
  });
  const bill = await ensureBill(orderId, { quietWhenNotConnected: true });
  return mergeBill(result, orderId, bill.saved, bill.message);
}

/** "Part Used" - stock goes down here and only here. */
export async function useOrderPart(
  orderId: string,
  lineId: string,
  user: string,
): Promise<MutationResult<OrderWithParts>> {
  const result = await mutate((draft) => {
    consumeOrderPart(draft, { orderId, lineId, user });
    return null;
  });
  const bill = await ensureBill(orderId, { quietWhenNotConnected: true });
  return mergeBill(result, orderId, bill.saved, bill.message);
}

/** Consumed part came back unused - stock goes up again. */
export async function returnOrderPartStock(
  orderId: string,
  lineId: string,
  user: string,
): Promise<MutationResult<OrderWithParts>> {
  return mutate((draft) => {
    returnOrderPart(draft, { orderId, lineId, user });
    return { id: orderId };
  }).then((result) => {
    void syncOrderToSupabase(orderId).catch(() => undefined);
    return {
      data: getOrderDetail(orderId),
      ...(result.warning ? { warning: result.warning } : {}),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Payments & delivery                                                 */
/* ------------------------------------------------------------------ */

export async function recordPayment(
  orderId: string,
  input: { amount: number; mode: Payment['mode']; note: string; idempotencyKey: string },
  user: string,
): Promise<MutationResult<OrderWithParts>> {
  const result = await mutate((draft) => {
    addPayment(draft, { orderId, ...input, user });
    return null;
  });
  const bill = await ensureBill(orderId, { quietWhenNotConnected: true });
  return mergeBill(result, orderId, bill.saved, bill.message);
}

/**
 * Corrects a payment already taken. The original row is changed, so the bill
 * reads as though the right amount had been received all along.
 */
export async function updatePayment(
  orderId: string,
  paymentId: string,
  input: { amount: number; mode?: string; note?: string },
): Promise<MutationResult<OrderWithParts>> {
  const result = await mutate((draft) => {
    correctPayment(draft, { orderId, paymentId, ...input });
    return { id: orderId };
  });
  const bill = await ensureBill(orderId, { quietWhenNotConnected: true });
  return mergeBill(result, orderId, bill.saved, bill.message);
}

export async function deletePayment(
  orderId: string,
  paymentId: string,
): Promise<MutationResult<OrderWithParts>> {
  return mutate((draft) => {
    removePayment(draft, { orderId, paymentId });
    return { id: orderId };
  }).then((result) => {
    void syncOrderToSupabase(orderId).catch(() => undefined);
    return {
      data: getOrderDetail(orderId),
      ...(result.warning ? { warning: result.warning } : {}),
    };
  });
}

export async function deliver(
  orderId: string,
  deliveredTo: string,
  user: string,
): Promise<MutationResult<OrderWithParts>> {
  const result = await mutate((draft) => {
    const order = findOrder(draft, orderId);
    deliverOrder(draft, { orderId, deliveredTo, user, from: order.status });
    return null;
  });
  const bill = await ensureBill(orderId, { quietWhenNotConnected: true });
  return mergeBill(result, orderId, bill.saved, bill.message);
}

export async function addOrderPhoto(orderId: string, link: string): Promise<MutationResult<string[]>> {
  return mutate((draft) => {
    const order = findOrder(draft, orderId);
    if (!order.photos.includes(link)) order.photos.push(link);
    order.updatedAt = nowIso();
    return order.photos;
  });
}
