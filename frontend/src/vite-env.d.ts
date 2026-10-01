/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Build time, injected by vite.config.ts. Read it to see which build is loaded. */
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

