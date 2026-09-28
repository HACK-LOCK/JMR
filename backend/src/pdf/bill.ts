import PDFDocument from 'pdfkit';
import type {
  Customer,
  OrderPart,
  Payment,
  RepairOrder,
  ShopSettings,
} from '../../../shared/domain';
import { balanceAmount, payableAmount, round2 } from '../../../shared/domain';
import { formatDate, formatDateTime, formatTime, toIso } from '../core/datetime';

export interface BillInput {
  settings: ShopSettings;
  order: RepairOrder;
  customer?: Customer;
  parts: OrderPart[];
  payments: Payment[];
}

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#cbd5e1';

function money(value: number): string {
  return `Rs.${round2(value).toFixed(2).replace(/\.00$/, '')}`;
}

function shopName(settings: ShopSettings): string {
  return settings.shopName.toUpperCase();
}

/**
 * One clean A5 bill that doubles as the job card.
 * Layout is fixed and print friendly: shop header, order details, parts,
 * money summary, status. Everything is read from Settings, never hard coded.
 */
export function renderBillPdf(input: BillInput): Promise<Buffer> {
  const { settings, order } = input;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 28, bufferPages: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    let y = doc.page.margins.top;

    /* ---------------------------- shop header ---------------------------- */
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(shopName(settings), left, y, {
      width: pageWidth,
      align: 'center',
    });
    y = doc.y + 2;

    const contacts = [
      [settings.contact1Name, settings.contact1Number],
      [settings.contact2Name, settings.contact2Number],
    ]
      .filter(([name, number]) => name || number)
      .map(([name, number]) => (name && number ? `${name}: ${number}` : name || number))
      .join('   |   ');

    if (contacts) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(contacts, left, y, {
        width: pageWidth,
        align: 'center',
      });
      y = doc.y + 1;
    }

    const address = settings.address.split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean);
    if (address.length > 0) {
      doc.fontSize(8).text(address.join(', '), left, y, { width: pageWidth, align: 'center' });
      y = doc.y + 3;
    }

    doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.8).strokeColor(INK).stroke();
    y += 8;

    /* ---------------------------- order block --------------------------- */
    const cancelled = order.status === 'Cancelled';
    const label = (text: string, x: number, width: number): void => {
      doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(text.toUpperCase(), x, y, { width });
    };
    const value = (text: string, x: number, width: number, bold = false): void => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9.5)
        .fillColor(cancelled ? '#b91c1c' : INK)
        .text(text || '-', x, y, { width });
    };

    const colWidth = pageWidth / 2;
    const rows: [string, string, string, string][] = [
      ['Order ID', order.id, 'Received', `${formatDate(order.receivedAt)}, ${formatTime(order.receivedAt)}`],
      ['Customer', order.customerName, 'Mobile', order.mobile],
      ['Device', order.deviceType, 'Brand / Model', [order.brand, order.model].filter(Boolean).join(' ')],
      ['Expected Delivery', order.expectedDelivery || '-', 'Status', order.status],
    ];

    for (const [labelA, valueA, labelB, valueB] of rows) {
      label(labelA, left, colWidth);
      label(labelB, left + colWidth, colWidth);
      y += 9;
      value(valueA, left, colWidth, true);
      value(valueB, left + colWidth, colWidth, valueB === order.status);
      y = Math.max(doc.y, y + 11) + 1;
    }

    label('Problem', left, pageWidth);
    y += 9;
    value(order.complaint, left, pageWidth);
    y = Math.max(doc.y, y + 11) + 2;

    if (order.imei) {
      label('IMEI / Serial', left, pageWidth);
      y += 9;
      value(order.imei, left, pageWidth);
      y = Math.max(doc.y, y + 11) + 1;
    }

    doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.5).strokeColor(LINE).stroke();
    y += 8;

    /* ------------------------------ parts ------------------------------- */
    if (input.parts.length > 0) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Parts used', left, y);
      y = doc.y + 3;
      for (const part of input.parts) {
        const used = part.consumed ? 'used' : 'not used yet';
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(`${part.partName}  x${part.quantity}  (${used})`, left, y, { width: pageWidth });
        y = doc.y + 1;
      }
      y += 4;
    }

    /* ------------------------------ money ------------------------------- */
    const payable = payableAmount(order);
    const balance = balanceAmount(order);
    const totals: [string, string, boolean?][] = [
      ['Estimated Amount', money(order.estimatedAmount)],
      ['Final Amount', money(order.finalAmount)],
    ];
    if (order.discount > 0) totals.push(['Discount', `- ${money(order.discount)}`]);
    totals.push(['Advance / Paid', `- ${money(order.paidAmount)}`]);

    for (const [name, amount] of totals) {
      doc.font('Helvetica').fontSize(9).fillColor(INK).text(name, left, y);
      doc.font('Helvetica-Bold').fontSize(9).text(amount, left, y, { width: pageWidth, align: 'right' });
      y += 11;
    }

    doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.5).strokeColor(LINE).stroke();
    y += 6;

    if (cancelled) {
      // A cancelled job owes nothing, so a "balance" line would be nonsense on
      // it. What it does carry is whatever was handed over at the counter, and
      // the counter has to give that back.
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#b91c1c');
      doc.text('To return to customer', left, y);
      doc.text(money(order.paidAmount), left, y, { width: pageWidth, align: 'right' });
      y += 14;
    } else {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(balance > 0 ? '#b45309' : '#15803d');
      doc.text('Balance', left, y);
      doc.text(money(balance), left, y, { width: pageWidth, align: 'right' });
      y += 14;
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
    doc.text(`Payment: ${order.paymentStatus}${order.paymentMode ? ` (${order.paymentMode})` : ''}`, left, y);
    y = doc.y + 2;

    if (!cancelled && balance <= 0) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#15803d').text('PAID - Thank you', left, y);
      y = doc.y + 6;
    }

    if (cancelled) {
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#b91c1c').text('CANCELLED', left, y, {
        width: pageWidth,
        align: 'center',
      });
      y = doc.y + 6;
    }

    /* ------------------------------ footer ------------------------------ */
    if (settings.upiId) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`UPI: ${settings.upiId}`, left, y, {
        width: pageWidth,
        align: 'center',
      });
      y = doc.y + 2;
    }
    if (settings.receiptInformation) {
      doc.fontSize(7.5).text(settings.receiptInformation, left, y, { width: pageWidth, align: 'center' });
      y = doc.y + 2;
    }
    if (settings.billFooter) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(settings.billFooter, left, y, {
        width: pageWidth,
        align: 'center',
      });
    }

    doc.end();
  });
}

/** Plain-text version used for WhatsApp / SMS sharing. */
export function billAsText(input: BillInput): string {
  const { settings, order } = input;
  const lines: string[] = [];
  lines.push(shopName(settings));
  if (settings.contact1Number) lines.push(`${settings.contact1Name}: ${settings.contact1Number}`);
  if (settings.contact2Number) lines.push(`${settings.contact2Name}: ${settings.contact2Number}`);
  lines.push(settings.address);
  lines.push('------------------------------');
  lines.push(`Order ID: ${order.id}`);
  lines.push(`Customer: ${order.customerName}`);
  lines.push(`Mobile: ${order.mobile}`);
  lines.push(`Device: ${[order.brand, order.model, order.deviceType].filter(Boolean).join(' ')}`);
  lines.push(`Problem: ${order.complaint}`);
  lines.push(`Received: ${formatDateTime(order.receivedAt)}`);
  if (order.expectedDelivery) lines.push(`Expected Delivery: ${order.expectedDelivery}`);
  lines.push(`Status: ${order.status}`);
  lines.push('------------------------------');
  lines.push(`Final Amount: ${money(order.finalAmount)}`);
  if (order.discount > 0) lines.push(`Discount: ${money(order.discount)}`);
  lines.push(`Advance: ${money(order.paidAmount)}`);
  lines.push(`Balance: ${money(balanceAmount(order))}`);
  lines.push(`Payment: ${order.paymentStatus}`);
  if (settings.upiId) lines.push(`UPI: ${settings.upiId}`);
  return lines.join('\n');
}

export { money as formatMoney, toIso };
