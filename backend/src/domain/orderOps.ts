import {
  derivePaymentStatus,
  round2,
  type OrderStatus,
  type Payment,
  type RepairOrder,
  type StatusHistory,
} from '../../../shared/domain';
import type { Database } from '../data/database';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { formatOrderId, highestOrderSequence, newId, nowIso } from '../core/id';
import { consumeDeliveryConsumables } from './stockOps';

/**
 * Repair order rules. Pure functions over the database draft - no I/O, no
 * Google, no HTTP. This is where the correctness of the shop workflow lives.
 */

/**
 * Next free bill number: JMR-0001, JMR-0002 ... one sequence for the whole shop,
 * it never restarts. Employees never type this.
 */
export function nextOrderId(draft: Database): string {
  // One number for the whole shop, taken as the highest of two things: the
  // counter already saved, and the numbers on bills that actually exist. Taking
  // the maximum of both is what makes a restored backup, a hand typed id, or a
  // counter that was somehow missed still unable to produce a number that is
  // already on a bill.
  const stored = Math.max(0, Number(draft.meta.orderSequence) || 0);
  const used = highestOrderSequence(draft.orders.map((order) => order.id));
  const sequence = Math.max(stored, used) + 1;
  draft.meta.orderSequence = sequence;
  return formatOrderId(sequence);
}

export function findOrder(draft: Database, orderId: string): RepairOrder {
  const order = draft.orders.find((item) => item.id === orderId);
  if (!order) throw new NotFoundError('Repair order not found.');
  return order;
}

/** Parts are money: every line on the job has to end up on the bill. */
export function orderPartsTotal(draft: Database, orderId: string): number {
  return round2(
    draft.orderParts
      .filter((line) => line.orderId === orderId)
      .reduce((sum, line) => sum + round2(line.quantity * line.unitPrice), 0),
  );
}

/** Recalculates paid total, payment status and final amount from the payments. */
export function recalcOrder(draft: Database, order: RepairOrder): RepairOrder {
  const payments = draft.payments.filter((payment) => payment.orderId === order.id);
  // Money that came in stays on the bill after a cancel. The shop is holding it
  // and has to hand it back, so blanking the figure would throw away the one
  // number the counter needs to settle up with the customer. Nothing leaks into
  // a day's takings from here: every report drops a cancelled bill by its
  // status, never by this amount.
  const paid = payments.reduce((sum, payment) => sum + round2(payment.amount), 0);

  if (order.finalAmount <= 0) order.finalAmount = round2(order.estimatedAmount);
  // Safety net: an order can never be billed for less than the parts already
  // fitted to it. Any discount belongs in `discount`, not in a lower total.
  const partsTotal = orderPartsTotal(draft, order.id);
  if (partsTotal > order.finalAmount) order.finalAmount = partsTotal;
  order.discount = round2(order.discount);
  order.paidAmount = round2(paid);
  order.paymentStatus = derivePaymentStatus(order);

  // Keep the "main" payment mode as the most recent one, it is what the
  // customer actually paid with on the bill. A 0 entry is skipped: no money
  // changed hands, so it must not put a mode on a bill that was never paid.
  const latest = payments.filter((payment) => round2(payment.amount) > 0).at(-1);
  if (latest) order.paymentMode = latest.mode;
  order.updatedAt = nowIso();
  return order;
}

export function addStatusHistory(
  draft: Database,
  input: { orderId: string; from: string; to: OrderStatus; user: string },
): StatusHistory {
  const entry: StatusHistory = {
    id: newId('HIS'),
    orderId: input.orderId,
    fromStatus: input.from,
    toStatus: input.to,
    at: nowIso(),
    user: input.user,
  };
  draft.statusHistory.push(entry);
  return entry;
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

/**
 * Records a payment the counter took.
 *
 * An amount of 0 is allowed. The counter needs to be able to say "nothing was
 * taken" and have that written down — a walk-in that turned out to be a free
 * fix, a job quoted but not paid for on delivery, or a free diagnostic check.
 * Because 0 can never be overpaid, a 0 entry is accepted even when the bill has
 * no outstanding balance, and it leaves the paid figure and balance untouched.
 * Only a cancelled bill refuses payments, because its money is a refund to
 * hand back rather than a payment to take.
 */
export function addPayment(
  draft: Database,
  input: {
    orderId: string;
    amount: number;
    mode: Payment['mode'];
    note: string;
    user: string;
    idempotencyKey: string;
  },
): { payment: Payment; order: RepairOrder } {
  const order = findOrder(draft, input.orderId);
  if (order.status === 'Cancelled') {
    throw new ConflictError('This order is cancelled. Payments are not allowed.');
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new ValidationError('Amount cannot be negative.');
  }

  if (input.idempotencyKey) {
    const duplicate = draft.payments.some(
      (payment) => payment.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) throw new ConflictError('This payment was already recorded.');
  }

  recalcOrder(draft, order);
  const payable = Math.max(0, round2(order.finalAmount - order.discount));
  const balance = Math.max(0, round2(payable - order.paidAmount));
  const amount = round2(input.amount);
  if (amount > 0 && balance <= 0) {
    throw new ConflictError('This order is already fully paid.');
  }
  if (amount > balance) {
    throw new ValidationError(`Amount is more than the balance of Rs.${balance}.`, [
      `Balance: ${balance}`,
      `Entered: ${amount}`,
    ]);
  }

  const now = nowIso();
  const payment: Payment = {
    id: newId('PAY'),
    orderId: order.id,
    amount,
    mode: input.mode,
    status: 'Partially Paid',
    note: input.note.trim(),
    date: now,
    user: input.user,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };
  draft.payments.push(payment);
  recalcOrder(draft, order);
  payment.status = order.paymentStatus;
  return { payment, order };
}

/**
 * Corrects a payment the counter has already taken, changing the original row
 * in place. There is deliberately no second row and no reversal: a mistyped
 * amount is fixed, not offset, so the bill's paid figure, balance and payment
 * status are the only record of the correction and the shop never appears to
 * have taken more money than it did.
 *
 * The corrected total may not push the bill over what it can be paid, which
 * keeps "Paid" meaning the same thing it meant before the edit.
 */
export function updatePayment(
  draft: Database,
  input: { orderId: string; paymentId: string; amount: number; mode?: string; note?: string },
): { order: RepairOrder; payment: Payment } {
  const order = findOrder(draft, input.orderId);
  const payment = draft.payments.find(
    (item) => item.id === input.paymentId && item.orderId === input.orderId,
  );
  if (!payment) throw new NotFoundError('Payment not found.');

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new ValidationError('Amount cannot be negative.');
  }

  const others = draft.payments
    .filter((item) => item.orderId === input.orderId && item.id !== input.paymentId)
    .reduce((sum, item) => sum + round2(item.amount), 0);
  const payable = Math.max(0, round2(order.finalAmount - order.discount));
  const newPaid = round2(others + round2(input.amount));
  if (newPaid > payable) {
    throw new ValidationError(
      `That makes the bill over-paid. Rs.${payable} is the most this bill can take.`,
      [`Payments would total: Rs.${newPaid}`, `Bill is payable: Rs.${payable}`],
    );
  }

  const amount = round2(input.amount);
  payment.amount = amount;
  if (input.mode) payment.mode = input.mode as Payment['mode'];
  if (input.note !== undefined) payment.note = input.note.trim();
  payment.updatedAt = nowIso();

  recalcOrder(draft, order);
  payment.status = order.paymentStatus;
  return { order, payment };
}

export function removePayment(
  draft: Database,
  input: { orderId: string; paymentId: string },
): { order: RepairOrder; removed: Payment } {
  const index = draft.payments.findIndex(
    (payment) => payment.id === input.paymentId && payment.orderId === input.orderId,
  );
  if (index === -1) throw new NotFoundError('Payment not found.');
  const removed = draft.payments[index];
  if (!removed) throw new NotFoundError('Payment not found.');
  draft.payments.splice(index, 1);
  const order = recalcOrder(draft, findOrder(draft, input.orderId));
  return { order, removed };
}

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

/**
 * "Mark as Delivered". One button, no form. Closing the order also consumes
 * anything marked "Consume On Delivery" (folders, packaging).
 */
export function deliverOrder(
  draft: Database,
  input: { orderId: string; deliveredTo: string; user: string; from?: string },
): { order: RepairOrder; consumed: number } {
  const order = findOrder(draft, input.orderId);
  if (order.status === 'Delivered') {
    throw new ConflictError('This order is already marked as delivered.');
  }
  if (order.status === 'Cancelled') {
    throw new ConflictError('This order is cancelled.');
  }
  // A device must not go back to the customer while it is still on the bench.
  // "Unable to Repair" is the other legitimate hand-back (customer declined).
  if (order.status !== 'Ready' && order.status !== 'Unable to Repair') {
    throw new ConflictError(
      `This device is still ${order.status}. Mark it Ready before handing it over.`,
    );
  }

  const balance = Math.max(0, round2(order.finalAmount - order.discount - order.paidAmount));
  if (balance > 0) {
    throw new ConflictError(
      `Rs.${balance} is still pending. Take the payment first, then mark as delivered.`,
    );
  }

  const consumed = consumeDeliveryConsumables(draft, { orderId: order.id, user: input.user });

  order.status = 'Delivered';
  order.deliveredAt = nowIso();
  order.deliveredTo = input.deliveredTo.trim() || order.customerName;
  order.paymentStatus = 'Paid';
  addStatusHistory(draft, {
    orderId: order.id,
    from: input.from ?? order.status,
    to: 'Delivered',
    user: input.user,
  });
  recalcOrder(draft, order);
  return { order, consumed: consumed.length };
}

/**
 * Cancelling is a label and nothing else. The bill, its parts, its payments
 * and its history all stay exactly as they are, and stock is never touched -
 * a part sitting on a cancelled bill was still never fitted, so there is
 * nothing to put back and nothing to write off. All that changes is the
 * status, which takes the bill out of the collection, the dues and the day's
 * counts.
 */
export function cancelOrder(
  draft: Database,
  input: { orderId: string; from: OrderStatus; user: string },
): RepairOrder {
  const order = findOrder(draft, input.orderId);
  order.status = 'Cancelled';
  addStatusHistory(draft, { orderId: order.id, from: input.from, to: 'Cancelled', user: input.user });
  recalcOrder(draft, order);
  return order;
}
