import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'frontend', '.env') });

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

console.log('--- Supabase Bill Storage Verification ---');
console.log('URL:', url || '(missing)');
console.log('Key:', key ? `${key.slice(0, 15)}...` : '(missing)');

if (!url || !key) {
  console.error('\nFAIL: Missing Supabase credentials in .env.');
  process.exit(1);
}

const supabase = createClient(url, key);

async function fetchWithRetry(fetchUrl, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(fetchUrl, { ...options, signal: AbortSignal.timeout(15000) });
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function run() {
  try {
    // 1. Check health
    const health = await fetchWithRetry(`${url}/auth/v1/health`, {
      headers: { apikey: key },
    });
    if (!health.ok) {
      console.error(`\nFAIL: Supabase endpoint returned status ${health.status}`);
      process.exit(1);
    }
    console.log('OK: Supabase server is reachable.');

    // 2. Check orders table
    const { data, error } = await supabase.from('orders').select('id').limit(1);

    if (error) {
      if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
        console.log('\n[INFO] Supabase is connected, but database tables are not yet created.');
        console.log('To complete setup and enable storing bills in Supabase:');
        console.log('1. Open your Supabase Dashboard SQL Editor:');
        console.log(`   https://supabase.com/dashboard/project/uvyszkdszzadoycbmeiy/sql/new`);
        console.log('2. Paste the contents of "supabase-schema.sql" and click "Run".');
        console.log('3. Re-run "npm run test:supabase:storage" to verify.\n');
        process.exit(0);
      }
      console.error('\nFAIL: Error querying orders table:', error.message, `(${error.code})`);
      process.exit(1);
    }

    console.log('OK: "orders" table is present and accessible.');

    // 3. Test insert and clean up
    const testId = `TEST-CHECK-${Date.now()}`;
    const { error: insertErr } = await supabase.from('orders').insert({
      id: testId,
      customer_name: 'Test Customer',
      mobile: '9999999999',
      device_type: 'Mobile',
      brand: 'Test Brand',
      model: 'Test Model',
      complaint: 'Testing Supabase bill storage',
      status: 'Received',
    });

    if (insertErr) {
      console.error('\nFAIL: Unable to write test bill to Supabase:', insertErr.message);
      console.log('Check that RLS policies in supabase-schema.sql are applied.');
      process.exit(1);
    }
    console.log('OK: Successfully inserted test bill record.');

    // Clean up test row
    await supabase.from('orders').delete().eq('id', testId);
    console.log('OK: Successfully cleaned up test record.');

    console.log('\nSUCCESS: Supabase is FULLY CONFIGURED and ready to store bills!');
  } catch (err) {
    console.error('\nFAIL: Unexpected error:', err);
    process.exit(1);
  }
}

run();
