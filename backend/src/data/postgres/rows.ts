import { round2 } from '../../../../shared/domain';
import type { Database } from '../database';
import type { Meta } from '../database';

/**
 * How each field of the domain model is stored in Postgres.
 *
 * Written as one table per entity instead of hand written INSERT and SELECT
 * statements, because the two are the same list of fields in two directions and
 * a hand written pair is guaranteed to drift apart the first time a field is
 * added. Renaming a field here changes the SQL and the TypeScript together.
 */
type Kind = 'text' | 'int' | 'money' | 'bool' | 'ts' | 'textArray';

export interface Col {
  /** Column name in Postgres. */
  col: string;
  /** Field name on the TypeScript record. */
  field: string;
  kind: Kind;
}

const t = (col: string, field: string): Col => ({ col, field, kind: 'text' });
const i = (col: string, field: string): Col => ({ col, field, kind: 'int' });
const m = (col: string, field: string): Col => ({ col, field, kind: 'money' });
const b = (col: string, field: string): Col => ({ col, field, kind: 'bool' });
const ts = (col: string, field: string): Col => ({ col, field, kind: 'ts' });
const arr = (col: string, field: string): Col => ({ col, field, kind: 'textArray' });

export type DatasetName =
  | 'customers'
  | 'orders'
  | 'payments'
  | 'parts'
  | 'orderParts'
  | 'stockMovements'
  | 'suppliers'
  | 'statusHistory';

export interface TableMapping {
  /** Table name in Postgres. */
  table: string;
  /** Primary key column. */
  key: string;
  columns: Col[];
}

export interface TableSpec extends TableMapping {
  /** The matching key on Database. */
  dataset: DatasetName;
}

/**
 * Order matters twice over: a parent must be written before its children, or
 * the foreign key rejects the row, and a parent deleted before its children is
 * what lets ON DELETE CASCADE do the tidying up.
 */
export const TABLE_SPECS: TableSpec[] = [
  {
    dataset: 'customers',
    table: 'customers',
    key: 'id',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('mobile', 'mobile'),
      t('alt_mobile', 'altMobile'),
      t('email', 'email'),
      t('address', 'address'),
      t('notes', 'notes'),
      ts('created_at', 'createdAt'),
      ts('updated_at', 'updatedAt'),
    ],
  },
  {
    dataset: 'suppliers',
    table: 'suppliers',
    key: 'id',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('mobile', 'mobile'),
      t('notes', 'notes'),
      ts('created_at', 'createdAt'),
      ts('updated_at', 'updatedAt'),
    ],
  },
  {
    dataset: 'parts',
    table: 'parts',
    key: 'id',
    columns: [
      t('id', 'id'),
      t('name', 'name'),
      t('category', 'category'),
      t('brand', 'brand'),
      t('model', 'model'),
      i('quantity', 'quantity'),
      i('min_quantity', 'minQuantity'),
      m('purchase_cost', 'purchaseCost'),
      m('selling_price', 'sellingPrice'),
      t('supplier_id', 'supplierId'),
      t('supplier_name', 'supplierName'),
      t('consume_mode', 'consumeMode'),
      b('active', 'active'),
      ts('created_at', 'createdAt'),
      ts('updated_at', 'updatedAt'),
    ],
  },
  {
    dataset: 'orders',
    table: 'orders',
    key: 'id',
    columns: [
      t('id', 'id'),
      t('customer_id', 'customerId'),
      t('customer_name', 'customerName'),
      t('mobile', 'mobile'),
      t('device_type', 'deviceType'),
      t('brand', 'brand'),
      t('model', 'model'),
      t('complaint', 'complaint'),
      t('imei', 'imei'),
      t('device_condition', 'deviceCondition'),
      t('accessories', 'accessories'),
      ts('expected_delivery', 'expectedDelivery'),
      t('technician', 'technician'),
      t('notes', 'notes'),
      arr('photos', 'photos'),
      t('status', 'status'),
      ts('received_at', 'receivedAt'),
      ts('delivered_at', 'deliveredAt'),
      t('delivered_to', 'deliveredTo'),
      m('estimated_amount', 'estimatedAmount'),
      m('final_amount', 'finalAmount'),
      m('discount', 'discount'),
      m('paid_amount', 'paidAmount'),
      t('payment_status', 'paymentStatus'),
      t('payment_mode', 'paymentMode'),
      t('bill_drive_file_id', 'billDriveFileId'),
      t('bill_drive_link', 'billDriveLink'),
      ts('bill_printed_at', 'billPrintedAt'),
      t('created_by', 'createdBy'),
      ts('created_at', 'createdAt'),
      ts('updated_at', 'updatedAt'),
      b('pending_sync', 'pendingSync'),
    ],
  },
  {
    dataset: 'orderParts',
    table: 'order_parts',
    key: 'id',
    columns: [
      t('id', 'id'),
      t('order_id', 'orderId'),
      t('part_id', 'partId'),
      t('part_name', 'partName'),
      i('quantity', 'quantity'),
      m('unit_price', 'unitPrice'),
      b('consumed', 'consumed'),
      ts('consumed_at', 'consumedAt'),
      t('consume_mode', 'consumeMode'),
      ts('created_at', 'createdAt'),
      ts('updated_at', 'updatedAt'),
    ],
  },
  {
    dataset: 'payments',
    table: 'payments',
    key: 'id',
    columns: [
      t('id', 'id'),
      t('order_id', 'orderId'),
      m('amount', 'amount'),
      t('mode', 'mode'),
      t('status', 'status'),
      t('note', 'note'),
      ts('date', 'date'),
      t('user_name', 'user'),
      t('idempotency_key', 'idempotencyKey'),
      ts('created_at', 'createdAt'),
      ts('updated_at', 'updatedAt'),
    ],
  },
  {
    dataset: 'statusHistory',
    table: 'status_history',
    key: 'id',
    columns: [
      t('id', 'id'),
      t('order_id', 'orderId'),
      t('from_status', 'fromStatus'),
      t('to_status', 'toStatus'),
      ts('at', 'at'),
      t('user_name', 'user'),
    ],
  },
  {
    dataset: 'stockMovements',
    table: 'stock_movements',
    key: 'id',
    columns: [
      t('id', 'id'),
      t('part_id', 'partId'),
      t('part_name', 'partName'),
      t('order_id', 'orderId'),
      t('type', 'type'),
      i('quantity', 'quantity'),
      t('reason', 'reason'),
      i('balance_after', 'balanceAfter'),
      ts('date', 'date'),
      t('user_name', 'user'),
      t('idempotency_key', 'idempotencyKey'),
      ts('created_at', 'createdAt'),
    ],
  },
];

export const SETTINGS_COLUMNS = [
  'shop_name',
  'contact1_name',
  'contact1_number',
  'contact2_name',
  'contact2_number',
  'address',
  'service_description',
  'upi_id',
  'receipt_information',
  'bill_footer',
  'allow_negative_stock',
  'sheet_name',
  'updated_at',
] as const;

/** Settings is one row, so its mapping is a pair of objects rather than a list. */
const SETTINGS_FIELDS: Record<(typeof SETTINGS_COLUMNS)[number], string> = {
  shop_name: 'shopName',
  contact1_name: 'contact1Name',
  contact1_number: 'contact1Number',
  contact2_name: 'contact2Name',
  contact2_number: 'contact2Number',
  address: 'address',
  service_description: 'serviceDescription',
  upi_id: 'upiId',
  receipt_information: 'receiptInformation',
  bill_footer: 'billFooter',
  allow_negative_stock: 'allowNegativeStock',
  sheet_name: 'sheetName',
  updated_at: 'updatedAt',
};

/**
 * The domain model uses '' for "not set", Postgres uses NULL, and a timestamp
 * that is not a real date must never reach the column or the whole write is
 * rejected. An unreadable date is dropped rather than guessed at.
 */
function toTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  if (Number.isNaN(Date.parse(text))) return null;
  return text;
}

function fromTimestamp(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  const text = String(value).trim();
  if (text === '') return '';
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
}

function encodeValue(kind: Kind, value: unknown): unknown {
  switch (kind) {
    case 'int': {
      const num = Math.trunc(Number(value));
      return Number.isFinite(num) ? num : 0;
    }
    case 'money': {
      const num = Number(value);
      return Number.isFinite(num) ? round2(num) : 0;
    }
    case 'bool':
      return Boolean(value);
    case 'ts':
      return toTimestamp(value);
    case 'textArray':
      return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item !== '') : [];
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

function decodeValue(kind: Kind, value: unknown): unknown {
  switch (kind) {
    case 'int': {
      const num = Number(value);
      return Number.isFinite(num) ? Math.trunc(num) : 0;
    }
    case 'money': {
      // Postgres hands numeric back as a string on purpose, so a rupee is never
      // quietly turned into 2499.9999999999995 by a float.
      if (value === null || value === undefined) return 0;
      const num = Number(value);
      return Number.isFinite(num) ? round2(num) : 0;
    }
    case 'bool':
      return value === true || value === 'true' || value === 't';
    case 'ts':
      return fromTimestamp(value);
    case 'textArray':
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

/** Column names for an INSERT, in the order toValues produces. */
export function columnList(spec: TableMapping): string[] {
  return spec.columns.map((column) => column.col);
}

export function toValues(spec: TableMapping, record: Record<string, unknown>): unknown[] {
  return spec.columns.map((column) => encodeValue(column.kind, record[column.field]));
}

export function toRecord(spec: TableMapping, row: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const column of spec.columns) {
    record[column.field] = decodeValue(column.kind, row[column.col]);
  }
  return record;
}

/** settings row -> ShopSettings. */
export function settingsToRecord(row: Record<string, unknown>): Database['settings'] {
  const record: Record<string, unknown> = {};
  for (const column of SETTINGS_COLUMNS) {
    const field = SETTINGS_FIELDS[column];
    const kind: Kind = column === 'allow_negative_stock' ? 'bool' : column === 'updated_at' ? 'ts' : 'text';
    record[field] = decodeValue(kind, row[column]);
  }
  return record as unknown as Database['settings'];
}

/** ShopSettings -> settings row. */
export function settingsToRow(settings: Database['settings']): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const column of SETTINGS_COLUMNS) {
    const field = SETTINGS_FIELDS[column];
    const kind: Kind = column === 'allow_negative_stock' ? 'bool' : column === 'updated_at' ? 'ts' : 'text';
    values[column] = encodeValue(kind, (settings as unknown as Record<string, unknown>)[field]);
  }
  return values;
}

/** meta row -> Meta. */
export function metaToRecord(row: Record<string, unknown>): Meta {
  // Postgres hands an integer back as a number, but the column may still hold the
  // old jsonb counter on a database that has not been converted yet, so both
  // shapes are accepted and reduced to one number.
  const raw = row['order_sequence'];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const highest = Object.values(raw as Record<string, unknown>).reduce<number>(
      (max, value) => Math.max(max, Number(value) || 0),
      0,
    );
    return { orderSequence: highest, ...metaTimestamps(row) };
  }
  const sequence = Number(raw);
  return {
    orderSequence: Number.isFinite(sequence) ? Math.max(0, Math.trunc(sequence)) : 0,
    ...metaTimestamps(row),
  };
}

function metaTimestamps(row: Record<string, unknown>): Omit<Meta, 'orderSequence'> {
  return {
    lastPushAt: fromTimestamp(row['last_push_at']),
    lastPullAt: fromTimestamp(row['last_pull_at']),
    createdAt: fromTimestamp(row['created_at']),
  };
}

/** Meta -> meta row. */
export function metaToRow(meta: Meta): Record<string, unknown> {
  return {
    order_sequence: encodeValue('int', meta.orderSequence),
    last_push_at: toTimestamp(meta.lastPushAt),
    last_pull_at: toTimestamp(meta.lastPullAt),
    created_at: toTimestamp(meta.createdAt) ?? new Date().toISOString(),
  };
}

/**
 * Staff accounts.
 *
 * Deliberately NOT part of TABLE_SPECS: the Database snapshot is the shop's
 * business records, and the app's screens have no reason to hold a password hash
 * in memory. Accounts are read one at a time by the login route instead.
 */
export const USER_SPEC: TableMapping = {
  table: 'users',
  key: 'id',
  columns: [
    t('id', 'id'),
    t('name', 'name'),
    t('username', 'username'),
    t('password_hash', 'passwordHash'),
    t('role', 'role'),
    b('active', 'active'),
    ts('created_at', 'createdAt'),
    ts('updated_at', 'updatedAt'),
  ],
};
