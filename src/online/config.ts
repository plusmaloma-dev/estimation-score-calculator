export interface OnlineConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly workspaceSlug: string;
}

export type OnlineEnvironment = Readonly<Record<string, string | undefined>>;

export function readOnlineConfig(env: OnlineEnvironment): OnlineConfig | undefined {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  const workspaceSlug = env.VITE_UAT_WORKSPACE_SLUG?.trim();
  const provided = [supabaseUrl, supabaseAnonKey, workspaceSlug].filter(Boolean).length;

  if (provided === 0) return undefined;
  if (provided !== 3) {
    throw new Error(
      'Online UAT configuration is incomplete. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_UAT_WORKSPACE_SLUG together.',
    );
  }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseAnonKey: supabaseAnonKey!,
    workspaceSlug: workspaceSlug!,
  };
}
