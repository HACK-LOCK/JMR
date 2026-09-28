import type { ShopSettings } from '@shared/domain';
import { money, dateOnly, deviceLabel } from './format';

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
  if (settings.address) lines.push(settings.address);
  const numbers = [settings.contact1Number, settings.contact2Number]
    .map((number) => number.trim())
    .filter(Boolean);
  if (numbers.length > 0) lines.push(`Phone: ${numbers.join(' / ')}`);
  return lines;
}

/**
 * The bill as plain text. Every name, number and address comes from the shop
 * settings on the server, so a message never carries an old shop name.
 */
export function billMessage(order: BillForMessage, settings: ShopSettings): string {
  const device = deviceLabel(order.brand, order.model);
  const lines: string[] = [
    `*${settings.shopName}*`,
    ...shopLines(settings),
    '',
    `Bill *${order.id}*`,
    `Customer: ${order.customerName}`,
    `Device: ${device}`,
  ];
  if (order.complaint) lines.push(`Problem: ${order.complaint}`);
  lines.push(`Received: ${dateOnly(order.receivedAt)}`);
  if (order.expectedDelivery) lines.push(`Expected: ${order.expectedDelivery}`);
  lines.push(`Status: ${order.status}`);
  lines.push('', `Total: ${money(order.finalAmount)}`);
  if (order.discount > 0) lines.push(`Discount: -${money(order.discount)}`);
  if (order.paidAmount > 0) lines.push(`Paid: ${money(order.paidAmount)}`);
  if (order.balance > 0) {
    lines.push(`*Balance due: ${money(order.balance)}*`);
    if (settings.upiId) {
      const upi = encodeURIComponent(
        `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(
          settings.shopName,
        )}&am=${encodeURIComponent(String(order.balance))}&cu=INR&tn=${encodeURIComponent(
          `${settings.shopName} ${order.id}`,
        )}`,
      );
      lines.push(`Pay by UPI: ${upi}`);
    }
  } else {
    lines.push('*Paid in full. Thank you!*');
  }
  if (settings.receiptInformation) lines.push('', settings.receiptInformation);
  if (settings.billFooter) lines.push(settings.billFooter);
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
