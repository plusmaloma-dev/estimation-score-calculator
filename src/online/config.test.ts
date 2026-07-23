import { describe, expect, it } from 'vitest';
import { readOnlineConfig } from './config.js';

describe('readOnlineConfig', () => {
  it('keeps the existing local browser mode when no UAT variables are provided', () => {
    expect(readOnlineConfig({})).toBeUndefined();
  });

  it('returns a complete online configuration', () => {
    expect(readOnlineConfig({
      VITE_SUPABASE_URL: ' https://example.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' anon-key ',
      VITE_UAT_WORKSPACE_SLUG: ' estimation-uat ',
    })).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      workspaceSlug: 'estimation-uat',
    });
  });

  it('rejects a partially configured online environment', () => {
    expect(() => readOnlineConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    })).toThrow(/configuration is incomplete/i);
  });
});
