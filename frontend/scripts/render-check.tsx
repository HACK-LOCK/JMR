/**
 * Renders every real screen to HTML and inspects the markup.
 *
 * Type checking and the API tests cannot catch the two things that actually
 * break a shop counter: a component that throws on the way to the screen, and
 * a <label for> that points at nothing (which silently breaks autofill and
 * screen readers). Both are checked here, for every screen, with real data in
 * the cache so the forms and lists are genuinely exercised rather than just
 * the loading state.
 *
 * App.tsx lazy-loads its pages behind Suspense, which cannot resolve while
 * rendering to a string, so the pages are driven directly here instead.
 *
 * Run with:  npm run check:render
 */
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { CUSTOMER_EXPORT_COLUMNS } from '@shared/domain';
import { AppProviders } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import { CustomerColumnBody } from '@/components/customer-column-sheet';
import { CustomerHistoryPanel } from '@/components/customer-history-panel';
import { useCustomerExportColumns } from '@/lib/customer-columns';

import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/toast';
import { clearStockUnlock, markStockUnlocked } from '@/lib/stock-access';
import Dashboard from '@/pages/Dashboard';
import NewBill from '@/pages/NewBill';
import Orders from '@/pages/Orders';
import OrderDetail from '@/pages/OrderDetail';
import BillHistory from '@/pages/BillHistory';
import Customers from '@/pages/Customers';
import CustomerDetail from '@/pages/CustomerDetail';
import SearchPage from '@/pages/SearchPage';
import StockDesktop from '@/pages/StockDesktop';
import PartDetailPage from '@/pages/PartDetailPage';

const STOCK_KEY = 'jmmr.stock-unlocked-at';
const HIDDEN_KEY = 'jmmr.dashboard-hidden';

/* ------------------------------------------------------------------ */
/* A browser just rich enough for the components to initialise        */
/* ------------------------------------------------------------------ */

function stubBrowser(): void {
  const store = new Map<string, string>([
    ['jmmr.auth.token', 'render-check-token'],
    [
      'jmmr.auth.user',
      JSON.stringify({ id: 'USR-1', name: 'Ashok Bhai', username: 'ashok', role: 'OWNER' }),
    ],
    // Already unlocked, so the stock screens render instead of the PIN gate.
    [STOCK_KEY, String(Date.now())],
  ]);

  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };

  const listeners = new Map<string, Set<() => void>>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = localStorage;
  g.window = {
    matchMedia: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
    addEventListener: (type: string, fn: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    location: { origin: 'http://localhost:4000', href: 'http://localhost:4000/' },
  };
  g.document = {
    documentElement: { classList: { toggle: () => undefined }, style: {} },
    querySelector: () => null,
  };
}

/* ------------------------------------------------------------------ */
/* Enough real data for the forms and lists to actually render         */
/* ------------------------------------------------------------------ */

const now = new Date();
const iso = (offsetDays: number, hour = 10): string => {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
};
const day = (offsetDays: number): string => iso(offsetDays).slice(0, 10);

const settings = {
  shopName: 'Jai Mataji Mobile Repairing',
  contact1Name: 'Ashok Bhai',
  contact1Number: '9876543210',
  contact2Name: '',
  contact2Number: '',
  address: 'Station Road',
  serviceDescription: 'Mobile Repair',
  upiId: 'jmmr@upi',
  receiptInformation: 'Save your bill',
  billFooter: 'Thank you',
  allowNegativeStock: false,
  sheetName: 'Shop',
  updatedAt: new Date().toISOString(),
};

const part = (n: number) => ({
  id: `PRT-${n}`,
  name: `Item ${n}`,
  category: 'Repair Part',
  brand: 'TestCo',
  model: `M${n}`,
  quantity: n === 1 ? 0 : n * 3,
  minQuantity: 2,
  purchaseCost: 100 * n,
  sellingPrice: 250 * n,
  supplierId: n === 1 ? '' : 'SUP-1',
  supplierName: n === 1 ? '' : 'Shreeji Parts',
  consumeMode: 'PART_USED',
  active: true,
  createdAt: iso(-30),
  updatedAt: iso(-1),
  low: n === 1,
  stockValue: 100 * n * n * 3,
  movements: [],
  openOrderLines: [],
});

const order = (n: number) => ({
  id: `JMR-000${n}`,
  customerId: 'CUS-1',
  customerName: `Customer ${n}`,
  mobile: '9876543210',
  deviceType: 'Smartphone',
  brand: 'Samsung',
  model: 'M30',
  complaint: 'Display not working',
  imei: '',
  deviceCondition: 'Working',
  accessories: 'Box',
  expectedDelivery: '',
  technician: '',
  notes: '',
  status: n % 3 === 0 ? 'Delivered' : n % 3 === 1 ? 'Received' : 'Ready',
  receivedAt: iso(0, 9 + n),
  deliveredAt: n % 3 === 0 ? iso(-1, 18) : null,
  estimatedAmount: 1200,
  finalAmount: 1200,
  discount: 0,
  payable: 1200,
  paidAmount: n % 3 === 0 ? 1200 : 400,
  balance: n % 3 === 0 ? 0 : 800,
  paymentStatus: n % 3 === 0 ? 'Paid' : 'Partially Paid',
  paymentMode: 'Cash',
  pendingSync: false,
  billDriveLink: '',
  lowStock: [],
  partsPending: n % 3 === 0 ? 0 : 1,
});

const orderDetail = {
  ...order(1),
  parts: [
    {
      id: 'OPL-1',
      partId: 'PRT-1',
      partName: 'Item 1',
      quantity: 1,
      unitPrice: 250,
      consumeMode: 'PART_USED',
      consumed: false,
      consumedAt: null,
    },
  ],
  payments: [
    { id: 'PAY-1', amount: 400, mode: 'Cash', date: iso(0, 11), user: 'Ashok Bhai', note: '' },
  ],
  history: [
    { id: 'H-1', fromStatus: '', toStatus: 'Received', at: iso(0, 9), user: 'Ashok Bhai' },
  ],
};

const supplier = (n: number) => ({
  id: `SUP-${n}`,
  name: `Supplier ${n}`,
  mobile: '9000000000',
  notes: '',
  itemCount: n,
  createdAt: iso(-60),
});

/** One row of the Bill History screen, in the shape the API sends. */
const billRow = (n: number) => ({
  id: `JMR-000${n}`,
  date: day(0),
  customerName: `Customer ${n}`,
  mobile: '9876543210',
  deviceType: 'Smartphone',
  brand: 'Samsung',
  model: 'M30',
  device: 'Samsung M30',
  complaint: 'Display not working',
  status: n % 2 === 0 ? 'Ready' : 'Delivered',
  paymentStatus: n % 2 === 0 ? 'Partially Paid' : 'Paid',
  paymentMode: 'Cash',
  finalAmount: 1200,
  discount: 0,
  total: 1200,
  advance: n % 2 === 0 ? 400 : 1200,
  balance: n % 2 === 0 ? 800 : 0,
  expectedDelivery: day(2),
  deliveredDate: n % 2 === 0 ? '' : day(0),
  technician: '',
  imei: '',
});

const customerRow = (n: number) => ({
  id: `CUS-${n}`,
  name: `Customer ${n}`,
  mobile: `98765432${String(n).padStart(2, '0')}`,
  altMobile: '',
  email: '',
  address: 'Station Road',
  repairCount: 3,
  lastRepairDate: day(0),
  totalBilled: 3600,
  balanceDue: n === 1 ? 800 : 0,
  addedDate: day(-90),
});

function seed(client: QueryClient): void {
  const set = (key: unknown[], data: unknown): void => {
    client.setQueryData(key, data);
  };
  set(['settings'], settings);
  set(['dashboard'], {
    todayRepairs: 3,
    onBench: 4,
    readyForPickup: 2,
    pendingPaymentCount: 6,
    pendingPaymentAmount: 8000,
    lowStock: 1,
    todayCollected: 4200,
    partsToConfirm: 1,
    recentOrders: [order(1), order(2), order(3)],
    readyOrders: [order(2)],
    lowStockItems: [part(1)],
  });
  set(['orders', { scope: 'all', q: '', limit: 300 }], [order(1), order(2), order(3)]);
  set(['orders', { scope: 'delivered', q: '', limit: 300 }], [order(3)]);
  set(['orders', { scope: 'active', q: '', limit: 300 }], [order(1), order(2)]);
  set(['orders', 'report', day(-29), day(0)], {
    from: day(-29),
    to: day(0),
    received: { count: 3, amount: 3600 },
    delivered: { count: 1, amount: 1200 },
    pending: { count: 2, amount: 1600 },
    collected: 2800,
  });
  set(['order', 'JMR-0001'], orderDetail);
  set(['order', 'next-id'], { id: 'JMR-0026' });
  set(['orders', 'history', day(0), day(0)], {
    from: day(0),
    to: day(0),
    count: 2,
    total: 2400,
    advance: 1600,
    balance: 800,
    bills: [billRow(1), billRow(2)],
  });
  set(['customers', 'history', ''], [customerRow(1), customerRow(2)]);
  set(['parts', '', false], [part(1), part(2), part(3)]);
  set(['parts', 'Item', false], [part(2)]);
  set(['part', 'PRT-1'], part(1));
  set(['parts', 'summary'], { items: 3, units: 12, value: 45000, low: 1, overStock: 0 });
  set(['suppliers'], [supplier(1), supplier(2)]);
  set(['search', 'cus', 'billing'], [
    {
      kind: 'order',
      id: 'JMR-0001',
      title: 'JMR-0001',
      subtitle: 'Customer 1',
      status: 'Received',
      amount: 1200,
      balance: 800,
    },
    {
      kind: 'customer',
      id: 'CUS-1',
      title: 'Customer 1',
      subtitle: '9876543210',
      status: '3 bills',
      amount: 0,
      balance: 0,
    },
  ]);
  set(['customers', ''], [
    { id: 'CUS-1', name: 'Customer 1', mobile: '9876543210', billCount: 3, totalSpent: 3600, outstanding: 800 },
  ]);
  set(['customer', 'CUS-1'], {
    id: 'CUS-1',
    name: 'Customer 1',
    mobile: '9876543210',
    notes: '',
    createdAt: iso(-90),
  });
  set(['customer', 'CUS-1', 'orders'], [order(1)]);
  set(['movements', { partId: 'PRT-1' }], []);
  set(['sync', 'status'], { mode: 'local', message: 'Local file', detail: 'shop-data.json', ok: true });
  set(['sync', 'datasets'], [
    { key: 'orders', label: 'Orders', tab: 'Sync', rows: 25 },
    { key: 'parts', label: 'Items', tab: 'Items', rows: 18 },
  ]);
  set(['users'], [
    { id: 'USR-1', name: 'Ashok Bhai', username: 'ashok', role: 'OWNER', active: true },
  ]);
}

/**
 * A brand new shop has no bills and no items, which is exactly what the owner
 * sees on day one. The empty screens are checked too, because an empty list is
 * where a stray .length or .map on a missing field blows up.
 */
function seedEmpty(client: QueryClient): void {
  const set = (key: unknown[], data: unknown): void => {
    client.setQueryData(key, data);
  };
  set(['dashboard'], {
    todayRepairs: 0,
    onBench: 0,
    readyForPickup: 0,
    pendingPaymentCount: 0,
    pendingPaymentAmount: 0,
    lowStock: 0,
    todayCollected: 0,
    partsToConfirm: 0,
    recentOrders: [],
    readyOrders: [],
    lowStockItems: [],
  });
  set(['orders', { scope: 'all', q: '', limit: 300 }], []);
  set(['orders', { scope: 'delivered', q: '', limit: 300 }], []);
  set(['orders', { scope: 'active', q: '', limit: 300 }], []);
  set(['orders', 'report', day(-29), day(0)], {
    from: day(-29),
    to: day(0),
    received: { count: 0, amount: 0 },
    delivered: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    collected: 0,
  });
  set(['parts', '', false], []);
  set(['parts', 'summary'], { items: 0, units: 0, value: 0, low: 0, overStock: 0 });
  set(['suppliers'], []);
  set(['customers', ''], []);
  set(['orders', 'history', day(0), day(0)], {
    from: day(0),
    to: day(0),
    count: 0,
    total: 0,
    advance: 0,
    balance: 0,
    bills: [],
  });
  set(['customers', 'history', ''], []);
  set(['search', '', 'billing'], []);
  set(['sync', 'datasets'], []);
}

/* ------------------------------------------------------------------ */
/* Markup checks - the problems a shop actually hit                    */
/* ------------------------------------------------------------------ */

interface Finding {
  kind: string;
  detail: string;
}

/** Phrases that must never appear anywhere in the billing area. */
const STOCK_PHRASES = [
  'Stock Value',
  'Low Stock',
  'Part Used',
  'Stock In',
  'Stock Out',
  'supplier',
  'Units',
];

function audit(route: string, html: string): Finding[] {
  const findings: Finding[] = [];
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  // 1. Every <label for> must point at a control that really exists.
  for (const match of html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)) {
    if (!ids.has(match[1])) {
      findings.push({
        kind: 'label-without-target',
        detail: `<label for="${match[1]}"> has no element with that id`,
      });
    }
  }

  // 2. Every form control needs an id or a name, or the browser cannot
  //    autofill it and clicking the label does nothing.
  for (const tag of html.match(/<(input|select|textarea)\b[^>]*>/g) ?? []) {
    if (/\stype="(hidden|submit|button)"/.test(tag)) continue;
    if (/\sid="/.test(tag) || /\sname="/.test(tag)) continue;
    const name = tag.match(/^<(\w+)/)?.[1] ?? 'input';
    const type = tag.match(/\stype="([^"]+)"/)?.[1] ?? 'text';
    findings.push({
      kind: 'control-without-id-or-name',
      detail: `<${name} type=${type}> has neither id nor name`,
    });
  }

  // 3. The billing area must never show stock numbers. Guards the main rule.
  const isStock = route.startsWith('/stock') || route.startsWith('/parts');
  if (!isStock) {
    for (const phrase of STOCK_PHRASES) {
      if (html.includes(phrase)) {
        findings.push({ kind: 'stock-leak-in-billing', detail: `billing screen shows "${phrase}"` });
      }
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Source checks - the parts a server render cannot reach              */
/* ------------------------------------------------------------------ */

/*
 * Radix renders dialogs through a portal, which produces nothing on the
 * server. Every form inside a Sheet - Add item, Add supplier, edit a bill,
 * pick an item - is therefore invisible to the render check above, and those
 * are exactly the forms where a field lost its label. So the source is checked
 * directly for the two things that matter there.
 */

const BILLING_SOURCES = [
  'Dashboard',
  'NewBill',
  'Orders',
  'OrderDetail',
  'BillHistory',
  'SearchPage',
  'Customers',
  'CustomerDetail',
];

/**
 * Stock-only things that must never be referenced from a billing screen.
 * Case sensitive on purpose, so a comment saying "that is stock information"
 * is not mistaken for the real thing.
 */
const STOCK_ONLY_IN_BILLING = [
  'supplierName',
  'supplierId',
  'consumeMode',
  'ConsumeBadge',
  'stockValue',
  'lowStockItems',
  'stockMovement',
  'StockMovement',
  'in stock',
  'Stock In',
  'Stock Out',
  'Low Stock',
];

function findSrcDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(dir, 'src', 'pages', 'Orders.tsx'))) return path.join(dir, 'src');
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not find frontend/src from ' + process.cwd());
}

/** True when the control at this position is the one child of a labelled Field. */
function insideLabelledField(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const opened = before.lastIndexOf('<Field');
  const closed = before.lastIndexOf('</Field>');
  if (opened === -1 || opened < closed) return false;
  const end = before.indexOf('>', opened);
  return end !== -1 && /htmlFor=/.test(before.slice(opened, end));
}

/** Returns how many check groups failed, so main() owns the failure count. */
function runSourceChecks(): number {
  const src = findSrcDir();
  let problems = 0;

  // 1. Billing screens must not reach for stock data, closed sheets included.
  const billingProblems: string[] = [];
  for (const name of BILLING_SOURCES) {
    const file = path.join(src, 'pages', `${name}.tsx`);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const token of STOCK_ONLY_IN_BILLING) {
      if (text.includes(token)) billingProblems.push(`${name}.tsx uses "${token}"`);
    }
  }
  if (billingProblems.length === 0) {
    console.log(`  ok    ${BILLING_SOURCES.length} billing screens reference no stock data`);
  } else {
    problems += 1;
    console.log('  FAIL  billing screens must not use stock data');
    for (const problem of billingProblems) console.log(`        ${problem}`);
  }

  // 2. The four dashboard sections must be the only hideable things there are.
  const dashFile = path.join(src, 'pages', 'Dashboard.tsx');
  const dashText = fs.readFileSync(dashFile, 'utf8');
  const hiddenProblems: string[] = [];
  for (const section of ['collection', 'bills', 'bench', 'due']) {
    if (!dashText.includes(`section="${section}"`)) {
      hiddenProblems.push(`Dashboard does not mark the "${section}" section`);
    }
  }
  if (hiddenProblems.length === 0) {
    console.log('  ok    the four dashboard sections are the hideable ones');
  } else {
    problems += 1;
    console.log('  FAIL  dashboard hide/unhide');
    for (const problem of hiddenProblems) console.log(`        ${problem}`);
  }

  // 3. The header menu replaces the sign out button, in the order asked for.
  const shellText = fs.readFileSync(path.join(src, 'components', 'app-shell.tsx'), 'utf8');
  const menuProblems: string[] = [];
  if (/Sign out|LogOut className="h-5 w-5" \/>/.test(shellText) && !/label="Logout"/.test(shellText)) {
    menuProblems.push('a bare sign out control is still in the shell');
  }
  if (!/label="Bill History"/.test(shellText)) menuProblems.push('the menu is missing Bill History');
  if (!/label="Customers"/.test(shellText)) menuProblems.push('the menu is missing Customers');
  if (/customer-history/.test(shellText)) {
    menuProblems.push('the menu still points at the removed Customer History page');
  }
  const [first, second, third] = ['label="Bill History"', 'label="Customers"', 'label="Logout"']
    .map((token) => shellText.indexOf(token));
  const ordered = first !== undefined && second !== undefined && third !== undefined
    && first < second && second < third;
  if (!ordered) {
    menuProblems.push('the menu order must be Bill History, Customers, Logout');
  }
  // The two three-dot menus are deliberately different controls, not one
  // control drawn twice. The header one takes over the whole screen so a stray
  // tap cannot reach the bill behind it. The sidebar one opens upward inside
  // the sidebar column, because a panel floating in the middle of the screen is
  // what made this look broken.
  if (!/<HeaderMenu onSignOut=\{handleSignOut\} \/>/.test(shellText)) {
    menuProblems.push('the header three-dot menu is missing');
  }
  if (!/<SidebarFooter[\s\S]*?onSignOut=\{handleSignOut\}[\s\S]*?\/>/.test(shellText)) {
    menuProblems.push('the sidebar three-dot menu is missing');
  }
  if (!/function HeaderMenu[\s\S]*?<Sheet/.test(shellText)) {
    menuProblems.push('the header menu must open the shared full screen modal so it blocks the app behind it');
  }
  if (!/'absolute z-50 mb-2/.test(shellText)) {
    menuProblems.push('the sidebar panel must be anchored to the sidebar footer, not floated over the screen');
  }
  if (!/bottom-full left-0 right-0/.test(shellText)) {
    menuProblems.push('an open sidebar needs a panel exactly as wide as the sidebar itself');
  }
  if (!/bottom-full left-full ml-2 w-56/.test(shellText)) {
    menuProblems.push('a collapsed sidebar has no room for labels, so its panel must open beside the column');
  }
  if (!/pointerdown/.test(shellText)) {
    menuProblems.push('the sidebar panel must close when you tap outside it');
  }
  if (menuProblems.length === 0) {
    console.log('  ok    header menu blocks the screen, sidebar menu opens inside the sidebar, order kept');
  } else {
    problems += 1;
    console.log('  FAIL  header menu');
    for (const problem of menuProblems) console.log(`        ${problem}`);
  }

  // 3c. The sidebar carries the JMR mark only - never the long shop name, and
  //     never the old two-letter "JM" - and it still folds away.
  const logoProblems: string[] = [];
  if (!/const LOGO = 'JMR'/.test(shellText)) {
    logoProblems.push('the sidebar needs one JMR mark shared by the open and closed states');
  }
  if (/>JM</.test(shellText)) logoProblems.push('the sidebar still says JM somewhere');
  // The brand block must read the mark, not the settings shop name.
  const brandBlock = /<div className=\{cn\('border-b p-4'[\s\S]*?<\/div>\n\n        \{!collapsed/.exec(shellText);
  if (brandBlock && /\{shopName\}/.test(brandBlock[0])) {
    logoProblems.push('the sidebar shows the full shop name instead of the JMR mark');
  }
  if (!/setCollapsed/.test(shellText)) {
    logoProblems.push('the sidebar lost its open/close control');
  }
  if (logoProblems.length === 0) {
    console.log('  ok    the sidebar shows the JMR mark only, and still folds away');
  } else {
    problems += 1;
    console.log('  FAIL  sidebar logo');
    for (const problem of logoProblems) console.log(`        ${problem}`);
  }

  // 3b. The phone bottom bar has no "More" button, and the Customers list with
  //     its history popup lives in one place only.
  const customerProblems: string[] = [];
  if (/>\s*More\s*</.test(shellText)) customerProblems.push('the phone bottom bar still has a More button');
  if (/setMoreOpen/.test(shellText)) customerProblems.push('the removed More sheet still has state behind it');
  if (fs.existsSync(path.join(src, 'pages', 'CustomerHistory.tsx'))) {
    customerProblems.push('the separate CustomerHistory page is still here');
  }
  const customersText = fs.readFileSync(path.join(src, 'pages', 'Customers.tsx'), 'utf8');
  if (!customersText.includes('CustomerHistoryPanel')) {
    customerProblems.push('the Customers list does not open the customer history popup');
  }
  if (!customersText.includes('history.${format}')) {
    customerProblems.push('the Customers list lost its spreadsheet and PDF downloads');
  }
  if (!customersText.includes('useCustomerExportColumns')) {
    customerProblems.push('the Customers list no longer asks which columns to download');
  }
  if (!customersText.includes('cols=${columns.query}')) {
    customerProblems.push('the chosen columns are not sent with the download');
  }
  if (customerProblems.length === 0) {
    console.log('  ok    customers and their history are one page, with no More button on the bottom bar');
  } else {
    problems += 1;
    console.log('  FAIL  customer screen layout');
    for (const problem of customerProblems) console.log(`        ${problem}`);
  }

  // 3d. The status sheet offers exactly the counter shortlist: device in, being
  //     repaired, handed back, or called off. The long bench list must not creep
  //     back in.
  const statusProblems: string[] = [];
  const domainText = fs.readFileSync(
    path.join(src, '..', '..', 'shared', 'domain.ts'),
    'utf8',
  );
  const counterList = /export const COUNTER_STATUSES = \[([\s\S]*?)\] as const/.exec(domainText);
  if (!counterList) {
    statusProblems.push('the shared domain has no COUNTER_STATUSES list for the counter to set');
  } else {
    const offered = ((counterList[1] ?? '').match(/'([^']+)'/g) ?? []).map((q) => q.replace(/'/g, ''));
    const wanted = ['Received', 'Repairing', 'Delivered', 'Cancelled'];
    if (offered.join('|') !== wanted.join('|')) {
      statusProblems.push(`the status sheet must offer only ${wanted.join(', ')} (found ${offered.join(', ')})`);
    }
  }
  const detailText = fs.readFileSync(path.join(src, 'pages', 'OrderDetail.tsx'), 'utf8');
  if (!/COUNTER_STATUSES\.map/.test(detailText)) {
    statusProblems.push('the status sheet is not driven by COUNTER_STATUSES');
  }
  if (/ORDER_STATUSES\.map/.test(detailText)) {
    statusProblems.push('the status sheet is back to offering every status');
  }
  if (statusProblems.length === 0) {
    console.log('  ok    the status sheet offers only Received, Repairing, Delivered, Cancelled');
  } else {
    problems += 1;
    console.log('  FAIL  status sheet options');
    for (const problem of statusProblems) console.log(`        ${problem}`);
  }

  // 4. The collapsed sidebar is 76px wide and holds three 48px controls, so
  //    they have to stack there. Laid out in a row they push out of the column.
  const shellFooter = ((): string => {
    const text = fs.readFileSync(path.join(src, 'components', 'app-shell.tsx'), 'utf8');
    const at = text.indexOf('aria-label={collapsed ?');
    return at === -1 ? '' : text.slice(Math.max(0, at - 900), at);
  })();
  const footerProblems: string[] = [];
  if (!shellFooter.includes('flex-col')) {
    footerProblems.push('the sidebar controls do not stack when the menu is collapsed');
  }
  if (/hidden[^"']*md:inline-flex/.test(shellFooter)) {
    footerProblems.push('a control inside the already-hidden sidebar sets its own breakpoint');
  }
  if (footerProblems.length === 0) {
    console.log('  ok    the collapsed sidebar stacks its controls instead of overflowing');
  } else {
    problems += 1;
    console.log('  FAIL  collapsed sidebar layout');
    for (const problem of footerProblems) console.log(`        ${problem}`);
  }

  // 5. Every control needs an id, a name or a label - including inside sheets.
  const unlabelled: string[] = [];
  const tagPattern = /<(Input|Textarea|Select)\b(?:[^<>]|\{[^{}]*\})*?\/>/g;
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.tsx')) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const match of text.matchAll(tagPattern)) {
        const tag = match[0];
        if (/\bid=/.test(tag) || /\bname=/.test(tag) || /aria-label/.test(tag)) continue;
        // A Field hands its child the id at runtime, so that one is fine.
        if (insideLabelledField(text, match.index ?? 0)) continue;
        const line = text.slice(0, match.index ?? 0).split('\n').length;
        unlabelled.push(`${path.relative(src, full)}:${line} <${match[1]}>`);
      }
    }
  };
  walk(src);

  if (unlabelled.length === 0) {
    console.log('  ok    every input, textarea and select has an id, a name or a label');
  } else {
    problems += 1;
    console.log('  FAIL  controls with no id, name or label');
    for (const item of unlabelled) console.log(`        ${item}`);
  }

  if (problems > 0) return 1;
  return 0;
}

/* ------------------------------------------------------------------ */

const SCREENS: { path: string; name: string; Page: () => JSX.Element }[] = [
  { path: '/', name: 'Billing home', Page: Dashboard },
  { path: '/new', name: 'New bill', Page: NewBill },
  { path: '/orders', name: 'All bills / orders', Page: Orders },
  { path: '/orders?scope=delivered', name: 'All bills (delivered)', Page: Orders },
  { path: '/orders/JMR-0001', name: 'Bill detail', Page: OrderDetail },
  { path: '/orders/JMR-0001?new=1', name: 'Bill detail (edit open)', Page: OrderDetail },
  { path: '/bill-history', name: 'Bill history', Page: BillHistory },
  { path: '/customers', name: 'Customers', Page: Customers },
  { path: '/customers/CUS-1', name: 'Customer detail', Page: CustomerDetail },
  { path: '/search', name: 'Search order', Page: SearchPage },
  { path: '/stock', name: 'Stock desktop', Page: StockDesktop },
  { path: '/stock?tab=low', name: 'Stock - low items', Page: StockDesktop },
  { path: '/stock?tab=in', name: 'Stock - stock in', Page: StockDesktop },
  { path: '/stock?tab=out', name: 'Stock - stock out', Page: StockDesktop },
  { path: '/stock?tab=suppliers', name: 'Stock - suppliers', Page: StockDesktop },
  { path: '/stock?tab=sync', name: 'Stock - sheet sync', Page: StockDesktop },
  { path: '/stock?tab=settings', name: 'Stock - settings', Page: StockDesktop },
  { path: '/parts/PRT-1', name: 'Item history', Page: PartDetailPage },
];

/**
 * The field/label pair, checked directly. Sheets only render when open, so
 * this is what proves the labels inside them are wired up.
 */
const CONTROLS: { name: string; node: ReactNode }[] = [
  { name: 'Field + Input', node: <Field label="Item Name" htmlFor="f-input"><Input /></Field> },
  { name: 'Field + Textarea', node: <Field label="Notes" htmlFor="f-area"><Textarea /></Field> },
  {
    name: 'Field + Select',
    node: (
      <Field label="Category" htmlFor="f-select">
        <Select value="a" onValueChange={() => undefined} options={[{ value: 'a', label: 'A' }]} />
      </Field>
    ),
  },
  {
    name: 'Field + Select (caller set its own id)',
    node: (
      <Field label="Brand" htmlFor="ignored-because-keep">
        <Select id="real-id" value="a" onValueChange={() => undefined} options={[{ value: 'a', label: 'A' }]} />
      </Field>
    ),
  },
  { name: 'Field + no htmlFor', node: <Field label="Free text"><Input name="free" /></Field> },
];

/**
 * React shouts about useLayoutEffect on every server render, which is noise
 * here and would bury the findings. Anything else it complains about is real
 * and is allowed through.
 */
function quietRender(node: ReactNode): string {
  const original = console.error;
  console.error = (...args: unknown[]): void => {
    const first = String(args[0] ?? '');
    if (first.includes('useLayoutEffect')) return;
    original(...(args as []));
  };
  try {
    return renderToStaticMarkup(node);
  } finally {
    console.error = original;
  }
}

function renderScreen(client: QueryClient, path: string, Page: () => JSX.Element): string {
  return quietRender(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AppProviders>
          <ThemeProvider>
            <ToastProvider>
              {/* Innermost provider wins, so the seeded cache is the one used. */}
              <QueryClientProvider client={client}>
                <AppShell>
                  <Page />
                </AppShell>
              </QueryClientProvider>
            </ToastProvider>
          </ThemeProvider>
        </AppProviders>
      </MemoryRouter>
    </StrictMode>,
  );
}

function main(): void {
  stubBrowser();

  let failures = 0;
  let screens = 0;
  let emptyChecks = 0;

  console.log('\n--- screens ---');
  for (const screen of SCREENS) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    seed(client);

    let html = '';
    try {
      html = renderScreen(client, screen.path, screen.Page);
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  ${screen.name} (${screen.path}) - threw while rendering`);
      console.log(`        ${(error as Error).message.split('\n')[0]}`);
      continue;
    }

    screens += 1;
    const findings = audit(screen.path, html);    if (findings.length === 0) {
      console.log(`  ok    ${screen.name} (${screen.path}) - ${Math.round(html.length / 1024)}kb`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${screen.name} (${screen.path})`);
      for (const finding of findings) console.log(`        ${finding.kind}: ${finding.detail}`);
    }
  }

  console.log('\n--- empty shop (day one) ---');
  for (const screen of [
    { path: '/', name: 'Billing home', Page: Dashboard },
    { path: '/orders', name: 'All bills / orders', Page: Orders },
    { path: '/bill-history', name: 'Bill history', Page: BillHistory },
    { path: '/customers', name: 'Customers', Page: Customers },
      { path: '/search', name: 'Search order', Page: SearchPage },
    { path: '/stock', name: 'Stock desktop', Page: StockDesktop },
  ]) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    seed(client);
    seedEmpty(client);

    let html = '';
    try {
      html = renderScreen(client, screen.path, screen.Page);
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  ${screen.name} - threw while rendering with no data`);
      console.log(`        ${(error as Error).message.split('\n')[0]}`);
      continue;
    }
    const findings = audit(screen.path, html);
    if (findings.length === 0) {
      emptyChecks += 1;
      console.log(`  ok    ${screen.name} with no bills and no items`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${screen.name} with no data`);
      for (const finding of findings) console.log(`        ${finding.kind}: ${finding.detail}`);
    }
  }

  // The customer popup lives in a portal, so no screen render above can see it.
  // Rendered on its own here, with a real customer and a real bill, so a broken
  // .map inside the popup cannot slip through.
  console.log('\n--- customer history popup ---');
  {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    seed(client);
    let html = '';
    try {
      html = renderScreen(client, '/customers/CUS-1', () => <CustomerHistoryPanel id="CUS-1" />);
    } catch (error) {
      failures += 1;
      console.log('  FAIL  Customer history popup - threw while rendering');
      console.log(`        ${(error as Error).message.split('\n')[0]}`);
    }
    if (html) {
      const missing = ['Customer Details', 'Bill History', 'JMR-0001', 'Call 9876543210'].filter(
        (text) => !html.includes(text),
      );
      if (missing.length === 0) {
        console.log('  ok    the customer popup shows the details and the bills together');
      } else {
        failures += 1;
        console.log('  FAIL  the customer popup is missing part of its content');
        for (const text of missing) console.log(`        missing: ${text}`);
      }
    }
  }

  // The column picker lives in a portal and only exists after a tap, so it is
  // rendered open here. The interesting case is a saved two column choice: the
  // sheet has to show the other eight as unticked rather than quietly ticking
  // everything, which is what would let a file grow columns nobody chose.
  console.log('\n--- the download column picker ---');
  {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    seed(client);
    localStorage.setItem('jmmr.customer-export-columns', JSON.stringify(['name', 'mobile']));

    let html = '';
    try {
      html = renderScreen(client, '/customers', () => {
        const choice = useCustomerExportColumns();
        return <CustomerColumnBody choice={choice} rowCount={12} onDone={() => undefined} />;
      });
    } catch (error) {
      failures += 1;
      console.log('  FAIL  the column picker - threw while rendering');
      console.log(`        ${(error as Error).message.split('\n')[0]}`);
    }
    if (html) {
      const headingProblems: string[] = [];
      for (const column of CUSTOMER_EXPORT_COLUMNS) {
        if (!html.includes(column.header)) headingProblems.push(`the picker is missing ${column.header}`);
      }
      if (!/2 of 10 columns/.test(html)) {
        headingProblems.push('the picker does not say how many columns are ticked');
      }
      if (audit('/customers', html).length > 0) {
        for (const finding of audit('/customers', html)) headingProblems.push(`${finding.kind}: ${finding.detail}`);
      }
      if (headingProblems.length === 0) {
        console.log('  ok    the picker offers every customer column and counts the ticked two');
      } else {
        failures += 1;
        console.log('  FAIL  the column picker');
        for (const problem of headingProblems) console.log(`        ${problem}`);
      }

      // The two that were saved must read as ticked and the other eight as not,
      // which is read straight off the aria-checked the tick boxes carry.
      const checked = [...html.matchAll(/aria-checked="(true|false)"[^>]*aria-label="([^"]+)"/g)].map(
        (match) => `${match[2]}:${match[1]}`,
      );
      const shouldBeOn = ['Customer Name', 'Mobile Number'];
      const rightTick = shouldBeOn.every((name) => checked.includes(`${name}:true`));
      const wrongTick = CUSTOMER_EXPORT_COLUMNS.filter(
        (column) => !shouldBeOn.includes(column.header) && checked.includes(`${column.header}:true`),
      );
      if (checked.length === CUSTOMER_EXPORT_COLUMNS.length && rightTick && wrongTick.length === 0) {
        console.log('  ok    exactly the saved two columns are ticked, and the other eight are not');
      } else {
        failures += 1;
        console.log('  FAIL  the picker ticks the wrong columns');
        console.log(`        found: ${checked.join(', ')}`);
        for (const column of wrongTick) console.log(`        ticked but should not be: ${column.header}`);
      }
    }
    localStorage.removeItem('jmmr.customer-export-columns');
  }

  // Both three-dot controls are on screen at once on a desktop, and neither may
  // be open before it is tapped. The panel only exists after a tap, so its
  // absence here is what proves nothing leaks open by default.
  console.log('\n--- the two three-dot menus ---');
  {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    seed(client);
    let html = '';
    try {
      html = renderScreen(client, '/', () => <Dashboard />);
    } catch (error) {
      failures += 1;
      console.log('  FAIL  the shell - threw while rendering');
      console.log(`        ${(error as Error).message.split('\n')[0]}`);
    }
    if (html) {
      const triggers = html.match(/aria-haspopup="menu"/g) ?? [];
      const problems: string[] = [];
      if (triggers.length !== 2) {
        problems.push(
          `expected one three-dot control in the header and one in the sidebar, found ${triggers.length}`,
        );
      }
      if (html.includes('role="menu"')) {
        problems.push('a menu panel is already open before anything was tapped');
      }
      if (problems.length === 0) {
        console.log('  ok    the header and sidebar each have one three-dot control, both closed');
      } else {
        failures += 1;
        console.log('  FAIL  the two three-dot menus');
        for (const problem of problems) console.log(`        ${problem}`);
      }
    }
  }

  // With everything put away, the two actions have to be the only thing left,
  // and the four figures must actually be gone. This is the behaviour the
  // owner feels, so it is checked on the markup rather than in the source.
  console.log('\n--- dashboard hidden state ---');
  {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    seed(client);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(['collection', 'bills', 'bench', 'due']));

    let html = '';
    try {
      html = renderScreen(client, '/', Dashboard);
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  Billing home with all four sections hidden - threw while rendering`);
      console.log(`        ${(error as Error).message.split('\n')[0]}`);
    }
    if (html) {
      // The figures themselves must be gone. Their names stay as a short note,
      // so the space is not a hole and the owner knows what is put away.
      const figures = ['₹4,200', '₹8,000'].filter((value) => html.includes(value));
      const notes = (html.match(/is hidden\. Tap to bring it back\./g) ?? []).length;
      // Each note has to be a real control, or the text asks for an eye that
      // is not there and the section can only be brought back from the menu.
      const unhideButtons = (html.match(/aria-label="Show [^"]+"/g) ?? []).length;
      const kept = ['New Bill', 'Search Order'].filter((label) => !html.includes(label));
      if (figures.length === 0 && notes === 4 && unhideButtons === 4 && kept.length === 0) {
        console.log('  ok    all four figures hidden, each note is a working button, actions kept');
      } else {
        failures += 1;
        console.log('  FAIL  hidden dashboard must drop the figures and keep the two quick actions');
        for (const value of figures) console.log(`        still showing the figure: ${value}`);
        if (notes !== 4) console.log(`        expected 4 hidden-section notes, found ${notes}`);
        if (unhideButtons !== 4) console.log(`        expected 4 "Show ..." buttons, found ${unhideButtons}`);
        for (const label of kept) console.log(`        missing: ${label}`);
      }
    }
    localStorage.removeItem(HIDDEN_KEY);
  }

  // The PIN gate is the whole point of the split, so check it both ways: a  // locked tab must show nothing from the stock area, and a valid stored
  // unlock must survive a reload instead of asking again.
  console.log('\n--- stock PIN gate ---');
  const renderStock = (): string => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    seed(client);
    return renderScreen(client, '/stock', StockDesktop);
  };
  const PROMPT = 'Enter the stock PIN to open items and suppliers.';

  clearStockUnlock();
  const locked = renderStock();
  if (locked.includes(PROMPT) && !locked.includes('Stock In')) {
    console.log('  ok    locked stock shows only the PIN gate');
  } else {
    failures += 1;
    console.log('  FAIL  locked stock must show the PIN gate and nothing from the stock area');
  }

  markStockUnlocked();
  const reopened = renderStock();
  if (!reopened.includes(PROMPT) && reopened.includes('Stock In')) {
    console.log('  ok    a valid stored unlock opens stock straight after a reload');
  } else {
    failures += 1;
    console.log('  FAIL  a valid stored unlock must open the stock desktop after a reload');
  }

  console.log('\n--- source checks (covering what a server render cannot see) ---');
  failures += runSourceChecks();

  console.log('\n--- field / label wiring ---');
  for (const control of CONTROLS) {
    let html = '';
    try {
      html = quietRender(
        <MemoryRouter>
          <ThemeProvider>
            <ToastProvider>{control.node}</ToastProvider>
          </ThemeProvider>
        </MemoryRouter>,
      );
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  ${control.name} - threw while rendering`);
      console.log(`        ${(error as Error).message.split('\n')[0]}`);
      continue;
    }
    const findings = audit('component', html);
    if (findings.length === 0) {
      console.log(`  ok    ${control.name}`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${control.name}`);
      for (const finding of findings) console.log(`        ${finding.kind}: ${finding.detail}`);
    }
  }

  console.log(
    failures === 0
      ? `\nALL SCREENS RENDER CLEANLY: ${screens} screens with data, ${emptyChecks} with no data, ${CONTROLS.length} control cases, 0 findings\n`
      : `\n${failures} CHECK GROUP(S) WITH FINDINGS\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
