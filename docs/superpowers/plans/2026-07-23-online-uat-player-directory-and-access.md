# Online UAT, Player Directory, and Role-Based Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure online UAT version of the Estimation Score Calculator with invite-only Admin/Tester access, shared player selection, central game persistence, audited score changes, and one-editor-per-game locking.

**Architecture:** Keep the existing scoring engine framework-agnostic and introduce an online application-services layer backed by Supabase Auth and PostgreSQL. React screens consume typed ports for authentication, player directory, games, administration, audit, and locks; local browser services remain available only for local development and existing local data is never migrated or overwritten. Vercel hosts the Vite frontend, while versioned SQL migrations define database structure, functions, and Row Level Security.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Testing Library, Node test runner, `@supabase/supabase-js`, Supabase Auth/PostgreSQL/RLS, SQL migrations, Vercel.

## Global Constraints

- Hide the non-functional `+ New Round` button; the current-round row remains the only next-round entry point.
- Public registration is disabled; access is invite-only.
- Roles are exactly `admin` and `tester`, with multiple Admins supported.
- Testers can create games, rounds, players, and audited score overrides.
- Only Admins can invite users, assign roles, rename/archive/restore players, review full audit activity, and force-release locks.
- Player names are unique per workspace after trim and case-insensitive normalization.
- Players are archived, never hard-deleted.
- Archived players remain linked to historical games and are excluded from new-game selection.
- A game has one active editor; other authenticated users receive view-only access.
- Locks expire after 15 minutes without heartbeat.
- Service-role credentials are never exposed to browser code.
- Existing local browser games remain untouched and are not migrated.
- Online UAT starts with an empty database.
- Existing scoring behavior, all-loser carry, Multiple WITH, and score override integrity remain unchanged.
- No score-table redesign or all-loser visual enhancement is included.
- No merge to `main` without explicit user approval.

---

## File Map

### Frontend configuration and authentication
- `package.json`: add Supabase client dependency and UAT scripts.
- `.env.example`: document browser-safe environment variables only.
- `src/online/supabaseClient.ts`: validate environment configuration and create the browser client.
- `src/online/auth/AuthService.ts`: sign-in, sign-out, session, invitation completion, and membership loading.
- `src/online/auth/types.ts`: authenticated user, role, membership, and auth-result types.
- `src/app/screens/SignInScreen.tsx`: email/password sign-in and invitation errors.
- `src/app/components/UserSessionMenu.tsx`: signed-in identity, role, and sign-out.
- `src/app/AppContext.tsx`, `src/app/App.tsx`, `src/app/appTypes.ts`: authenticated routing and service selection.

### Player directory
- `src/online/players/PlayerDirectoryService.ts`: list/search/create and Admin management commands.
- `src/online/players/types.ts`: player and command/result contracts.
- `src/app/components/PlayerCombobox.tsx`: searchable select-or-create control.
- `src/app/screens/NewGameScreen.tsx`: four directory-backed comboboxes and duplicate-selection validation.
- `src/app/screens/ManagePlayersScreen.tsx`: Admin search, filters, rename, archive, and restore.

### Shared game persistence
- `src/online/games/OnlineGameService.ts`: create/list/open/save round/override operations.
- `src/online/games/onlineGameMapper.ts`: map relational rows to existing engine inputs and UI results.
- `src/online/games/types.ts`: DTOs and service result types.
- `src/app/services/createBrowserServices.ts`: choose online services only when UAT environment variables are present.
- `src/ui/BrowserUiShellService.ts`: remain the local-development implementation without migration behavior.

### Locks, administration, and audit
- `src/online/locks/GameLockService.ts`: acquire, heartbeat, release, and Admin force-release.
- `src/online/admin/AdminService.ts`: invite users and update roles through protected server functions.
- `src/online/audit/AuditService.ts`: query audit events for Admin view.
- `src/app/screens/AdminUsersScreen.tsx`: invite and role management.
- `src/app/screens/AuditScreen.tsx`: Admin audit activity.
- `src/app/screens/ScoreSheetScreen.tsx`: view-only state and heartbeat integration; hide New Round button.

### Database and deployment
- `supabase/migrations/202607230001_online_uat_schema.sql`: tables, constraints, indexes, normalization function, triggers, and initial workspace support.
- `supabase/migrations/202607230002_online_uat_rls.sql`: RLS policies and helper functions.
- `supabase/migrations/202607230003_online_uat_rpc.sql`: transactional game-save, lock, invite-role, and force-release functions.
- `supabase/seed.sql`: optional local test seed only; no production credentials.
- `vercel.json`: SPA routing and security headers.
- `docs/UAT_DEPLOYMENT.md`: Supabase/Vercel setup, first Admin bootstrap, invitation procedure, smoke test, and rollback.
- `.github/workflows/ci.yml`: run online unit tests, SQL static checks, and production build.

---

### Task 1: Remove the Non-Functional New Round Action

**Files:**
- Modify: `src/app/screens/ScoreSheetScreen.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Removes the unused `onNewRound?: () => void` prop.
- Preserves `onHistory?: () => void` and the current-round row.

- [ ] **Step 1: Write the failing component test**

Add to `ScoreSheetScreen.test.tsx`:

```tsx
it('does not render a New Round button because the current row is the entry point', () => {
  render(<ScoreSheetScreen scoreSheetId="sheet-1" shell={shell} />);
  expect(screen.queryByRole('button', { name: 'New Round' })).not.toBeInTheDocument();
  expect(screen.getByText('Round 2')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm run test:app -- --run src/app/screens/ScoreSheetScreen.test.tsx`

Expected: FAIL because `New Round` is currently rendered.

- [ ] **Step 3: Remove the prop and button**

Delete `onNewRound` from the component props and remove the button block while retaining History and dealer information.

- [ ] **Step 4: Run the focused test and full app suite**

Run: `npm run test:app -- --run src/app/screens/ScoreSheetScreen.test.tsx && npm run test:app -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/ScoreSheetScreen.tsx src/app/screens/ScoreSheetScreen.test.tsx src/app/App.tsx
git commit -m "fix: remove inactive new round action"
```

### Task 2: Add Typed Online Configuration and Supabase Client

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `src/online/config.ts`
- Create: `src/online/supabaseClient.ts`
- Create: `src/online/config.test.ts`

**Interfaces:**
- Produces `OnlineConfig { supabaseUrl: string; supabaseAnonKey: string; workspaceSlug: string }`.
- Produces `readOnlineConfig(env): OnlineConfig | undefined`.
- Produces `createSupabaseBrowserClient(config)`.

- [ ] **Step 1: Add failing configuration tests**

Cover missing configuration returning `undefined`, complete configuration returning typed values, and partial configuration throwing a descriptive error.

- [ ] **Step 2: Verify red**

Run: `npm run test:app -- --run src/online/config.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add the dependency and implementation**

Add `@supabase/supabase-js` and expose only:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_UAT_WORKSPACE_SLUG=estimation-uat
```

Never add a service-role key to frontend configuration.

- [ ] **Step 4: Verify tests and production build**

Run: `npm install && npm run test:app -- --run src/online/config.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example src/online/config.ts src/online/supabaseClient.ts src/online/config.test.ts
git commit -m "feat: configure Supabase UAT client"
```

### Task 3: Create the Online Database Schema and Score-Integrity Model

**Files:**
- Create: `supabase/migrations/202607230001_online_uat_schema.sql`
- Create: `supabase/seed.sql`
- Create: `tests/sql/onlineSchema.test.ts`

**Interfaces:**
- Produces tables: `workspaces`, `profiles`, `workspace_memberships`, `players`, `games`, `game_players`, `rounds`, `round_bids`, `round_actuals`, `round_scores`, `score_overrides`, `audit_events`, and `game_edit_locks`.
- Produces SQL function `normalize_player_name(text) returns text`.
- Enforces a unique index on `(workspace_id, normalized_name)`.
- Preserves separate `calculated_score` and `applied_score` values.

- [ ] **Step 1: Write failing SQL structure tests**

Read the migration as text and assert required tables, RLS enable statements, unique player index, score-integrity columns, foreign keys, and no embedded credentials.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/sql/onlineSchema.test.ts`

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement the migration**

Use UUID primary keys, `timestamptz`, immutable historical player references, role check constraints, indexes for workspace/game/round lookup, and audit actor columns referencing `auth.users` where supported.

- [ ] **Step 4: Verify SQL tests**

Run: `npm test -- tests/sql/onlineSchema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607230001_online_uat_schema.sql supabase/seed.sql tests/sql/onlineSchema.test.ts
git commit -m "feat: define online UAT database schema"
```

### Task 4: Enforce Invite-Only Roles with Row Level Security

**Files:**
- Create: `supabase/migrations/202607230002_online_uat_rls.sql`
- Create: `tests/sql/onlineRls.test.ts`
- Create: `src/online/auth/types.ts`
- Create: `src/online/auth/AuthService.ts`
- Create: `src/online/auth/AuthService.test.ts`

**Interfaces:**
- Produces role type `WorkspaceRole = 'admin' | 'tester'`.
- Produces `AuthService.getSession()`, `signIn(email, password)`, `signOut()`, and `loadMembership(userId, workspaceSlug)`.
- RLS allows workspace reads for authenticated members and restricts Admin operations through membership role checks.

- [ ] **Step 1: Add failing RLS and auth-service tests**

Cover unauthenticated rejection, tester denial for Admin mutations, Admin access, and membership loading.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/sql/onlineRls.test.ts && npm run test:app -- --run src/online/auth/AuthService.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement policies and AuthService**

Add security-definer helper functions with fixed `search_path`, enable RLS on every shared table, and use the anonymous browser client only with authenticated JWT sessions.

- [ ] **Step 4: Verify focused tests**

Run the commands from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607230002_online_uat_rls.sql tests/sql/onlineRls.test.ts src/online/auth/types.ts src/online/auth/AuthService.ts src/online/auth/AuthService.test.ts
git commit -m "feat: secure UAT workspace access"
```

### Task 5: Build Sign-In, Session Routing, and Sign-Out

**Files:**
- Create: `src/app/screens/SignInScreen.tsx`
- Create: `src/app/screens/SignInScreen.test.tsx`
- Create: `src/app/components/UserSessionMenu.tsx`
- Modify: `src/app/appTypes.ts`
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Unauthenticated online users see only `SignInScreen`.
- Authenticated users receive membership and role in application context.
- Sign-out clears app session state and returns to sign-in.

- [ ] **Step 1: Write failing routing and sign-in tests**

Cover unauthenticated blocking, successful sign-in, invalid credentials, role display, and sign-out.

- [ ] **Step 2: Verify red**

Run: `npm run test:app -- --run src/app/screens/SignInScreen.test.tsx src/app/App.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement minimal authenticated routing**

Keep the existing local-development route behavior when online configuration is absent. Require authentication before constructing online data services.

- [ ] **Step 4: Verify tests and accessibility roles**

Run the command from Step 2 and `npm run build`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/SignInScreen.tsx src/app/screens/SignInScreen.test.tsx src/app/components/UserSessionMenu.tsx src/app/appTypes.ts src/app/AppContext.tsx src/app/App.tsx src/app/styles/app.css
git commit -m "feat: add invite-only UAT sign in"
```

### Task 6: Implement the Shared Player Directory Service

**Files:**
- Create: `src/online/players/types.ts`
- Create: `src/online/players/PlayerDirectoryService.ts`
- Create: `src/online/players/PlayerDirectoryService.test.ts`

**Interfaces:**
- Produces `listActivePlayers(query?)`, `createPlayer(name)`, `renamePlayer(id, name)`, `archivePlayer(id)`, and `restorePlayer(id)`.
- Returns normalized permission, duplicate-name, and network errors.
- Tester receives create/list only; Admin receives all commands.

- [ ] **Step 1: Write failing service tests**

Cover case-insensitive uniqueness, whitespace normalization, archived filtering, Tester permissions, Admin management, and actor attribution.

- [ ] **Step 2: Verify red**

Run: `npm run test:app -- --run src/online/players/PlayerDirectoryService.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement minimal Supabase queries**

Use `.select`, `.insert`, `.update`, and database uniqueness errors; never trust frontend role checks as the authorization boundary.

- [ ] **Step 4: Verify focused tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/online/players/types.ts src/online/players/PlayerDirectoryService.ts src/online/players/PlayerDirectoryService.test.ts
git commit -m "feat: add shared player directory service"
```

### Task 7: Replace Player Text Fields with Searchable Select-or-Create Comboboxes

**Files:**
- Create: `src/app/components/PlayerCombobox.tsx`
- Create: `src/app/components/PlayerCombobox.test.tsx`
- Modify: `src/app/screens/NewGameScreen.tsx`
- Modify: `src/app/screens/NewGameScreen.test.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes player directory `listActivePlayers` and `createPlayer`.
- Emits selected persistent player IDs and names.
- Prevents duplicate selection across four fields.

- [ ] **Step 1: Write failing component and screen tests**

Cover search, keyboard selection, inline creation, duplicate name, duplicate selection, archived omission, and four selected IDs submitted to game creation.

- [ ] **Step 2: Verify red**

Run: `npm run test:app -- --run src/app/components/PlayerCombobox.test.tsx src/app/screens/NewGameScreen.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement accessible combobox behavior**

Use labelled input, listbox/options, explicit “Create player” option, loading/error states, and no native datalist dependency.

- [ ] **Step 4: Verify tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/PlayerCombobox.tsx src/app/components/PlayerCombobox.test.tsx src/app/screens/NewGameScreen.tsx src/app/screens/NewGameScreen.test.tsx src/app/styles/app.css
git commit -m "feat: select shared players when creating games"
```

### Task 8: Add Admin Player Management

**Files:**
- Create: `src/app/screens/ManagePlayersScreen.tsx`
- Create: `src/app/screens/ManagePlayersScreen.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppContext.tsx`

**Interfaces:**
- Admin-only route.
- Supports active/archived filter, search, rename, archive, restore, and usage count.

- [ ] **Step 1: Write failing permission and interaction tests**
- [ ] **Step 2: Verify red with `npm run test:app -- --run src/app/screens/ManagePlayersScreen.test.tsx`**
- [ ] **Step 3: Implement the Admin screen and role guard**
- [ ] **Step 4: Verify PASS and run full app tests**
- [ ] **Step 5: Commit with `git commit -m "feat: manage shared players"`**

### Task 9: Implement Transactional Online Game Persistence

**Files:**
- Create: `supabase/migrations/202607230003_online_uat_rpc.sql`
- Create: `src/online/games/types.ts`
- Create: `src/online/games/onlineGameMapper.ts`
- Create: `src/online/games/OnlineGameService.ts`
- Create: `src/online/games/OnlineGameService.test.ts`
- Modify: `src/app/services/createBrowserServices.ts`

**Interfaces:**
- Produces create/list/open/save-round/override operations compatible with existing screen ports.
- Transactionally stores round bids, actuals, calculated scores, applied scores, all-loser metadata, multipliers, and audit actor.
- Recalculates with the existing TypeScript scoring engine before persistence.

- [ ] **Step 1: Write failing mapping and service tests**

Cover empty online start, create/reopen, round save, all-loser carry after reopen, override integrity, actor attribution, and failed transaction behavior.

- [ ] **Step 2: Verify red**

Run: `npm run test:app -- --run src/online/games/OnlineGameService.test.ts`

- [ ] **Step 3: Implement RPC and service**

Use optimistic version checks on games, atomic RPC writes, and relational reads mapped into existing UI result shapes.

- [ ] **Step 4: Verify focused and engine regression tests**

Run: `npm run test:app -- --run src/online/games/OnlineGameService.test.ts && npm test && npm run test:app -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607230003_online_uat_rpc.sql src/online/games src/app/services/createBrowserServices.ts
git commit -m "feat: persist shared UAT games online"
```

### Task 10: Add One-Editor Game Locks and View-Only Mode

**Files:**
- Create: `src/online/locks/GameLockService.ts`
- Create: `src/online/locks/GameLockService.test.ts`
- Modify: `src/app/screens/ScoreSheetScreen.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.test.tsx`

**Interfaces:**
- Produces `acquire`, `heartbeat`, `release`, and `forceRelease`.
- Score sheet disables editing when lock belongs to another active user.
- Heartbeat renews while the editor interacts; expiry threshold is 15 minutes.

- [ ] **Step 1: Write failing lock and UI tests**
- [ ] **Step 2: Verify red**
- [ ] **Step 3: Implement RPC-backed lock service and view-only UI state**
- [ ] **Step 4: Verify acquisition, expiry, heartbeat, release, and Admin force release**
- [ ] **Step 5: Commit with `git commit -m "feat: enforce one editor per game"`**

### Task 11: Add Admin Invitations, Roles, and Audit Views

**Files:**
- Create: `src/online/admin/AdminService.ts`
- Create: `src/online/admin/AdminService.test.ts`
- Create: `src/online/audit/AuditService.ts`
- Create: `src/app/screens/AdminUsersScreen.tsx`
- Create: `src/app/screens/AuditScreen.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Admin invitation runs only through a protected server-side function or Supabase Edge Function using service-role credentials.
- Browser never receives the service-role key.
- Role changes and invitations create audit events.

- [ ] **Step 1: Write failing authorization and UI tests**
- [ ] **Step 2: Verify red**
- [ ] **Step 3: Implement browser-safe Admin service contracts and protected backend endpoint contract**
- [ ] **Step 4: Verify Admin/Tester boundaries and audit listing**
- [ ] **Step 5: Commit with `git commit -m "feat: administer UAT users and audit"`**

### Task 12: Configure Vercel and Produce UAT Deployment Runbook

**Files:**
- Create: `vercel.json`
- Create: `docs/UAT_DEPLOYMENT.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- SPA fallback routes to `/index.html`.
- CI runs engine tests, app tests, SQL checks, and production build.
- Runbook documents Supabase project creation, migrations, disabling public sign-up, initial Admin bootstrap, protected invitation function deployment, Vercel environment variables, deployment, smoke test, rollback, and tester invitation.

- [ ] **Step 1: Add failing deployment configuration tests**
- [ ] **Step 2: Verify red**
- [ ] **Step 3: Add Vercel configuration, CI checks, and exact deployment procedure**
- [ ] **Step 4: Run `npm run ci` and verify production build output**
- [ ] **Step 5: Commit with `git commit -m "chore: prepare online UAT deployment"`**

### Task 13: Provision and Smoke-Test the UAT Environment

**Files:**
- Modify: `docs/UAT_DEPLOYMENT.md` with actual non-secret deployment identifiers and verification date.

**Interfaces:**
- Requires user-owned Supabase and Vercel projects or delegated credentials.
- Produces HTTPS UAT URL, initial Admin account, verified Tester invitation, and smoke-test evidence.

- [ ] **Step 1: Create or select the Supabase project**
- [ ] **Step 2: Apply all repository migrations and disable public sign-up**
- [ ] **Step 3: Bootstrap the first Admin membership without placing credentials in Git**
- [ ] **Step 4: Connect the GitHub repository/branch to Vercel and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_UAT_WORKSPACE_SLUG`**
- [ ] **Step 5: Deploy and verify HTTPS reachability**
- [ ] **Step 6: Invite one Tester and verify password setup/sign-in**
- [ ] **Step 7: Smoke-test player creation, game creation, all-loser round, next-round carry, reopen, override audit, Tester restrictions, lock conflict, and Admin release**
- [ ] **Step 8: Record URL and non-secret handover details; never record passwords or service-role credentials**

## Final Verification

- [ ] Run `npm run ci` with all engine, React, SQL, and build checks passing.
- [ ] Confirm local-storage games remain unchanged in a local build without UAT variables.
- [ ] Confirm online UAT starts empty and uses Supabase only when fully configured.
- [ ] Confirm no service-role secret appears in source, compiled assets, logs, or documentation.
- [ ] Confirm Admin and Tester permissions match the approved specification.
- [ ] Confirm CI and UAT smoke test evidence are attached to the draft PR.
- [ ] Keep PR draft and unmerged until explicit approval.
