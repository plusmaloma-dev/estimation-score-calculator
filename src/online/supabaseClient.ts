import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { OnlineConfig } from './config.js';

export function createSupabaseBrowserClient(config: OnlineConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
