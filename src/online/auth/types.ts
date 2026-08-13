export type WorkspaceRole = 'admin' | 'tester';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
}

export interface WorkspaceMembership {
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly role: WorkspaceRole;
}

export interface AuthSessionState {
  readonly user: AuthenticatedUser;
  readonly membership: WorkspaceMembership;
}

export interface AuthResult<T> {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly value?: T;
}
