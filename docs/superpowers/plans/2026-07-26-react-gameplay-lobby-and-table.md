# React Gameplay Lobby and Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated React experience for discovering, creating, joining, and starting online Estimation tables, followed by a read-only active-game continuity shell that consumes authoritative snapshots.

**Architecture:** Extend the existing reducer-based application navigation with gameplay-specific routes and one active table identifier. Add narrow application ports for table and active-control operations, implemented by the existing typed Supabase services only after authentication. Screens remain projection-driven: they render `OnlineGameplayLobbyCard`, `OnlineGameplayTableSnapshot`, and `OnlineActiveGameControlSnapshot` values and never write Supabase rows directly.

**Tech Stack:** React 19, TypeScript 5.5+, Vitest, Testing Library, existing `OnlineGameplayTableService`, existing `ActiveGameControlService`, existing Supabase browser client.

## Global Constraints

- Keep `feature/online-game-bot-mvp` isolated and PR #14 draft; do not merge to `main`.
- House Rules V1 only.
- Public and private tables are supported.
- Public joining supports `open` and `approval-required` policies.
- Start fills vacant seats with permanent Standard bots through the authoritative RPC.
- Timers are limited to `20 | 30 | 45 | 60 | 90` seconds.
- Disconnect grace is limited to `30 | 60 | 90 | 120` seconds.
- UI never reads or displays hidden cards, shuffle seeds, service-role credentials, or raw Realtime row payloads.
- Failed mutations display server errors and reload the authoritative snapshot before another mutation.
- English and Arabic labels are added together.
- Every production change follows RED/GREEN TDD and full `npm run ci` verification.

---

### Task 1: Gameplay Navigation and Authenticated Service Wiring

**Files:**
- Modify: `src/app/appTypes.ts`
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/services/createBrowserServices.ts`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `OnlineGameplayTableService`, `ActiveGameControlService`, `AuthSessionState`.
- Produces: `GameplayTablePort`, `ActiveGameControlPort`, `openGameplayTable(tableId)`, and routes `gameplay-lobby`, `gameplay-table`, `active-game`.

- [ ] **Step 1: Write the failing navigation/service test**

Add a test that authenticates, verifies the authenticated session factory exposes gameplay services, clicks `Play online`, and observes the `Online tables` heading. Add a reducer test through the rendered app that opening table `table-1` renders the waiting-room route.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/app/App.test.tsx`

Expected: FAIL because gameplay routes, ports, and button do not exist.

- [ ] **Step 3: Implement the minimal route and service boundary**

Use these route/state contracts:

```ts
export type AppRoute =
  | 'home'
  | 'new-game'
  | 'score-sheet'
  | 'gameplay-lobby'
  | 'gameplay-table'
  | 'active-game';

export interface AppState {
  readonly route: AppRoute;
  readonly activeScoreSheetId?: string;
  readonly activeGameplayTableId?: string;
}
```

Add application ports matching the existing typed service methods used by the screens. Instantiate `OnlineGameplayTableService` and `ActiveGameControlService` inside `onlineSessionFactory` with the authenticated session.

- [ ] **Step 4: Run focused and full verification**

Run: `npx vitest run src/app/App.test.tsx && npm run ci`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/appTypes.ts src/app/AppContext.tsx src/app/App.tsx src/app/services/createBrowserServices.ts src/app/App.test.tsx
git commit -m "feat: wire gameplay routes and authenticated services"
```

### Task 2: Public Lobby and Table Creation

**Files:**
- Create: `src/app/screens/GameplayLobbyScreen.tsx`
- Create: `src/app/screens/GameplayLobbyScreen.test.tsx`
- Modify: `src/app/screens/HomeScreen.tsx`
- Modify: `src/app/screens/HomeScreen.test.tsx`
- Modify: `src/app/i18n/translations.ts`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes: `GameplayTablePort.listLobby()` and `GameplayTablePort.createTable(input)`.
- Produces: public lobby cards, create-table form, refresh action, and navigation to a created/opened table.

- [ ] **Step 1: Write failing lobby tests**

Cover these behaviors with real rendered components:

```ts
expect(await screen.findByText('Friday Majlis')).toBeVisible();
expect(screen.getByText('2 of 4 seats')).toBeVisible();
expect(screen.getByText('Host approval')).toBeVisible();
await user.click(screen.getByRole('button', { name: 'Create table' }));
expect(createTable).toHaveBeenCalledWith(expect.objectContaining({
  visibility: 'private',
  joinPolicy: 'open',
  turnTimerSeconds: 45,
  disconnectGraceSeconds: 60,
}));
```

Also verify a lobby error is rendered with `role="alert"` and local-only mode does not show `Play online`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/app/screens/GameplayLobbyScreen.test.tsx src/app/screens/HomeScreen.test.tsx`

Expected: FAIL because the gameplay lobby screen and home entry point do not exist.

- [ ] **Step 3: Implement the minimal lobby**

Render only `lifecycle === 'lobby'` cards. Each card displays name, occupied seats, join policy, turn timer, and a single `Open table` action. The create form contains name, visibility, join policy, turn timer, and disconnect grace, generates a command ID with `crypto.randomUUID()`, and opens the returned table snapshot.

- [ ] **Step 4: Run focused and full verification**

Run: `npx vitest run src/app/screens/GameplayLobbyScreen.test.tsx src/app/screens/HomeScreen.test.tsx && npm run ci`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/GameplayLobbyScreen.tsx src/app/screens/GameplayLobbyScreen.test.tsx src/app/screens/HomeScreen.tsx src/app/screens/HomeScreen.test.tsx src/app/i18n/translations.ts src/app/styles/app.css
git commit -m "feat: add online gameplay lobby"
```

### Task 3: Waiting Room, Join Flow, and Host Controls

**Files:**
- Create: `src/app/screens/GameplayTableScreen.tsx`
- Create: `src/app/screens/GameplayTableScreen.test.tsx`
- Create: `src/app/components/GameplaySeatGrid.tsx`
- Modify: `src/app/i18n/translations.ts`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes: `openTable`, `joinTable`, `requestJoin`, `respondJoinRequest`, `updateSettings`, `leaveTable`, and `startTable`.
- Produces: four-seat waiting room, open/approval join actions, pending-request host decisions, locked settings state, and transition to `active-game` after Start.

- [ ] **Step 1: Write failing waiting-room tests**

Test host and guest projections separately. Required assertions include four seat positions, bot labels, host-only settings, pending request Accept/Reject buttons, Start disabled while a request is pending, and `startTable(tableId, version, commandId)` navigation when successful.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/app/screens/GameplayTableScreen.test.tsx`

Expected: FAIL because the waiting-room screen does not exist.

- [ ] **Step 3: Implement the waiting room**

Determine host authority using `snapshot.hostUserId === session.user.id`. Never infer authority from UI state. All mutations use the current snapshot version and replace local state only with the returned authoritative snapshot.

- [ ] **Step 4: Run focused and full verification**

Run: `npx vitest run src/app/screens/GameplayTableScreen.test.tsx && npm run ci`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/GameplayTableScreen.tsx src/app/screens/GameplayTableScreen.test.tsx src/app/components/GameplaySeatGrid.tsx src/app/i18n/translations.ts src/app/styles/app.css
git commit -m "feat: add gameplay waiting room"
```

### Task 4: Active-Game Continuity Shell

**Files:**
- Create: `src/app/screens/ActiveGameplayScreen.tsx`
- Create: `src/app/screens/ActiveGameplayScreen.test.tsx`
- Create: `src/app/components/ActiveSeatStatus.tsx`
- Modify: `src/app/i18n/translations.ts`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes: `ActiveGameControlPort.getSnapshot`, `pause`, `resume`, `terminate`, and `ActiveGameRealtimeSynchronizer` invalidations.
- Produces: authoritative lifecycle banner, current-turn countdown projection, seat connection/control indicators, host controls, and explicit termination confirmation.

- [ ] **Step 1: Write failing active-shell tests**

Test connected, disconnected-grace, temporary-bot, reclaim-pending, paused, and terminated states. Verify only the host sees Pause/Resume/Close controls and that closing requires a checked confirmation before calling `terminate(..., true, ...)`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/app/screens/ActiveGameplayScreen.test.tsx`

Expected: FAIL because the active-game screen does not exist.

- [ ] **Step 3: Implement projection-only active shell**

Use snapshot deadlines for display only. Do not submit bids/cards in this task. Realtime callbacks trigger `getSnapshot(tableId)`; raw payload content is ignored.

- [ ] **Step 4: Run focused and full verification**

Run: `npx vitest run src/app/screens/ActiveGameplayScreen.test.tsx && npm run ci`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/ActiveGameplayScreen.tsx src/app/screens/ActiveGameplayScreen.test.tsx src/app/components/ActiveSeatStatus.tsx src/app/i18n/translations.ts src/app/styles/app.css
git commit -m "feat: add active gameplay continuity shell"
```

### Task 5: Responsive Accessibility and Delivery Record

**Files:**
- Modify: `src/app/styles/app.css`
- Modify: `src/app/App.test.tsx`
- Create: `docs/superpowers/reports/2026-07-26-react-gameplay-lobby-and-table-delivery.md`
- Modify: `docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md`
- Modify: PR #14 body

**Interfaces:**
- Consumes: all gameplay screens from Tasks 1–4.
- Produces: keyboard-accessible, mobile-responsive gameplay navigation and an auditable delivery checkpoint.

- [ ] **Step 1: Add failing accessibility/responsive tests**

Verify unique headings, labelled form controls, alert semantics, keyboard-operable actions, no portrait landscape gate outside card play, and no hidden-information fields in rendered snapshots.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/app/App.test.tsx src/app/screens/GameplayLobbyScreen.test.tsx src/app/screens/GameplayTableScreen.test.tsx src/app/screens/ActiveGameplayScreen.test.tsx`

Expected: FAIL on at least one missing accessibility or responsive behavior.

- [ ] **Step 3: Implement minimal accessibility/style corrections**

Use semantic sections, headings, labels, buttons, status text, and `role="alert"`. Add responsive grid breakpoints without introducing a UI framework dependency.

- [ ] **Step 4: Run final verification**

Run: `npm run ci`

Expected: typecheck PASS, all engine/UI tests PASS, production build PASS.

- [ ] **Step 5: Record delivery**

Document CI run numbers, unresolved live-Supabase limitations, current overall percentage, and the next active-game bidding/card-play plan. Keep PR #14 draft and explicitly marked `Do not merge`.
