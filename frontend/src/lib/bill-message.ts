import type { ShopSettings } from '@shared/domain';
import { dateOnly, deviceLabel } from './format';

/** The bits of a bill a message needs. Works for list rows and full details. */
export interface BillForMessage {
  id: string;
  customerName: string;
  brand: string;
  model: string;
  complaint: string;
  status: string;
  receivedAt: string;
  expectedDelivery: string;
  finalAmount: number;
  discount: number;
  paidAmount: number;
  balance: number;
}

function shopLines(settings: ShopSettings): string[] {
  const lines: string[] = [];
  if (settings.address.trim()) lines.push(`📍 ${settings.address.trim()}`);
  const numbers = [settings.contact1Number, settings.contact2Number]
    .map((number) => number.trim())
    .filter(Boolean);
  if (numbers.length > 0) lines.push(`📞 ${numbers.join(' | ')}`);
  return lines;
}

const divider = '━'.repeat(20);

/**
 * The bill as a WhatsApp repair receipt. Every name, number and address comes
 * from the shop settings on the server, so a message never carries an old shop
 * name. Deliberately kept to what a customer needs on their phone: the shop,
 * the receipt number and date, the customer name, and the device being repaired.
 * No totals, no payment lines, no fine print - the counter confirms the amount
 * face to face when the device is handed over.
 */
export function billMessage(order: BillForMessage, settings: ShopSettings): string {
  const shop = settings.shopName.trim();
  const device = deviceLabel(order.brand, order.model);
  const problem = order.complaint.trim();

  const lines: string[] = [`🏪 *${shop.toUpperCase()}*`, ...shopLines(settings), divider];
  lines.push('', '🧾 *REPAIR RECEIPT*', '', `*Receipt No.:* ${order.id}`);
  lines.push(`*Received On:* ${dateOnly(order.receivedAt)}`);
  lines.push('', '👤 *CUSTOMER*', `*Name:* ${order.customerName}`);
  lines.push('', '📱 *DEVICE*', `*Model:* ${device}`);
  if (problem) lines.push(`*Problem:* ${problem}`);
  lines.push(
    '',
    divider,
    'Thank you for choosing',
    `*${shop}.*`,
    '',
    '*Keep this receipt number for reference:*',
    `*${order.id}*`,
    divider,
  );
  return lines.join('\n');
}

/** Dials the customer straight from the app. */
export function callLink(mobile: string): string {
  return `tel:${mobile.replace(/\D+/g, '')}`;
}

/**
 * Opens WhatsApp on the customer's chat with the bill already typed out but
 * NOT sent, so the employee can read it once before it goes.
 */
export function whatsappLink(mobile: string, order: BillForMessage, settings: ShopSettings): string {
  const digits = mobile.replace(/\D+/g, '');
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(billMessage(order, settings))}`;
}
