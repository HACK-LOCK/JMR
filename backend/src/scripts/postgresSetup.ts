import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { env } from '../config/env';
import { newId, nowIso } from '../core/id';

/**
 * One-time database setup. Run once per Supabase project.
 *
 *   POSTGRES_ADMIN_URL=postgresql://... npm run db:setup
 *
 * Does four things, in this order because each one depends on the last:
 *
 *   1. Creates the login role the app will use. It gets read and write on the
 *      shop's tables and nothing else - no CREATE, no DROP, no TRUNCATE, so a
 *      compromised server cannot take the tables away or wipe them.
 *   2. Creates the tables.
 *   3. Opens a policy for that role and revokes the world-readable defaults,
 *      because the public schema is also published through Supabase's Data API
 *      and without Row Level Security the anonymous key alone would be enough
 *      to read every bill in the shop.
 *   4. Creates the first owner login, so the shop can actually be logged into.
 *
 * The superuser password is used here and then discarded: DATABASE_URL holds
 * the limited role, and POSTGRES_ADMIN_URL can be emptied once this has run.
 *
 * No demo data is inserted. The shop's database starts empty and is filled only
 * by real bills, so a made-up repair can never end up in a day's takings.
 */

const ROLE = 'jmmr_app';
const TABLES = [
  'settings',
  'meta',
  'customers',
  'orders',
  'payments',
  'parts',
  'order_parts',
  'stock_movements',
  'suppliers',
  'status_history',
  'users',
];

function die(message: string): never {
  console.error(`\n[db:setup] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!env.database.adminUrl) {
    die('POSTGRES_ADMIN_URL is not set. Put the postgres superuser connection string in .env and run again.');
  }

  const admin = new Client({
    connectionString: env.database.adminUrl,
    ssl: { rejectUnauthorized: false },
  });
  await admin.connect();

  // 1. The application role.
  const password = crypto.randomBytes(24).toString('hex');
  const exists = await admin.query('select 1 from pg_roles where rolname = $1', [ROLE]);
  if (exists.rowCount === 0) {
    await admin.query(`create role ${ROLE} login password $1`, [password]);
    console.log(`[db:setup] created role ${ROLE}`);
  } else {
    await admin.query(`alter role ${ROLE} with login password $1`, [password]);
    console.log(`[db:setup] reset the password on the existing role ${ROLE}`);
  }
  await admin.query('grant connect on database postgres to ' + ROLE);

  // 2. The tables.
  const schemaPath = path.join(__dirname, '..', 'data', 'postgres', 'schema.sql');
  if (!fs.existsSync(schemaPath)) die(`schema.sql is missing at ${schemaPath}`);
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await admin.query(schema);
  console.log('[db:setup] tables are in place');

  // 3. Access.
  await admin.query(`grant usage on schema public to ${ROLE}`);
  for (const table of TABLES) {
    await admin.query(
      `grant select, insert, update, delete on table public.${table} to ${ROLE}`,
    );
    await admin.query(`drop policy if exists ${ROLE}_access on public.${table}`);
    await admin.query(
      `create policy ${ROLE}_access on public.${table} for all to ${ROLE} using (true) with check (true)`,
    );
  }
  console.log(`[db:setup] ${ROLE} can read and write the shop tables, and nothing else`);

  // 4. The first login, so the shop is usable straight away.
  //
  // A password is generated unless OWNER_PASSWORD is set in .env, because the
  // development default must never end up as a real login on a real project.
  // It is printed once, here, and only a bcrypt hash is written down.
  const created = await createOwner(admin);

  await admin.end();

  // Prove the limited role can really do the job before the app relies on it.
  const app = new Client({
    connectionString: appUrl(password),
    ssl: { rejectUnauthorized: false },
  });
  await app.connect();
  const orders = await app.query('select count(*)::int as count from orders');
  const accounts = await app.query('select count(*)::int as count from users');
  const blocked = await app
    .query(`create table public.should_not_work (id int)`)
    .then(() => 'NOT BLOCKED')
    .catch(() => 'blocked');
  await app.end();
  console.log(
    `[db:setup] verified: ${ROLE} read ${orders.rows[0].count} orders, ` +
      `found ${accounts.rows[0].count} staff account(s), table creation is ${blocked}`,
  );

  console.log('\n  Put this in .env as DATABASE_URL:\n');
  console.log(`  ${appUrl(password)}\n`);
  console.log('  Then empty POSTGRES_ADMIN_URL - the superuser password is not needed again.\n');

  if (created) {
    console.log('  First owner login\n');
    console.log(`    username  ${created.username}`);
    console.log(`    password  ${created.password}`);
    console.log('    Change this password from the app after the first login.\n');
  }
}

/**
 * Creates the owner account if the table has none.
 *
 * Never touches an account that already exists, so running setup again to add a
 * table cannot reset a password somebody has already changed.
 */
async function createOwner(
  admin: Client,
): Promise<{ username: string; password: string } | null> {
  const existing = await admin.query('select count(*)::int as count from users');
  if (Number(existing.rows[0].count) > 0) {
    console.log('[db:setup] staff accounts already exist - left alone');
    return null;
  }

  const username = env.owner.username.toLowerCase();
  const generated = !env.owner.passwordGiven;
  const password = env.owner.passwordGiven ? env.owner.password : crypto.randomBytes(9).toString('base64url');
  const now = nowIso();
  await admin.query(
    `insert into users (id, name, username, password_hash, role, active, created_at, updated_at)
     values ($1, $2, $3, $4, 'OWNER', true, $5, $5)`,
    [newId('USR'), env.owner.name, username, await bcrypt.hash(password, 10), now],
  );
  console.log('[db:setup] created the first owner login');
  if (generated) {
    console.log('[db:setup] generated a password because OWNER_PASSWORD was not set in .env');
  }
  return { username, password };
}

/** Swap the superuser credentials in the admin URL for the limited role. */
function appUrl(password: string): string {
  const url = new URL(env.database.adminUrl);
  url.username = ROLE;
  url.password = password;
  return url.toString();
}

main().catch((error: unknown) => {
  die(error instanceof Error ? error.message : String(error));
});
