import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthResult,
  AuthSessionState,
  AuthenticatedUser,
  WorkspaceMembership,
  WorkspaceRole,
} from './types.js';

export class AuthService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceSlug: string,
  ) {}

  async getSession(): Promise<AuthResult<AuthSessionState | undefined>> {
    const { data, error } = await this.client.auth.getSession();
    if (error !== null) return { valid: false, errors: [error.message] };
    const user = data.session?.user;
    if (user === undefined) return { valid: true, errors: [], value: undefined };
    return this.buildSessionState(user.id, user.email);
  }

  async signIn(email: string, password: string): Promise<AuthResult<AuthSessionState>> {
    const normalizedEmail = email.trim();
    if (normalizedEmail.length === 0 || password.length === 0) {
      return { valid: false, errors: ['Email and password are required.'] };
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error !== null || data.user === null) {
      return { valid: false, errors: [error?.message ?? 'Sign-in failed.'] };
    }

    const session = await this.buildSessionState(data.user.id, data.user.email);
    if (!session.valid) await this.client.auth.signOut();
    return session;
  }

  async signOut(): Promise<AuthResult<void>> {
    const { error } = await this.client.auth.signOut();
    return error === null
      ? { valid: true, errors: [], value: undefined }
      : { valid: false, errors: [error.message] };
  }

  async loadMembership(userId: string): Promise<AuthResult<WorkspaceMembership>> {
    const { data, error } = await this.client
      .from('workspace_memberships')
      .select('workspace_id, role, workspaces!inner(slug)')
      .eq('user_id', userId)
      .eq('workspaces.slug', this.workspaceSlug)
      .maybeSingle();

    if (error !== null) return { valid: false, errors: [error.message] };
    if (data === null) {
      return { valid: false, errors: ['Your account is not assigned to the UAT workspace.'] };
    }

    const workspace = data.workspaces as unknown as { slug: string };
    return {
      valid: true,
      errors: [],
      value: {
        workspaceId: data.workspace_id as string,
        workspaceSlug: workspace.slug,
        role: data.role as WorkspaceRole,
      },
    };
  }

  private async buildSessionState(
    userId: string,
    email: string | undefined,
  ): Promise<AuthResult<AuthSessionState>> {
    if (email === undefined) return { valid: false, errors: ['Authenticated user has no email address.'] };
    const membership = await this.loadMembership(userId);
    if (!membership.valid || membership.value === undefined) {
      return { valid: false, errors: membership.errors };
    }

    const user: AuthenticatedUser = { id: userId, email };
    return {
      valid: true,
      errors: [],
      value: { user, membership: membership.value },
    };
  }
}
