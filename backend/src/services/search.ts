import { balanceAmount, type Part, type RepairOrder } from '../../../shared/domain';
import { normalizeMobile } from '../core/id';
import { read } from '../data/mutate';

export interface SearchHit {
  kind: 'order' | 'part' | 'customer';
  id: string;
  title: string;
  subtitle: string;
  status: string;
  amount: number;
  balance: number;
  billLink: string;
}

/** `billing` hides stock items, so the billing search box stays about bills. */
export type SearchScope = 'all' | 'billing' | 'stock';

/**
 * One search box for the whole shop: Order ID, customer name, mobile number,
 * device model or part name. Results are ranked so orders always come first.
 */
export function search(query: string, limit = 20, scope: SearchScope = 'all'): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const db = read();
  const digits = normalizeMobile(q);
  const scored: (SearchHit & { score: number })[] = [];

  for (const order of db.orders) {
    const score = scoreOrder(order, q, digits);
    if (score <= 0) continue;
    scored.push({
      score,
      kind: 'order',
      id: order.id,
      title: `${order.id} - ${order.customerName}`,
      subtitle: [order.brand, order.model].filter(Boolean).join(' ') || order.deviceType,
      status: order.status,
      amount: order.finalAmount,
      balance: balanceAmount(order),
      billLink: order.billDriveLink,
    });
  }

  for (const part of db.parts) {
    if (scope === 'billing') break;
    if (!part.active) continue;
    const score = scorePart(part, q);
    if (score <= 0) continue;
    scored.push({
      score,
      kind: 'part',
      id: part.id,
      title: part.name,
      subtitle: `${part.brand} ${part.model}`.trim() || part.category,
      status: part.quantity <= part.minQuantity ? 'Low Stock' : `${part.quantity} in stock`,
      amount: part.sellingPrice,
      balance: 0,
      billLink: '',
    });
  }

  for (const customer of db.customers) {
    const score = scoreCustomer(customer, q, digits);
    if (score <= 0) continue;
    const own = db.orders.filter((order) => order.customerId === customer.id);
    scored.push({
      score,
      kind: 'customer',
      id: customer.id,
      title: customer.name,
      subtitle: customer.mobile,
      status: `${own.length} bill${own.length === 1 ? '' : 's'}`,
      amount: 0,
      balance: own.reduce(
        (sum, order) => sum + (order.status === 'Cancelled' ? 0 : balanceAmount(order)),
        0,
      ),
      billLink: '',
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit);
}

function scoreOrder(order: RepairOrder, q: string, digits: string): number {
  if (order.id.toLowerCase() === q) return 100;
  if (order.id.toLowerCase().includes(q)) return 90;
  if (order.customerName.toLowerCase().startsWith(q)) return 80;
  if (order.customerName.toLowerCase().includes(q)) return 70;
  if (digits.length >= 4 && order.mobile.includes(digits)) return 75;
  if (order.model.toLowerCase().includes(q)) return 60;
  if (order.brand.toLowerCase().includes(q)) return 55;
  if (order.complaint.toLowerCase().includes(q)) return 40;
  return 0;
}

function scorePart(part: Part, q: string): number {
  if (part.id.toLowerCase() === q) return 85;
  if (part.name.toLowerCase().startsWith(q)) return 65;
  if (part.name.toLowerCase().includes(q)) return 50;
  if (part.model.toLowerCase().includes(q)) return 40;
  if (part.brand.toLowerCase().includes(q)) return 30;
  return 0;
}

function scoreCustomer(
  customer: { id: string; name: string; mobile: string; altMobile: string },
  q: string,
  digits: string,
): number {
  if (customer.id.toLowerCase() === q) return 95;
  if (customer.name.toLowerCase().startsWith(q)) return 60;
  if (customer.name.toLowerCase().includes(q)) return 45;
  if (digits.length >= 4 && (customer.mobile.includes(digits) || customer.altMobile.includes(digits))) {
    return 70;
  }
  return 0;
}
