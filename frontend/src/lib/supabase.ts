import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client configuration.
 *
 * Reads values from environment variables without hardcoding.
 * Supports standard VITE_ prefixes as well as SUPABASE_ prefixed variables
 * via Vite's envPrefix configuration.
 */
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  '';

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  '';

/**
 * Check whether Supabase environment variables are present and non-empty.
 */
export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  supabaseUrl.trim() !== '' &&
  supabasePublishableKey.trim() !== ''
);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[Supabase] SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not defined in environment variables.',
  );
}

/**
 * Single reusable Supabase client instance.
 *
 * Uses the official public publishable key for client-safe access.
 * Does not use service_role or secret keys.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabasePublishableKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/**
 * Test connectivity with the Supabase project to verify that
 * credentials and project URL resolve properly without altering any local data.
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  data?: unknown;
}> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: 'Supabase URL or Publishable Key is not configured in .env',
    };
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: {
        apikey: supabasePublishableKey,
      },
    });

    if (res.ok) {
      const data = (await res.json()) as { version?: string; name?: string; description?: string };
      return {
        success: true,
        message: `Supabase connected successfully (${data.name ?? 'GoTrue'} ${data.version ?? ''})`,
        data,
      };
    }

    return {
      success: false,
      message: `Supabase endpoint responded with HTTP ${res.status}: ${res.statusText}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}
