import { createApp } from './app';
import { env } from './config/env';
import { initStore } from './data';
import { initUsers } from './data/userStore';
import { isGoogleReady } from './google/client';

async function main(): Promise<void> {
  await initUsers();
  await initStore();

  const app = createApp();
  app.listen(env.port, () => {
    console.log('');
    console.log('  Jai Mataji Mobile Repairing - API');
    console.log(`  Running on  http://localhost:${env.port}`);
    console.log(`  Data store  ${isGoogleReady() && env.google.sheetsId ? 'Google Sheets' : 'local file'}`);
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
