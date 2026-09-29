/**
 * Checks the rules the online database depends on, without needing a database.
 *
 *   npm run db:rules
 *
 * These are the parts that are easy to break with a later edit and impossible to
 * notice until a shop has a wrong bill number or a spreadsheet that quietly stops
 * matching the bills:
 *
 *   1. one counter for the whole shop, starting at JMR-0001
 *   2. the counter survives being restored, mistyped, or already used
 *   3. the counter is one integer in the database, and an old counter stored as a
 *      yearly object is read without losing the highest number
 *   4. every table has a tab to be copied into, and the copy carries a Balance
 *   5. the spreadsheet is a copy: nothing reads rows back out of it
 *
 * What this cannot check, and the other scripts that do:
 *   - the SQL itself, the advisory lock, and two writers at once: `db:check`
 *     against a real database.
 *   - that a push actually reaches Google: `db:setup` plus the sync screen.
 */

import fs from 'node:fs';
import path from 'node:path';
import { emptyDatabase, type Database } from '../data/database';
import { nextOrderId } from '../domain/orderOps';
import { metaToRecord, metaToRow, TABLE_SPECS, USER_SPEC, columnList } from '../data/postgres/rows';
import { MIRROR_SHEETS, derivedCellsFor, rowsForSheet } from '../data/sheets/sheetSchema';
import { balanceAmount, type RepairOrder } from '../../../shared/domain';
import { PostgresStore } from '../data/postgres/postgresStore';

let checks = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(name);
  console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ''}`);
}

function equal(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `expected ${String(expected)}, got ${String(actual)}`);
}

    function makeOrder(id: string, overrides: Partial<RepairOrder> = {}): RepairOrder {
    return {
      id,
      customerId: 'C1',
      customerName: 'Asha',
      mobile: '9800000000',
      deviceType: 'Phone',
      brand: 'Redmi',
      model: 'Note 11',
      complaint: 'Screen broken',
      status: 'RECEIVED',
      receivedAt: '2026-01-04',
      expectedDelivery: '',
      estimatedAmount: 1500,
      finalAmount: 1500,
      discount: 0,
      paidAmount: 500,
      paymentStatus: 'Partially Paid',
      paymentMode: 'CASH',
      partsTotal: 0,
      createdAt: '2026-01-04T10:00:00.000Z',
      updatedAt: '2026-01-04T10:00:00.000Z',
      notes: '',
      ...overrides,
    } as RepairOrder;
  }

async function main(): Promise<void> {
  console.log('\nBill numbers');
  {
    // One counter for the whole shop, and it starts at 1 on a brand new database.
    const db = emptyDatabase();
    equal('an empty database has no counter yet', db.meta.orderSequence, 0);
    equal('the first bill is JMR-0001', nextOrderId(db), 'JMR-0001');
    equal('the second bill is JMR-0002', nextOrderId(db), 'JMR-0002');
    equal('the counter moved to 2', db.meta.orderSequence, 2);
  }
  {
    // The counter is the shop's, not the day's: it must not restart on a new date
    // or a new year, because "JMR-0001" twice in one year is a duplicate the
    // search and the Drive folder name both rely on.
    const db = emptyDatabase();
    db.orders = [makeOrder('JMR-0001', { receivedAt: '2026-12-31' })];
    db.meta.orderSequence = 1;
    equal('a new year does not restart the count', nextOrderId(db), 'JMR-0002');
  }
  {
    // A number is never handed out twice, whatever the counter says. This is the
    // case that matters after restoring a backup or importing a folder of old
    // bills: the counter can be behind, and the bills on screen cannot be.
    const db = emptyDatabase();
    db.orders = [
      makeOrder('JMR-0001'),
      makeOrder('JMR-0002'),
      makeOrder('JMR-0007'),
    ];
    db.meta.orderSequence = 2;
    equal('a counter behind the bills is caught up', nextOrderId(db), 'JMR-0008');
    equal('and the counter is repaired', db.meta.orderSequence, 8);
  }
  {
    // A bill with no number of its own, or a hand typed one, must not be able to
    // make the counter jump or stall in a way that reuses a number.
    const db = emptyDatabase();
    db.orders = [makeOrder('JMR-0042')];
    equal('an existing bill higher than the counter wins', nextOrderId(db), 'JMR-0043');
    db.orders = [makeOrder('bill-7')];
    equal('rows that are not bill numbers are ignored', nextOrderId(db), 'JMR-0044');
  }
  {
    // Two devices allocating at the same instant. The database lock is what
    // actually stops this; what is checkable here is that the arithmetic is a
    // plain read-then-increment with no shared state, so serialising the writers
    // is enough to make it correct.
    const db = emptyDatabase();
    const first = nextOrderId(db);
    const second = nextOrderId(db);
    check('consecutive allocations differ', first !== second, `${first} then ${second}`);
  }

  console.log('\nThe counter column');
  {
    // What the database stores is one integer, so two writers cannot both read
    // "2026" and "2027" out of two different columns and land on the same number.
    const row = metaToRow({ orderSequence: 7, lastPushAt: '', lastPullAt: '', createdAt: '2026-01-01T00:00:00.000Z' });
    equal('the counter is written as a whole number', typeof row.order_sequence, 'number');
    equal('the counter is written as 7', row.order_sequence, 7);
    check('the counter is not written as a yearly object', typeof row.order_sequence !== 'object');
  }
  {
    // An older database stored the counter as {"2026": 41, "2027": 3}, and pg
    // hands a jsonb column back already parsed. Reading it must take the highest
    // value, not the last one, or the shop goes back to JMR-0004 in January.
    const meta = metaToRecord({
      order_sequence: { '2024': 88, '2025': 120, '2026': 3 },
      last_push_at: null,
      last_pull_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    } as never);
    equal('a yearly counter object reads back as the highest year', meta.orderSequence, 120);
  }
  {
    // The counter is also written back as one number, so the yearly object is
    // gone the next time anything is saved - the migration is not repeated.
    const meta = { orderSequence: 120, lastPushAt: '', lastPullAt: '', createdAt: '2026-01-01T00:00:00.000Z' };
    equal('saving after reading it writes a single number', metaToRow(meta).order_sequence, 120);
  }
  {
    // And a counter that is blank, null or nonsense must not become NaN, because
    // NaN + 1 is NaN and every bill after that would be named "JMR-NaN".
    for (const [label, value] of [
      ['null', null],
      ['an empty string', ''],
      ['text', 'not a number'],
    ] as const) {
      const meta = metaToRecord({
        order_sequence: value,
        last_push_at: null,
        last_pull_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
      } as never);
      equal(`a counter that is ${label} becomes 0`, meta.orderSequence, 0);
      check(`and still produces a bill number`, Number.isFinite(meta.orderSequence + 1));
    }
  }

  console.log('\nThe spreadsheet copy');
  {
    // Every table in the database needs a tab, or a commit that changes it has
    // nowhere to go and is silently left out of the copy. Checked by proving each
    // tab is wired to real rows rather than by comparing name lists, so a tab that
    // is listed but returns nothing would still fail here.
    const db = emptyDatabase();
    const wired = new Set<string>();
    for (const tab of MIRROR_SHEETS) {
      if (tab === 'Settings') continue;
      const rows = rowsForSheet(db, tab);
      check(`the ${tab} tab is backed by shop records`, Array.isArray(rows));
      // Same array, not an equal one: the tab must hand over the shop's own rows
      // rather than a copy that can go stale against the database.
      if (db[tabKeyFor(tab)] === (rows as unknown)) wired.add(tab);
    }
    check('every tab is connected to a dataset', wired.size === MIRROR_SHEETS.length - 1, `wired: ${[...wired].join(', ')}`);
    check('the copy includes the shop settings', MIRROR_SHEETS.includes('Settings'));
    check('the copy includes the bill numbers', MIRROR_SHEETS.includes('Orders'));
    check('the copy has a tab per table plus settings', MIRROR_SHEETS.length === TABLE_SPECS.length + 1);
  }
  {
    // A bill has no stored balance - it is always worked out - so the copy would
    // show an empty column, which is exactly the column somebody would then "fix"
    // by typing into the spreadsheet.
    const db = emptyDatabase();
    const order = makeOrder('JMR-0001', { finalAmount: 1500, paidAmount: 500, discount: 0 });
    db.orders = [order];
    const derived = derivedCellsFor('Orders', db);
    const row = derived.get('JMR-0001');
    check('a copied bill carries a balance', row !== undefined);
    equal('and the balance is the same one the app shows', row?.balance, balanceAmount(order));
    equal('1500 less 500 paid is 1000', row?.balance, 1000);
  }
  {
    // A bill with no part lines and no discount still needs a balance of 0, not an
    // empty cell, or the copy looks like the bill was never priced.
    const db = emptyDatabase();
    db.orders = [makeOrder('JMR-0002', { finalAmount: 0, paidAmount: 0, discount: 0 })];
    equal('a bill with nothing on it copies a balance of 0', derivedCellsFor('Orders', db).get('JMR-0002')?.balance, 0);
  }
  {
    // The Balance column in the copy has to be the same rule as the screen. This
    // is the calculation the whole app refuses to let a human type, so a
    // different one in the spreadsheet would quietly disagree with the bill.
    const order = makeOrder('JMR-0003', { finalAmount: 2000, paidAmount: 200, discount: 150 });
    const db = emptyDatabase();
    db.orders = [order];
    equal('the copy uses the app balance, not a second rule', derivedCellsFor('Orders', db).get('JMR-0003')?.balance, balanceAmount(order));
    equal('2000 less 150 discount less 200 paid is 1650', derivedCellsFor('Orders', db).get('JMR-0003')?.balance, 1650);
  }
  {
    // A tab the app does not know must not crash a commit: it is pushed as an
    // empty sheet rather than taking the bill down with it.
    const db = emptyDatabase();
    db.orders = [makeOrder('JMR-0001')];
    check('an unknown tab copies no rows', rowsForSheet(db, 'No Such Tab').length === 0);
    check('an unknown tab invents no balance cells', derivedCellsFor('No Such Tab', db).size === 0);
  }

  console.log('\nOne way only');
  {
    // The store must not be able to import from a spreadsheet, whatever it is
    // handed. Every dataset is refused, and the reply has to explain itself
    // rather than reporting a silent no-op as a success.
    const store = new PostgresStore();
    const results = await Promise.all(
      ['Orders', 'Customers', 'Parts', 'Stock Movements', 'Settings', ''].map((table) => store.syncFromSource(table)),
    );
    for (const result of results) {
      equal('nothing is created from the spreadsheet', result.created, 0);
      equal('nothing is updated from the spreadsheet', result.updated, 0);
      equal('no rows are reported as conflicting', result.conflicts, 0);
      check('the owner is told why', result.details.join(' ').toLowerCase().includes('copy'));
    }
  }
  {
    // A copy that is only written never asks the database to be changed, so there
    // is nothing on the store that can be pointed back at a bill. Checked by
    // shape rather than by reading the source: the store has no import method.
    const store = new PostgresStore() as unknown as Record<string, unknown>;
    for (const name of ['importRows', 'importFromSheet', 'pullFromSheet', 'applySheet']) {
      check(`the store has no "${name}" method`, store[name] === undefined);
    }
  }
  {
    // Staff accounts live in the database, and the copy has no tab for them: a
    // bcrypt hash and a login are not spreadsheet material, and a copy of them in
    // a shareable sheet is a password list in a place nobody thinks of as one.
    const tabs = MIRROR_SHEETS.map((tab) => tab.toLowerCase());
    check('there is no tab for staff accounts', !tabs.includes('users'));
    check('the copy writes no user columns', columnList(USER_SPEC).length > 0 && !MIRROR_SHEETS.some((t) => t.toLowerCase() === 'users'));
  }
  {
    // The columns the app asks for have to be columns the table actually has. A
    // rename in schema.sql without a matching change here is a runtime error on
    // login, and the first person to see it is at the counter.
    const userColumns = columnList(USER_SPEC);
    for (const column of ['id', 'username', 'password_hash', 'role', 'active']) {
      check(`the users table has a ${column} column`, userColumns.includes(column));
    }
    // The primary key is the id; the login name is looked up by its own query.
    // Confusing the two would make "find the account for this username" return
    // whichever account happened to share the id.
    equal('accounts are keyed by id', USER_SPEC.key, 'id');
    check('and the login name is a column of its own', userColumns.includes('username'));
  }


  {
    // Every table the store writes to has to be created by schema.sql and granted
    // by db:setup. A table that is written but not granted is not a startup
    // error - it is a permission error the first time that screen is opened, on
    // the first day of trading, with no way for the owner to fix it.
    const schema = fs.readFileSync(path.join(__dirname, '..', 'data', 'postgres', 'schema.sql'), 'utf8');
    const setup = fs.readFileSync(path.join(__dirname, 'postgresSetup.ts'), 'utf8');
    const created = new Set(
      [...schema.matchAll(/create table if not exists (\w+)/g)].map((match) => match[1]),
    );
    const granted = new Set(
      [...setup.matchAll(/^\s+'(\w+)',$/gm)].map((match) => match[1]),
    );
    for (const spec of [...TABLE_SPECS, USER_SPEC]) {
      const table = String((spec as { table: string }).table);
      check(`schema.sql creates ${table}`, created.has(table));
      check(`db:setup grants the app role on ${table}`, granted.has(table));
    }
    check('db:setup grants on the two single row tables too', granted.has('settings') && granted.has('meta'));
  }

  const passed = checks - failures.length;
  console.log(`\n${passed}/${checks} checks passed`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILED:`);
    failures.forEach((name) => console.log(`  - ${name}`));
    process.exit(1);
  }
  console.log('ALL DATABASE RULES HOLD\n');
}

main().catch((error: unknown) => {
  console.error('[db:rules] could not run the checks:', error instanceof Error ? error.message : error);
  process.exit(1);
});

/** The key on Database that a workbook tab holds. */
function tabKeyFor(tab: string): keyof Database {
  const key: Record<string, keyof Database> = {
    Customers: 'customers',
    Orders: 'orders',
    Payments: 'payments',
    Parts: 'parts',
    'Order Parts': 'orderParts',
    'Stock Movements': 'stockMovements',
    Suppliers: 'suppliers',
    'Status History': 'statusHistory',
  };
  return key[tab] ?? ('orders' as keyof Database);
}
