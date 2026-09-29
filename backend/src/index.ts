import { createApp } from './app';
import { env } from './config/env';
import { getStore, initStore } from './data';
import { userStore, initUsers } from './data/userStore';
import { isGoogleReady } from './google/client';

function describeStore(): string {
  const store = getStore();
  if (store.mode === 'postgres') {
    return 'online database (Supabase Postgres)';
  }
  if (store.mode === 'sheets') return 'Google Sheets';
  return 'local file on this computer';
}

async function main(): Promise<void> {
  // The store comes first: staff accounts live in the database when there is
  // one, so the connection has to be known before they are opened.
  await initStore();
  await initUsers();

  const app = createApp();
  app.listen(env.port, () => {
    const mirror = getStore().mode === 'postgres';
    console.log('');
    console.log('  Jai Mataji Mobile Repairing - API');
    console.log(`  Running on  http://localhost:${env.port}`);
    console.log(`  Data store  ${describeStore()}`);
    console.log(`  Staff logins ${userStore.where()}`);
    if (isGoogleReady() && env.google.sheetsId && !mirror) {
      console.log('  Sheets      connected as the store');
    }
    if (env.jwtSecret === 'insecure-dev-secret-change-me') {
      console.log('  ! Set JWT_SECRET in .env before using this on a phone.');
    }
    console.log('');
  });
}

main().catch((error: unknown) => {
  console.error('Could not start the server:', error);
  process.exit(1);
});
