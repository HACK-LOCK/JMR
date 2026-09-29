import { env } from '../config/env';
import { closePool, describeDatabase, getPool, isDatabaseConfigured } from '../data/postgres/pool';
import { PostgresStore } from '../data/postgres/postgresStore';

/**
 * Checks the online store without starting the server.
 *
 *   npm run db:check
 *
 * Answers the two questions worth asking before a trading day: can the app reach
 * the database with the credentials in .env, and is the shop's data really
 * sitting in the tables?
 */
async function main(): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.error('[db:check] DATABASE_URL is not set, so the app is running on the local file.');
    process.exit(1);
  }

  console.log(`[db:check] target ${describeDatabase()}`);

  const store = new PostgresStore();
  await store.init();
  const db = store.snapshot();

  console.log(`[db:check] shop        ${db.settings.shopName}`);
  console.log(`[db:check] bills       ${db.orders.length}`);
  console.log(`[db:check] customers   ${db.customers.length}`);
  console.log(`[db:check] parts       ${db.parts.length}`);
  console.log(`[db:check] payments    ${db.payments.length}`);
  console.log(`[db:check] suppliers   ${db.suppliers.length}`);
  console.log(`[db:check] order parts ${db.orderParts.length}`);
  console.log(`[db:check] movements   ${db.stockMovements.length}`);
  console.log(`[db:check] history     ${db.statusHistory.length}`);

  const health = await store.health();
  console.log(`[db:check] health      ${health.ok ? 'ok' : 'PROBLEM'} - ${health.message}`);

  // Staff logins, because "nobody can log in" is otherwise discovered at 10am
  // with an empty database to look at.
  const accounts = await getPool().query(
    `select count(*)::int as total,
            count(*) filter (where active)::int as active,
            count(*) filter (where role = 'OWNER')::int as owners
       from users`,
  );
  const row = accounts.rows[0] as { total: number; active: number; owners: number };
  console.log(`[db:check] staff       ${row.active} active account(s), ${row.owners} owner(s)`);
  if (row.total === 0) {
    console.error(
      '[db:check] PROBLEM - there are no staff accounts, so nobody can log in.\n' +
        '           Run "npm run db:setup" against this database to create the first owner.',
    );
  }

  // The bill number counter, so a shop can see the next number before opening.
  const meta = await getPool().query('select order_sequence from meta where id = 1');
  const next = Number((meta.rows[0] as { order_sequence: number } | undefined)?.order_sequence ?? 0) + 1;
  console.log(`[db:check] next bill   JMR-${String(next).padStart(4, '0')}`);

  await closePool();
  if (!health.ok || row.total === 0) process.exit(1);
}

main().catch(async (error: unknown) => {
  console.error(`[db:check] could not reach the database: ${error instanceof Error ? error.message : error}`);
  console.error('[db:check] check that DATABASE_URL is right and the password has not been reset.');
  await closePool().catch(() => undefined);
  process.exit(1);
});
