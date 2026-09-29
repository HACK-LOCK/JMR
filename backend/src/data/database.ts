import type {
  Customer,
  OrderPart,
  Payment,
  Part,
  RepairOrder,
  ShopSettings,
  StatusHistory,
  StockMovement,
  Supplier,
} from '../../../shared/domain';

/**
 * The whole shop database, held in memory and persisted by a Store adapter.
 * Business logic never talks to Google directly - it only sees this shape.
 */
export interface Database {
  settings: ShopSettings;
  customers: Customer[];
  orders: RepairOrder[];
  payments: Payment[];
  parts: Part[];
  orderParts: OrderPart[];
  stockMovements: StockMovement[];
  suppliers: Supplier[];
  statusHistory: StatusHistory[];
  meta: Meta;
}

export interface Meta {
  /**
   * The highest bill number handed out so far, as one plain number.
   *
   * A single global counter: 0 before the first bill, so the first bill is
   * JMR-0001, and it never restarts on a new day or a new year.
   */
  orderSequence: number;
  lastPushAt: string;
  lastPullAt: string;
  createdAt: string;
}

export const DEFAULT_SETTINGS: Omit<ShopSettings, 'updatedAt'> = {
  shopName: 'Jai Mataji Mobile Repairing',
  contact1Name: 'Ashok Bhai',
  contact1Number: '9974298866',
  contact2Name: 'Mitesh',
  contact2Number: '9327394978',
  address: 'M. Tower Chowk, Opposite Market Yard, Modasa Road, Talod',
  serviceDescription:
    'We accept mobile phones from every company and provide mobile phone, computer, and electronic-device repair services.',
  upiId: '',
  receiptInformation: 'Device not collected within 90 days may be disposed off.',
  billFooter: 'Thank you! Visit again.',
  allowNegativeStock: false,
  sheetName: 'ShopData',
};

export function emptyDatabase(): Database {
  const now = new Date().toISOString();
  return {
    settings: { ...DEFAULT_SETTINGS, updatedAt: now },
    customers: [],
    orders: [],
    payments: [],
    parts: [],
    orderParts: [],
    stockMovements: [],
    suppliers: [],
    statusHistory: [],
    meta: { orderSequence: 0, lastPushAt: '', lastPullAt: '', createdAt: now },
  };
}

export function isEmptyDatabase(db: Database): boolean {
  return db.orders.length === 0 && db.customers.length === 0 && db.parts.length === 0 && db.suppliers.length === 0;
}
