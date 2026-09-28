import PDFDocument from 'pdfkit';
import type { CustomerExportColumn } from '../../../shared/domain';
import { formatMoney } from './bill';

export interface CustomerListPdfInput {
  shopName: string;
  /** Only the columns the person ticked, already in list order. */
  columns: CustomerExportColumn[];
  /** One entry per ticked column, in the same order. */
  rows: (string | number)[][];
  exportedOn: string;
  /** The search the list was filtered by, so the file says what it covers. */
  search?: string;
}

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#cbd5e1';
const BAND = '#f1f5f9';

const FONT_SIZE = 7.5;
/** Space above and below the text inside a row. */
const ROW_PADDING = 4;
/** Kept clear at the foot of every page for the page number. */
const FOOTER_ROOM = 14;
const HEAD_HEIGHT = 18;

function cellText(column: CustomerExportColumn, value: string | number): string {
  if (typeof value === 'number') return column.money ? formatMoney(value) : String(value);
  return value.trim();
}

/**
 * The customer list as a printed table, holding nothing but the ticked columns.
 *
 * Landscape A4 because the widest choice is all ten columns side by side, and
 * the page is a landscape page whether that is one column or ten. The heading
 * repeats on every page, because a table that runs over a page break with no
 * headings on the second page is unreadable, and the page count is written last
 * once every page exists.
 */
export function renderCustomerListPdf(input: CustomerListPdfInput): Promise<Buffer> {
  const { columns, rows } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 32,
      // Held back so the total can be written once the page count is known.
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableBottom = doc.page.height - doc.page.margins.bottom - FOOTER_ROOM;

    // Every column keeps its share of the page, so a two column file is still a
    // full width table rather than two narrow strips of text in a wide margin.
    // The x of each column is worked out once, so drawing never has to add up
    // widths as it goes.
    const weight = columns.reduce((sum, column) => sum + column.width, 0);
    const layout = columns.map((column) => ({
      column,
      width: (column.width / weight) * pageWidth,
      x: 0,
      text: (column.money ? 'right' : 'left') as 'left' | 'right',
    }));
    layout.forEach((cell, index) => {
      cell.x = layout.slice(0, index).reduce((at, earlier) => at + earlier.width, left);
    });

    const drawHead = (atY: number): number => {
      doc.rect(left, atY, pageWidth, HEAD_HEIGHT).fillColor(BAND).fill();
      doc.font('Helvetica-Bold').fontSize(FONT_SIZE).fillColor(INK);
      layout.forEach((cell) => {
        doc.text(cell.column.header.toUpperCase(), cell.x + 3, atY + 5.5, {
          width: cell.width - 6,
          align: cell.text,
          lineBreak: false,
          ellipsis: true,
        });
      });
      doc.moveTo(left, atY).lineTo(left + pageWidth, atY).lineWidth(0.6).strokeColor(INK).stroke();
      doc.moveTo(left, atY + HEAD_HEIGHT)
        .lineTo(left + pageWidth, atY + HEAD_HEIGHT)
        .lineWidth(0.6)
        .strokeColor(INK)
        .stroke();
      return atY + HEAD_HEIGHT;
    };

    /* -------------------------------- title ------------------------------- */
    let y = doc.page.margins.top;
    doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(input.shopName.toUpperCase(), left, y, {
      width: pageWidth,
    });
    y = doc.y + 1;
    doc.font('Helvetica-Bold').fontSize(11).text('Customers', left, y);
    y = doc.y + 1;

    const facts = [
      `${rows.length} customer${rows.length === 1 ? '' : 's'}`,
      input.search?.trim() ? `search "${input.search.trim()}"` : 'all customers',
      `${columns.length} column${columns.length === 1 ? '' : 's'}`,
      `exported ${input.exportedOn}`,
    ].join('   |   ');
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(facts, left, y);
    y = doc.y + 4;
    doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.8).strokeColor(INK).stroke();
    y += 8;

    /* -------------------------------- table ------------------------------- */
    y = drawHead(y);
    rows.forEach((row, rowIndex) => {
      // Text width, not column width, so a long address still makes a tall row.
      const cells = layout.map((cell, index) => ({
        ...cell,
        value: cellText(cell.column, row[index] ?? ''),
      }));
      doc.font('Helvetica').fontSize(FONT_SIZE);
      const height =
        cells.reduce(
          (tallest, cell) => Math.max(tallest, doc.heightOfString(cell.value || '-', { width: cell.width - 6 })),
          0,
        ) + ROW_PADDING * 2;

      if (y + height > tableBottom) {
        doc.addPage();
        y = drawHead(doc.page.margins.top);
      }

      if (rowIndex % 2 === 1) {
        doc.rect(left, y, pageWidth, height).fillColor(BAND).fill();
      }
      cells.forEach((cell) => {
        doc.font('Helvetica').fontSize(FONT_SIZE).fillColor(INK).text(cell.value || '-', cell.x + 3, y + ROW_PADDING, {
          width: cell.width - 6,
          align: cell.text,
        });
      });
      doc.moveTo(left, y + height).lineTo(left + pageWidth, y + height).lineWidth(0.3).strokeColor(LINE).stroke();
      y += height;
    });

    /* -------------------------------- footer ------------------------------ */
    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(MUTED)
        .text(`Page ${index + 1} of ${range.count}`, left, doc.page.height - doc.page.margins.bottom + 6, {
          width: pageWidth,
          align: 'center',
          lineBreak: false,
        });
    }
    doc.flushPages();
    doc.end();
  });
}
