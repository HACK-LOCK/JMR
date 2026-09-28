import zlib from 'node:zlib';

/**
 * A very small .xlsx writer.
 *
 * An .xlsx file is a zip of XML parts, and the only zip tools Node ships with
 * are deflate and crc32, which is everything a zip needs. Writing the file here
 * means the shop gets a real spreadsheet with no new dependency to install and
 * nothing to keep up to date on a machine that may be offline for months.
 *
 * Only what the exports need is supported: a frozen header row, column widths,
 * a bold header, a bold last row for totals, and money formatted to two
 * decimals. Strings are written inline, so there is no shared string table.
 */

export type XlsxValue = string | number | null | undefined;

export interface XlsxColumn {
  header: string;
  /** Column width in Excel's character units. */
  width?: number;
  /** Formats the column as money and lines the numbers up on the right. */
  money?: boolean;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxValue[][];
  /** Bolds the final row, for a totals line. */
  totalsRow?: boolean;
}

/** Style indexes, in the order they are declared in styles.xml. */
const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_MONEY = 2;
const STYLE_MONEY_TOTAL = 3;
const STYLE_TOTAL = 4;

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CORE_PROPS = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';

/* ------------------------------------------------------------------ */
/* XML helpers                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/** Escapes the five characters XML cares about and drops control characters. */
function xml(value: string): string {
  return value
    .replace(CONTROL_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 1 -> A, 27 -> AA. */
function columnLetter(index: number): string {
  let value = index;
  let letters = '';
  while (value > 0) {
    const rest = (value - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters || 'A';
}

function cell(ref: string, value: XlsxValue, style: number): string {
  if (value === null || value === undefined || value === '') {
    // An empty cell still needs to be written, or the row loses its shape.
    return `<c r="${ref}" s="${style}"/>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `<c r="${ref}" s="${style}"/>`;
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  // xml:space="preserve" so a leading or trailing space is not trimmed away.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
}

function stylesXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<styleSheet xmlns="${NS_MAIN}">`,
    '<fonts count="3">',
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    '</fonts>',
    // Index 0 none and index 1 gray125 are required by the format even if unused.
    '<fills count="3">',
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>',
    '</fills>',
    '<borders count="2">',
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border>',
    '</borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="5">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
    '<xf numFmtId="4" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>',
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '</cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '</styleSheet>',
  ].join('');
}

function sheetXml(sheet: XlsxSheet): string {
  const lastColumn = columnLetter(Math.max(sheet.columns.length, 1));
  const lastRow = sheet.rows.length + 1;
  const lastIndex = sheet.rows.length - 1;
  const isTotal = (index: number): boolean => Boolean(sheet.totalsRow) && index === lastIndex;

  const cols = sheet.columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 16}" customWidth="1"/>`,
    )
    .join('');

  const header = sheet.columns
    .map((column, index) => cell(`${columnLetter(index + 1)}1`, column.header, STYLE_HEADER))
    .join('');

  const body = sheet.rows
    .map((row, rowIndex) => {
      const total = isTotal(rowIndex);
      const cells = sheet.columns
        .map((column, index) => {
          const style = column.money
            ? total
              ? STYLE_MONEY_TOTAL
              : STYLE_MONEY
            : total
              ? STYLE_TOTAL
              : STYLE_DEFAULT;
          return cell(`${columnLetter(index + 1)}${rowIndex + 2}`, row[index], style);
        })
        .join('');
      return `<row r="${rowIndex + 2}"${total ? ' ht="18" customHeight="1"' : ''}>${cells}</row>`;
    })
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<worksheet xmlns="${NS_MAIN}">`,
    `<dimension ref="A1:${lastColumn}${lastRow}"/>`,
    '<sheetViews><sheetView workbookViewId="0" tabSelected="1">',
    // The header row stays put while a long bill list is scrolled.
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    '</sheetView></sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
    cols ? `<cols>${cols}</cols>` : '',
    '<sheetData>',
    `<row r="1" ht="22" customHeight="1">${header}</row>`,
    body,
    '</sheetData>',
    '</worksheet>',
  ].join('');
}

/* ------------------------------------------------------------------ */
/* Zip container                                                        */
/* ------------------------------------------------------------------ */

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xff_ff_ff_ff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (CRC_TABLE[(crc ^ (buffer[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

/** MS-DOS date and time pair, which is what the zip headers store. */
function dosStamp(now: Date): { time: number; date: number } {
  const year = Math.max(now.getFullYear(), 1980);
  return {
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
  };
}

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const { time, date } = dosStamp(new Date());
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const compressed = zlib.deflateRawSync(file.data, { level: 9 });
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02_01_4b_50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed to extract
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // method
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // offset of the local header
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralBlock = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBlock.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBlock, end]);
}

/* ------------------------------------------------------------------ */

/** Builds a complete .xlsx file in memory. */
export function buildWorkbook(sheets: XlsxSheet[], now = new Date()): Buffer {
  if (sheets.length < 1) throw new Error('A workbook needs at least one sheet.');
  const stamp = now.toISOString().slice(0, 19);
  const sheetCount = sheets.length;

  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheets.map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '</Types>',
  ].join('');

  const rootRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships xmlns="${NS_PKG_REL}">`,
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>`,
    `<Relationship Id="rId2" Type="${NS_CORE_PROPS}" Target="docProps/core.xml"/>`,
    '</Relationships>',
  ].join('');

  const core = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<cp:coreProperties xmlns:cp="${NS_CORE_PROPS}" xmlns:dc="http://purl.org/dc/elements/1.1/"`,
    ' xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}Z</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}Z</dcterms:modified>`,
    '</cp:coreProperties>',
  ].join('');

  const workbook = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`,
    '<sheets>',
    ...sheets.map((sheet, index) => {
      // Excel rejects these characters in a sheet name, so they are replaced
      // rather than left in to make the file unopenable.
      const name = sheet.name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
      return `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
    }),
    '</sheets>',
    '</workbook>',
  ].join('');

  const workbookRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships xmlns="${NS_PKG_REL}">`,
    ...sheets.map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    ),
    `<Relationship Id="rId${sheetCount + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`,
    '</Relationships>',
  ].join('');

  const files: { name: string; data: Buffer }[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'docProps/core.xml', data: Buffer.from(core, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml(), 'utf8') },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(sheetXml(sheet), 'utf8'),
    })),
  ];

  return zip(files);
}
