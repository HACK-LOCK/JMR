import {
  balanceAmount,
  isClosedStatus,
  isLowStock,
  payableAmount,
  type DashboardData,
  type OrderSummary,
} from '../../../shared/domain';
import { shopDateString } from '../core/datetime';
import { round2 } from '../../../shared/domain';
import { read } from '../data/mutate';

/**
 * The dashboard answers six questions and nothing else:
 *   1. How many devices came in today?
 *   2. How many are on the bench right now?
 *   3. How many are ready for the customer?
 *   4. How much money is still owed?
 *   5. How much did we collect today?
 *   6. Which items are running low?
 * No charts, no trends, no analytics.
 */
export function getDashboard(): DashboardData {
  const db = read();
  const today = shopDateString();

  let todayRepairs = 0;
  let onBench = 0;
  let readyForPickup = 0;
  let pendingPaymentCount = 0;
  let pendingPaymentAmount = 0;
  let todayCollected = 0;

  for (const order of db.orders) {
    if (order.status !== 'Cancelled' && shopDateString(new Date(order.receivedAt)) === today) {
      todayRepairs += 1;
    }
    if (['Checking', 'Approved', 'Repairing', 'Waiting for Part'].includes(order.status)) onBench += 1;
    if (order.status === 'Ready') readyForPickup += 1;

    if (order.status !== 'Cancelled' && order.finalAmount > 0 && order.paymentStatus !== 'Paid') {
      pendingPaymentCount += 1;
      pendingPaymentAmount = round2(pendingPaymentAmount + balanceAmount(order));
    }
  }
  for (const payment of db.payments) {
    if (shopDateString(new Date(payment.date)) === today) todayCollected = round2(todayCollected + payment.amount);
  }

  const lowStockItems = db.parts
    .filter((part) => isLowStock(part))
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 8);

  const partsToConfirm = db.orderParts.filter(
    (line) =>
      !line.consumed &&
      !isClosedStatus(db.orders.find((order) => order.id === line.orderId)?.status ?? 'Received'),
  ).length;

  const openPartsByOrder = new Map<string, number>();
  for (const line of db.orderParts) {
    if (line.consumed) continue;
    openPartsByOrder.set(line.orderId, (openPartsByOrder.get(line.orderId) ?? 0) + 1);
  }
  const summarise = (order: (typeof db.orders)[number]): OrderSummary => ({
    ...order,
    balance: balanceAmount(order),
    payable: payableAmount(order),
    partsPending: openPartsByOrder.get(order.id) ?? 0,
  });

  return {
    todayRepairs,
    onBench,
    readyForPickup,
    pendingPaymentCount,
    pendingPaymentAmount,
    lowStock: db.parts.filter((part) => isLowStock(part)).length,
    todayCollected,
    partsToConfirm,
    recentOrders: db.orders
      .filter((order) => !isClosedStatus(order.status))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, 6)
      .map(summarise),
    readyOrders: db.orders
      .filter((order) => order.status === 'Ready')
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
      .slice(0, 8)
      .map(summarise),
    lowStockItems: lowStockItems.map((part) => ({ ...part, low: true })),
  };
}
