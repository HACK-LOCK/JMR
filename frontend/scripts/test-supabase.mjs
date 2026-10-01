import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// Load environment variables from .env
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'frontend', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

console.log('Testing Supabase Client Initialization...');
console.log('SUPABASE_URL:', supabaseUrl ? supabaseUrl : '(missing)');
console.log('SUPABASE_PUBLISHABLE_KEY:', supabaseKey ? `${supabaseKey.slice(0, 15)}...` : '(missing)');

if (!supabaseUrl || !supabaseKey) {
  console.error('FAIL: Missing Supabase URL or publishable key in environment variables.');
  process.exit(1);
}

try {
  // 1. Initialize client
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('OK: Supabase client instantiated successfully.');

  // 2. Test client auth session retrieval
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('Auth getSession returned error:', error.message);
  } else {
    console.log('OK: supabase.auth.getSession() responded without errors.');
  }

  // 3. Test HTTP connectivity to GoTrue / Auth service endpoint
  const healthRes = await fetch(`${supabaseUrl}/auth/v1/health`, {
    headers: { apikey: supabaseKey },
  });

  if (healthRes.ok) {
    const health = await healthRes.json();
    console.log(`OK: Supabase project reachable (Auth ${health.name} ${health.version}).`);
    console.log('SUCCESS: Supabase client initialization & connection verified.');
  } else {
    console.error(`FAIL: Supabase health endpoint returned status ${healthRes.status}`);
    process.exit(1);
  }
} catch (err) {
  console.error('FAIL: Error initializing or connecting with Supabase:', err);
  process.exit(1);
}
