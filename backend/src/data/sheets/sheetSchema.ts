import type { ConsumeMode, DatasetKey, PaymentMode } from '../../../../shared/domain';

export type ColumnType = 'string' | 'number' | 'bool' | 'list';

export interface ColumnDef {
  /** Human readable header, exactly as it appears in Google Sheets. */
  header: string;
  /** Field name on the record. */
  field: string;
  type: ColumnType;
}

export interface TableDef {
  /** Tab name inside the spreadsheet. */
  sheet: string;
  /** Unique field used as the stable id. */
  key: string;
  columns: ColumnDef[];
  /** Sort ascending by this field on load, to keep row order predictable. */
  sortBy?: string;
}

const s = (header: string, field: string): ColumnDef => ({ header, field, type: 'string' });
const n = (header: string, field: string): ColumnDef => ({ header, field, type: 'number' });
const b = (header: string, field: string): ColumnDef => ({ header, field, type: 'bool' });
const l = (header: string, field: string): ColumnDef => ({ header, field, type: 'list' });

/**
 * One tab per table. Headers are frozen and bolded so the sheet stays
 * human-readable for the owner. Adding a column here is all that is needed to
 * add a field to the spreadsheet.
 */
/** Tabs that can be synced by hand. Settings is handled separately. */
export type SyncableDataset = Exclude<DatasetKey, 'settings'>;

export const TABLES: Record<SyncableDataset, TableDef> = {
  customers: {
    sheet: 'Customers',
    key: 'id',
    columns: [
      s('Customer ID', 'id'),
      s('Name', 'name'),
      s('Mobile', 'mobile'),
      s('Alternate Number', 'altMobile'),
      s('Email', 'email'),
      s('Address', 'address'),
      s('Notes', 'notes'),
      s('Created At', 'createdAt'),
      s('Updated At', 'updatedAt'),
    ],
    sortBy: 'createdAt',
  },
  orders: {
    sheet: 'Orders',
    key: 'id',
    columns: [
      s('Order ID', 'id'),
      s('Customer ID', 'customerId'),
      s('Customer', 'customerName'),
      s('Mobile', 'mobile'),
      s('Device Type', 'deviceType'),
      s('Brand', 'brand'),
      s('Model', 'model'),
      s('Complaint', 'complaint'),
      s('Status', 'status'),
      s('Received At', 'receivedAt'),
      s('Expected Delivery', 'expectedDelivery'),
      s('Delivered At', 'deliveredAt'),
      s('IMEI / Serial', 'imei'),
      s('Device Condition', 'deviceCondition'),
      s('Accessories Received', 'accessories'),
      s('Technician', 'technician'),
      s('Notes', 'notes'),
      s('Repair Photos', 'photos'),
      n('Estimated Amount', 'estimatedAmount'),
      n('Final Amount', 'finalAmount'),
      n('Discount', 'discount'),
      n('Advance', 'paidAmount'),
      n('Balance', 'balance'),
      s('Payment Status', 'paymentStatus'),
      s('Payment Mode', 'paymentMode'),
      s('Bill Drive File ID', 'billDriveFileId'),
      s('Bill Drive Link', 'billDriveLink'),
      s('Delivered To', 'deliveredTo'),
      s('Created By', 'createdBy'),
      s('Created At', 'createdAt'),
      s('Updated At', 'updatedAt'),
    ],
    sortBy: 'receivedAt',
  },
  payments: {
    sheet: 'Payments',
    key: 'id',
    columns: [
      s('Payment ID', 'id'),
      s('Order ID', 'orderId'),
      n('Amount', 'amount'),
      s('Payment Mode', 'mode'),
      s('Status', 'status'),
      s('Date', 'date'),
      s('User', 'user'),
      s('Note', 'note'),
      s('Updated At', 'updatedAt'),
    ],
    sortBy: 'date',
  },
  parts: {
    sheet: 'Parts',
    key: 'id',
    columns: [
      s('Part ID', 'id'),
      s('Part Name', 'name'),
      s('Category', 'category'),
      s('Brand', 'brand'),
      s('Model', 'model'),
      n('Quantity', 'quantity'),
      n('Minimum Quantity', 'minQuantity'),
      n('Purchase Cost', 'purchaseCost'),
      n('Selling Price', 'sellingPrice'),
      s('Supplier ID', 'supplierId'),
      s('Supplier', 'supplierName'),
      s('Consume Mode', 'consumeMode'),
      b('Active', 'active'),
      s('Created At', 'createdAt'),
      s('Updated At', 'updatedAt'),
    ],
    sortBy: 'name',
  },
  stockMovements: {
    sheet: 'Stock Movements',
    key: 'id',
    columns: [
      s('Movement ID', 'id'),
      s('Part ID', 'partId'),
      s('Part Name', 'partName'),
      s('Order ID', 'orderId'),
      s('Type', 'type'),
      n('Quantity', 'quantity'),
      s('Reason', 'reason'),
      n('Balance After', 'balanceAfter'),
      s('Date', 'date'),
      s('User', 'user'),
      s('Created At', 'createdAt'),
    ],
    sortBy: 'date',
  },
  suppliers: {
    sheet: 'Suppliers',
    key: 'id',
    columns: [
      s('Supplier ID', 'id'),
      s('Name', 'name'),
      s('Mobile', 'mobile'),
      s('Notes', 'notes'),
      s('Created At', 'createdAt'),
      s('Updated At', 'updatedAt'),
    ],
    sortBy: 'name',
  },
};

/** Tabs that exist in the workbook but are not part of the "datasets" the owner syncs by hand. */
export const EXTRA_TABLES = {
  orderParts: {
    sheet: 'Order Parts',
    key: 'id',
    columns: [
      s('Row ID', 'id'),
      s('Order ID', 'orderId'),
      s('Part ID', 'partId'),
      s('Part Name', 'partName'),
      n('Quantity', 'quantity'),
      n('Unit Price', 'unitPrice'),
      b('Consumed', 'consumed'),
      s('Consumed At', 'consumedAt'),
      s('Consume Mode', 'consumeMode'),
      s('Created At', 'createdAt'),
      s('Updated At', 'updatedAt'),
    ],
  },
  statusHistory: {
    sheet: 'Status History',
    key: 'id',
    columns: [
      s('History ID', 'id'),
      s('Order ID', 'orderId'),
      s('From Status', 'fromStatus'),
      s('To Status', 'toStatus'),
      s('Date/Time', 'at'),
      s('User', 'user'),
    ],
  },
} as const satisfies Record<string, TableDef>;

/** Every tab, in creation order. */
export const ALL_TABLES: TableDef[] = [
  TABLES.customers,
  TABLES.orders,
  TABLES.payments,
  TABLES.parts,
  TABLES.stockMovements,
  TABLES.suppliers,
  EXTRA_TABLES.orderParts,
  EXTRA_TABLES.statusHistory,
];

export type TableKey = DatasetKey | keyof typeof EXTRA_TABLES;

/** Settings tab: field names across the top, values underneath (easy to edit by hand). */
export const SETTINGS_COLUMNS: string[] = [
  'Shop Name',
  'Contact 1 Name',
  'Contact 1 Number',
  'Contact 2 Name',
  'Contact 2 Number',
  'Address',
  'Service Description',
  'UPI ID',
  'Receipt Information',
  'Bill Footer',
  'Allow Negative Stock',
  'Updated At',
];

export const SETTINGS_FIELD_BY_HEADER: Record<string, string> = {
  'Shop Name': 'shopName',
  'Contact 1 Name': 'contact1Name',
  'Contact 1 Number': 'contact1Number',
  'Contact 2 Name': 'contact2Name',
  'Contact 2 Number': 'contact2Number',
  Address: 'address',
  'Service Description': 'serviceDescription',
  'UPI ID': 'upiId',
  'Receipt Information': 'receiptInformation',
  'Bill Footer': 'billFooter',
  'Allow Negative Stock': 'allowNegativeStock',
  'Updated At': 'updatedAt',
};

/* ------------------------------ value codecs ----------------------------- */

const LIST_SEPARATOR = ' | ';

export function encodeCell(value: unknown, type: ColumnType): string | number | boolean {
  if (value === null || value === undefined) {
    return type === 'number' ? 0 : type === 'bool' ? false : '';
  }
  if (type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
  if (type === 'bool') {
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    return text === 'true' || text === 'yes' || text === '1';
  }
  if (type === 'list') {
    if (Array.isArray(value)) return value.filter(Boolean).join(LIST_SEPARATOR);
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function decodeCell(raw: unknown, type: ColumnType, field: string): unknown {
  if (type === 'number') {
    if (raw === null || raw === undefined || raw === '') return 0;
    const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(num) ? num : 0;
  }
  if (type === 'bool') {
    if (typeof raw === 'boolean') return raw;
    const text = String(raw ?? '').trim().toLowerCase();
    return text === 'true' || text === 'yes' || text === '1';
  }
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (type === 'list') return text === '' ? [] : text.split(LIST_SEPARATOR).map((item) => item.trim()).filter(Boolean);
  return text;
}

export function rowToRecord<T extends Record<string, unknown>>(
  table: TableDef,
  row: unknown[],
): T | null {
  const record: Record<string, unknown> = {};
  table.columns.forEach((column, index) => {
    record[column.field] = decodeCell(row[index], column.type, column.field);
  });
  const key = record[table.key];
  if (typeof key !== 'string' || key.trim() === '') return null;
  return record as T;
}

export function recordToRow(table: TableDef, record: Record<string, unknown>): (string | number | boolean)[] {
  return table.columns.map((column) => encodeCell(record[column.field], column.type));
}

/** Normalise free text typed by a human in a spreadsheet cell. */
export function normalizeEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const direct = allowed.find((item) => item.toLowerCase() === value.trim().toLowerCase());
  if (direct) return direct;
  const normalised = value.trim().toLowerCase().replace(/[\s_]+/g, '');
  const loose = allowed.find(
    (item) => item.toLowerCase().replace(/[\s_]+/g, '') === normalised,
  );
  return loose ?? fallback;
}

export function asPaymentMode(value: string): PaymentMode {
  return normalizeEnum(value, ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'] as const, 'Cash');
}

export function asConsumeMode(value: string): ConsumeMode {
  return normalizeEnum(value, ['PART_USED', 'DELIVERY'] as const, 'PART_USED');
}
