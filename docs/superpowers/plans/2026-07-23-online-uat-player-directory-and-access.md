# Online UAT, Shared Directory, Access, and Game Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a deployable online UAT version of the Estimation Score Calculator with invite-only Admin/Tester access, shared players and games, single-editor locking, and the approved In progress/Completed lifecycle.

**Architecture:** Preserve the framework-independent scoring engine. Extend the existing shell contract with lifecycle operations and awaitable methods so the same React screens can use either synchronous browser-local services or asynchronous Supabase services. Supabase Auth, PostgreSQL, RPC functions, and RLS provide the online source of truth; Vercel hosts the Vite frontend.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Testing Library, Node test runner, `@supabase/supabase-js`, Supabase Auth/PostgreSQL/RLS/RPC, GitHub Actions, Vercel.

## Global Constraints

- Public registration is disabled; access is invite-only.
- Roles are exactly `admin` and `tester`.
- Duplicate game names are allowed; immutable UUIDs identify games.
- Player names are unique per workspace after trim and case-insensitive normalization.
- Persisted `draft` renders as **In progress**; persisted `finalized` renders as **Completed**.
- A game cannot be finalized before 18 successfully saved rounds.
- Round 18 suggests finalization but never finalizes automatically.
- Admins and Testers can finalize and reopen after confirmation.
- Reopening requires no written reason and preserves all score and audit history.
- Completed games reject round, score-entry, and override writes.
- One active editor is allowed per game; locks expire after 15 minutes.
- Service-role credentials never enter browser code or Git.
- Existing browser-local games remain untouched and are not migrated.
- Existing scoring behavior, all-loser carry, Multiple WITH, and override integrity remain unchanged.
- No merge to `main` occurs without explicit approval.

---

## File Map

### Lifecycle and local compatibility
- `src/persistence/types.ts`: lifecycle metadata and repository save contract.
- `src/ui/BrowserUiShellService.ts`: local finalize/reopen guards and read-only enforcement.
- `src/app/AppContext.tsx`: awaitable shell contract and lifecycle methods.
- `src/app/screens/HomeScreen.tsx`: async history loading, approved labels, creation date/time.
- `src/app/screens/ScoreSheetScreen.tsx`: async open/save, Round 18 prompt, finalize/reopen controls, completed read-only state.
- `src/app/components/GameLifecycleDialog.tsx`: confirmation UI.

### Online services
- `src/online/auth/AuthService.ts`: session and membership.
- `src/app/screens/SignInScreen.tsx`: sign-in state.
- `src/app/components/UserSessionMenu.tsx`: identity, role, sign-out.
- `src/online/players/PlayerDirectoryService.ts`: shared player operations.
- `src/online/games/OnlineGameService.ts`: list/create/open/save/override/finalize/reopen.
- `src/online/locks/GameLockService.ts`: acquire, heartbeat, release, force-release.
- `src/app/services/createBrowserServices.ts`: local/online service selection.

### Database and deployment
- `supabase/migrations/202607230001_online_uat_schema.sql`: lifecycle-compatible schema.
- `supabase/migrations/202607230002_online_uat_rls.sql`: workspace and role policies.
- `supabase/migrations/202607230003_online_uat_rpc.sql`: atomic game, lifecycle, and lock operations.
- `vercel.json`: SPA routing and security headers.
- `docs/UAT_DEPLOYMENT.md`: exact provisioning and smoke-test procedure.

---

### Task 1: Add Lifecycle Metadata and Local Service Rules

**Files:**
- Modify: `src/persistence/types.ts`
- Modify: `src/ui/BrowserUiShellService.ts`
- Test: `tests/browserGameLifecycle.test.ts`

**Interfaces:**
- Produces `UiGameLifecycleResult`.
- Produces `finalizeGame(scoreSheetId, actorId, nowIso?)` and `reopenGame(scoreSheetId, actorId, nowIso?)`.
- Adds optional `finalizedAtIso`, `finalizedBy`, and immutable lifecycle audit records to persisted score sheets.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('rejects finalization before round 18', () => {
  const result = shell.finalizeGame(sheet.id, 'tester-1', '2026-07-23T10:00:00.000Z');
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /18 saved rounds/i);
});

it('finalizes, blocks writes, and reopens without changing rounds', () => {
  const finalized = shell.finalizeGame(eighteenRoundSheet.id, 'tester-1', now);
  assert.equal(finalized.scoreSheet?.status, 'finalized');
  assert.equal(shell.saveRound(eighteenRoundSheet.id, round19).valid, false);
  const reopened = shell.reopenGame(eighteenRoundSheet.id, 'admin-1', later);
  assert.equal(reopened.scoreSheet?.status, 'draft');
  assert.equal(reopened.scoreSheet?.gameInput.rounds.length, 18);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:engine -- tests/browserGameLifecycle.test.ts`

Expected: compilation/test failure because lifecycle methods and metadata do not exist.

- [ ] **Step 3: Implement minimal lifecycle behavior**

Use immutable audit entries:

```ts
export interface GameLifecycleAuditRecord {
  readonly action: 'game.finalized' | 'game.reopened';
  readonly actorId: string;
  readonly occurredAtIso: string;
}
```

`finalizeGame` validates `draft` and at least 18 rounds, saves `finalized`, and appends the audit record. `reopenGame` validates `finalized`, saves `draft`, clears current finalization fields, and appends the audit record. `saveRound` and `overrideRoundScores` reject `finalized` sheets.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `npm run ci`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/types.ts src/ui/BrowserUiShellService.ts tests/browserGameLifecycle.test.ts
git commit -m "feat: add game lifecycle rules"
```

### Task 2: Render Approved Game Card Metadata and Status Copy

**Files:**
- Modify: `src/ui/BrowserUiShellService.ts`
- Modify: `src/app/screens/HomeScreen.tsx`
- Modify: `src/app/i18n/translations.ts`
- Test: `src/app/screens/HomeScreen.test.tsx`

**Interfaces:**
- `UiSessionHistoryItem` exposes `createdAtIso` and `createdAtLabel`.
- `formatGameStatus('draft')` returns `In progress`; `formatGameStatus('finalized')` returns `Completed`.
- Creation label uses `Created 23 Jul 2026, 1:42 PM`-style local formatting.

- [ ] **Step 1: Write failing card tests**

```tsx
expect(screen.getByText('In progress')).toBeInTheDocument();
expect(screen.getByText('Created 23 Jul 2026, 1:42 PM')).toBeInTheDocument();
expect(screen.queryByText('draft')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:app -- --run src/app/screens/HomeScreen.test.tsx`

Expected: FAIL because the card displays raw status and no creation timestamp.

- [ ] **Step 3: Implement labels and metadata**

Map `createdAtIso` from repository metadata, format it with `Intl.DateTimeFormat`, and render the approved labels.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:app -- --run src/app/screens/HomeScreen.test.tsx && npm run ci`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/BrowserUiShellService.ts src/app/screens/HomeScreen.tsx src/app/i18n/translations.ts src/app/screens/HomeScreen.test.tsx
git commit -m "feat: show game lifecycle metadata"
```

### Task 3: Add Round 18 Confirmation and Completed Read-Only UI

**Files:**
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.tsx`
- Create: `src/app/components/GameLifecycleDialog.tsx`
- Test: `src/app/screens/ScoreSheetLifecycleScreen.test.tsx`

**Interfaces:**
- Shell calls are `Awaitable<T>` so local values and Supabase promises share one port.
- Round 18 successful save opens a finish suggestion.
- Header shows **Finish Game** after 18 rounds and **Reopen Game** when completed.

- [ ] **Step 1: Write failing screen tests**

```tsx
await user.click(screen.getByRole('button', { name: /save round/i }));
expect(await screen.findByRole('dialog', { name: /round 18 completed/i })).toBeVisible();
await user.click(screen.getByRole('button', { name: /continue playing/i }));
expect(screen.getByText(/round 19/i)).toBeVisible();
```

Also verify Completed hides current-round entry and score-edit actions until reopening.

- [ ] **Step 2: Verify RED**

Run: `npm run test:app -- --run src/app/screens/ScoreSheetLifecycleScreen.test.tsx`

Expected: FAIL because lifecycle UI does not exist.

- [ ] **Step 3: Implement minimal confirmed transitions**

Use a focused dialog component with `Finish Game`, `Continue Playing`, `Reopen Game`, and `Cancel`. Await writes, refresh only after success, and keep status unchanged on errors.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:app -- --run src/app/screens/ScoreSheetLifecycleScreen.test.tsx && npm run ci`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/AppContext.tsx src/app/screens/ScoreSheetScreen.tsx src/app/components/GameLifecycleDialog.tsx src/app/screens/ScoreSheetLifecycleScreen.test.tsx
git commit -m "feat: add confirmed game lifecycle UI"
```

### Task 4: Complete Invite-Only Authentication Routing

**Files:**
- Create: `src/app/screens/SignInScreen.tsx`
- Create: `src/app/components/UserSessionMenu.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/appTypes.ts`
- Modify: `src/app/services/createBrowserServices.ts`
- Test: `src/app/screens/SignInScreen.test.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Online configuration creates `AuthService` and Supabase-backed application services.
- Unauthenticated online users see only sign-in.
- Local development without complete UAT variables retains browser-local behavior.

- [ ] **Step 1: Write failing auth routing tests**

```tsx
expect(await screen.findByRole('heading', { name: /sign in/i })).toBeVisible();
await user.type(screen.getByLabelText(/email/i), 'tester@example.com');
await user.type(screen.getByLabelText(/password/i), 'secret');
await user.click(screen.getByRole('button', { name: /sign in/i }));
expect(await screen.findByText('tester@example.com')).toBeVisible();
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:app -- --run src/app/screens/SignInScreen.test.tsx src/app/App.test.tsx`

Expected: FAIL because authenticated routing is absent.

- [ ] **Step 3: Implement auth bootstrap and sign-out**

Resolve session once, load workspace membership, expose user/role in context, and return to sign-in after successful sign-out.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:app -- --run src/app/screens/SignInScreen.test.tsx src/app/App.test.tsx && npm run ci`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/SignInScreen.tsx src/app/components/UserSessionMenu.tsx src/app/App.tsx src/app/AppContext.tsx src/app/appTypes.ts src/app/services/createBrowserServices.ts src/app/screens/SignInScreen.test.tsx src/app/App.test.tsx
git commit -m "feat: add invite-only UAT sign in"
```

### Task 5: Implement Shared Player and Game Services

**Files:**
- Create: `src/online/players/PlayerDirectoryService.ts`
- Create: `src/online/games/types.ts`
- Create: `src/online/games/OnlineGameService.ts`
- Create: `src/online/games/onlineGameMapper.ts`
- Test: `src/online/players/PlayerDirectoryService.test.ts`
- Test: `src/online/games/OnlineGameService.test.ts`

**Interfaces:**
- Player service supports active list/search/create and Admin rename/archive/restore.
- Game service implements history, create, open, save round, override, finalize, and reopen.
- Failed Supabase writes return `valid: false`; no optimistic success is reported.

- [ ] **Step 1: Write failing service tests**

Cover normalized duplicates, archived filtering, duplicate game names with distinct IDs, empty online start, score-integrity mapping, failed transactions, finalize, and reopen.

- [ ] **Step 2: Verify RED**

Run: `npm run test:app -- --run src/online/players/PlayerDirectoryService.test.ts src/online/games/OnlineGameService.test.ts`

Expected: FAIL because services are absent.

- [ ] **Step 3: Implement minimal Supabase services**

Use public anonymous client with authenticated JWT, workspace-scoped queries, and RPC calls for transactional writes.

- [ ] **Step 4: Verify GREEN**

Run focused tests, engine regressions, and `npm run ci`.

- [ ] **Step 5: Commit**

```bash
git add src/online/players/PlayerDirectoryService.ts src/online/games src/online/players/PlayerDirectoryService.test.ts
git commit -m "feat: persist shared UAT games online"
```

### Task 6: Add Transactional RPC, RLS, and Editing Locks

**Files:**
- Modify: `supabase/migrations/202607230001_online_uat_schema.sql`
- Modify: `supabase/migrations/202607230002_online_uat_rls.sql`
- Create: `supabase/migrations/202607230003_online_uat_rpc.sql`
- Create: `src/online/locks/GameLockService.ts`
- Test: `tests/onlineUatLifecycleSchema.test.ts`
- Test: `src/online/locks/GameLockService.test.ts`

**Interfaces:**
- Database status values are `draft` and `finalized`.
- RPCs atomically save rounds, finalize, reopen, acquire/heartbeat/release locks, and audit each transition.
- Lifecycle and score writes verify active lock ownership.

- [ ] **Step 1: Write failing SQL and lock tests**

Assert lifecycle columns/functions, completed-write guards, 15-minute lock expiry, actor attribution, and fixed security-definer `search_path`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/onlineUatLifecycleSchema.test.ts && npm run test:app -- --run src/online/locks/GameLockService.test.ts`

- [ ] **Step 3: Implement migrations and lock service**

Use optimistic game `version`, authenticated `auth.uid()`, one database transaction per write, and immutable audit events.

- [ ] **Step 4: Verify GREEN**

Run focused tests and `npm run ci`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations src/online/locks tests/onlineUatLifecycleSchema.test.ts
git commit -m "feat: secure online lifecycle and locks"
```

### Task 7: Configure Vercel and UAT Operations

**Files:**
- Create: `vercel.json`
- Create: `docs/UAT_DEPLOYMENT.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.superpowers/sdd/progress.md`
- Test: `tests/deploymentConfiguration.test.ts`

**Interfaces:**
- SPA fallback routes to `/index.html`.
- Security headers are defined.
- CI runs typecheck, engine tests, UI tests, SQL static checks, and production build.

- [ ] **Step 1: Write failing deployment tests**

Assert the Vercel rewrite, browser-safe environment names, no service-role secret, required migration files, and documented bootstrap/smoke-test steps.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/deploymentConfiguration.test.ts`

- [ ] **Step 3: Add configuration and runbook**

Document Supabase creation, disabled sign-up, migrations, first Admin bootstrap, invitation flow, Vercel variables, smoke test, rollback, and lock recovery.

- [ ] **Step 4: Verify GREEN**

Run: `npm run ci`.

- [ ] **Step 5: Commit**

```bash
git add vercel.json docs/UAT_DEPLOYMENT.md .github/workflows/ci.yml .superpowers/sdd/progress.md tests/deploymentConfiguration.test.ts
git commit -m "chore: prepare online UAT deployment"
```

### Task 8: Provision and Smoke-Test UAT

**External prerequisites:** User-owned Supabase and Vercel projects or delegated credentials.

- [ ] Create/select Supabase project and disable public sign-up.
- [ ] Apply all migrations.
- [ ] Bootstrap the first Admin without storing credentials in Git.
- [ ] Connect the feature branch to Vercel.
- [ ] Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_UAT_WORKSPACE_SLUG`.
- [ ] Deploy and verify HTTPS.
- [ ] Invite and verify one Tester.
- [ ] Smoke-test shared player creation, duplicate game names, Round 18 suggestion, continue to Round 19, finalization, completed read-only behavior, reopening, all-loser carry, override audit, lock conflict, and Admin force-release.
- [ ] Record the non-secret URL and verification date in `docs/UAT_DEPLOYMENT.md`.

## Final Verification

- [ ] `npm run ci` passes at the final branch head.
- [ ] Browser-local games remain unchanged without UAT variables.
- [ ] Online UAT starts empty and uses Supabase only with complete configuration.
- [ ] No service-role secret appears in source, compiled assets, logs, or documentation.
- [ ] Admin and Tester permissions match the approved specification.
- [ ] CI and UAT smoke-test evidence are attached to draft PR #11.
- [ ] PR remains draft and unmerged until explicit approval.