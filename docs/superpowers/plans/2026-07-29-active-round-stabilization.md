# Unified Active-Round Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task by task, and
> `superpowers:test-driven-development` for every behavior change.

**Goal:** Deliver one authoritative active-round experience and explicit,
secure, host-controlled next-round progression without changing House Rules V1
or exposing private game state.

**Architecture:** A pure `ActiveRoundPresentation` combines the independently
authoritative active-control and gameplay-round snapshots. It exposes actions
only when their table, phase, seat, action, version, and deterministic turn ID
are compatible. A new authenticated Edge Function action calls one additive,
service-role-only transactional RPC to replace a scored private aggregate and
start its first bid turn atomically.

**Tech stack:** TypeScript, React, Vitest/Testing Library, Node test runner,
Supabase Edge Functions/Postgres/Realtime, pgTAP-compatible Supabase database
tests, Vite, CSS.

**Design reference:**
`docs/superpowers/specs/2026-07-29-active-round-stabilization-design.md`

This is the consolidated executable plan. It supersedes
`docs/superpowers/plans/2026-07-28-bidding-hand-visibility.md`; do not execute
the older hand-only plan separately.

## Global constraints

- Work only in `C:\Users\rjamm\estimation-gameplay-uat` on
  `feature/online-game-bot-mvp`.
- Keep PR #14 draft, open, and unmerged.
- Do not touch the score-UAT checkout, the score-calculator Supabase project
  (`lexewcehptnmikwfizhj`), or the separate
  `fix/uat-round-2-findings` worktree.
- Do not mutate or reuse any preserved hosted UAT table.
- Never print or persist credentials, tokens, connection strings, service-role
  keys, seeds, nonces, deck order, private aggregates, or another seat's cards.
- Keep JWT verification enabled. Never use `--no-verify-jwt`.
- Preserve `HumanActionBoundaryCoordinator`; bid/card commands must still cross
  the deployed human-action boundary.
- Do not change House Rules V1 scoring, Risk formulas, the four-bids-not-13
  invariant, or first-round behavior.
- Never deploy from the repository root. Database, Function, and Vercel changes
  use isolated guarded wrappers only.
- Do not perform any hosted mutation or deployment without a fresh, explicit
  user approval at the deployment gate.
- For every behavior task: write a test that names a real break, run it and
  observe the expected failure, make the minimum implementation, rerun it to
  green, then refactor. Hand-derive expected values and test real components or
  boundaries rather than mock existence or source text.

## Task 1: Add the pure presentation compatibility boundary

**Files:**

- Create: `src/app/gameplay/ActiveRoundPresentation.ts`
- Create: `src/app/gameplay/ActiveRoundPresentation.test.ts`
- Modify: `src/online/gameplay/roundTypes.ts`
- Modify: `src/gameplay/GameplayRoundSnapshotProjector.ts`
- Modify: `tests/gameplayRoundSnapshotProjection.test.ts`

### RED

- [ ] Add projector tests proving the public snapshot identifies the established
      sequence Risk seat from `bidOrder`, while the fixture contains only the
      requested viewer's `ownHand`.
- [ ] Add literal-fixture presentation tests for:
  - loading with a missing snapshot;
  - compatible bidding and playing pairs;
  - exact turn-ID mismatch despite the same seat/action;
  - active seat/action mismatch;
  - scored round with no pending turn;
  - scored round with a stale pending turn;
  - paused compatible turn using frozen remaining time;
  - terminated lifecycle never actionable;
  - human viewer turn versus bot turn;
  - connected, disconnected, permanent-bot, and temporary-bot control state
    carried by seat without changing action ownership;
  - countdown rounding at 10,001 ms, 10,000 ms, 1 ms, and expired;
  - seat-mapped estimates, separate caller/estimate/trump;
  - partial and complete Under/Over totals and distance from 13;
  - pending and scored Risk context;
  - last completed trick selection after trick 13;
  - host and non-host next-round availability.
- [ ] Use literal expected turn IDs such as
      `round-2:card:107:3`; do not call the production turn-ID builder from the
      expectation.

Run:

```powershell
npx vitest run src/app/gameplay/ActiveRoundPresentation.test.ts
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayRoundSnapshotProjection.test.js
```

Expected RED: the presentation module and explicit Risk-seat projection do not
exist.

### GREEN

- [ ] Add the public Risk-seat field to the round snapshot type and projector.
      Derive it from the aggregate's established bid order; do not recompute
      scoring.
- [ ] Implement `createActiveRoundPresentation` as a pure function.
- [ ] Use the existing deterministic binding
      `round-{roundNumber}:{actionKind}:{roundVersion}:{seat}`.
- [ ] Return `isSynchronizing: true` and no actionable controls for every
      incompatible pair.
- [ ] Calculate a countdown from active-control deadline/current time, or frozen
      `remainingMs` while paused.
- [ ] Derive all public bid/status/result values from the round snapshot and all
      action/control values from active control.
- [ ] Ensure the presentation type can only contain `ownHand`, not seat-indexed
      hands.

Run the two RED commands again. Expected GREEN: both pass.

### REFACTOR AND COMMIT

- [ ] Run:

```powershell
npm run typecheck
npx vitest run src/app/gameplay/ActiveRoundPresentation.test.ts
npm run test:engine
```

- [ ] Mutation-check the tests by considering wrong action kind, omitted exact
      turn ID, wrong Risk seat, and off-by-one countdown.
- [ ] Commit:

```powershell
git add src/app/gameplay/ActiveRoundPresentation.ts src/app/gameplay/ActiveRoundPresentation.test.ts src/online/gameplay/roundTypes.ts src/gameplay/GameplayRoundSnapshotProjector.ts tests/gameplayRoundSnapshotProjection.test.ts
git commit -m "test: define unified active-round presentation"
```

## Task 2: Build the focused read-only/action UI components

**Files:**

- Create: `src/app/components/GameplayActionBanner.tsx`
- Create: `src/app/components/GameplayActionBanner.test.tsx`
- Create: `src/app/components/GameplayRoundStatus.tsx`
- Create: `src/app/components/GameplayRoundStatus.test.tsx`
- Create: `src/app/components/GameplayHand.tsx`
- Create: `src/app/components/GameplayHand.test.tsx`
- Modify: `src/app/components/GameplayBidPanel.tsx`
- Modify: `src/app/components/GameplayCardPanel.tsx`
- Create: `src/app/components/GameplayBidPanel.test.tsx`
- Modify: `src/app/components/GameplayCardPanel.test.tsx`
- Modify: `src/app/i18n/translations.ts`
- Modify: `src/app/styles/gameplay.css`

### RED

- [ ] Add banner tests proving exactly one status region is rendered for each
      presentation state, the viewer-action copy is visibly distinct, and the
      countdown is present when applicable.
- [ ] Add round-status tests proving:
  - each estimate is within the correct seat item;
  - the viewer marker is unambiguous;
  - caller and trump do not share the numeric-estimate value;
  - total, Under/Over distance, and Risk remain visible in bidding and playing;
  - an interim total of 13 does not claim that the four-estimate contract is
    valid.
- [ ] Add hand tests proving:
  - 13 read-only cards render during bidding;
  - read-only cards are not buttons;
  - during play, only the literal legal card IDs are enabled;
  - synchronizing, paused, and non-viewer turns disable all card actions;
  - the props cannot supply another player's hand.
- [ ] Update bid/card panel tests to require that those panels emit no competing
      `role="status"` turn/waiting instruction.

Run:

```powershell
npx vitest run src/app/components/GameplayActionBanner.test.tsx src/app/components/GameplayRoundStatus.test.tsx src/app/components/GameplayHand.test.tsx src/app/components/GameplayBidPanel.test.tsx src/app/components/GameplayCardPanel.test.tsx
```

Expected RED: the focused components are absent and the current panels still
derive independent instructions.

### GREEN

- [ ] Implement the banner from presentation props only.
- [ ] Implement status as a semantic seat list with caller, trump, total,
      Under/Over distance, and Risk in distinct labelled fields.
- [ ] Implement a shared hand component whose API accepts only `ownHand`,
      `legalCardIds`, explicit interaction mode, and the play callback.
- [ ] Render the hand in bidding as full-opacity, read-only cards.
- [ ] Refactor bid/card panels so the parent provides enabled/action state. Remove
      their turn/waiting/round-scored status regions.
- [ ] Add matching English and Arabic translation keys.
- [ ] Add only scoped responsive CSS; retain the existing visual system.

Run the RED command again. Expected GREEN: all focused component tests pass.

### REFACTOR AND COMMIT

- [ ] Verify keyboard focus includes only actionable cards and the estimate
      submit control.
- [ ] Run:

```powershell
npm run typecheck:app
npx vitest run src/app/components
```

- [ ] Commit:

```powershell
git add src/app/components/GameplayActionBanner.tsx src/app/components/GameplayActionBanner.test.tsx src/app/components/GameplayRoundStatus.tsx src/app/components/GameplayRoundStatus.test.tsx src/app/components/GameplayHand.tsx src/app/components/GameplayHand.test.tsx src/app/components/GameplayBidPanel.tsx src/app/components/GameplayCardPanel.tsx src/app/components/GameplayBidPanel.test.tsx src/app/components/GameplayCardPanel.test.tsx src/app/i18n/translations.ts src/app/styles/gameplay.css
git commit -m "feat: add authoritative round action and status UI"
```

## Task 3: Preserve trick 13 and improve scored results

**Files:**

- Create: `src/app/components/GameplayFinalTrick.tsx`
- Create: `src/app/components/GameplayFinalTrick.test.tsx`
- Modify: `src/app/components/GameplayRoundResultPanel.tsx`
- Modify: `src/app/components/GameplayRoundResultPanel.test.tsx`
- Modify: `src/app/components/GameplayCardPanel.tsx`
- Modify: `src/app/components/GameplayCardPanel.test.tsx`
- Modify: `src/app/i18n/translations.ts`
- Modify: `src/app/styles/gameplay.css`

### RED

- [ ] Add a scored fixture with `currentTrick: []` and 13 completed tricks.
- [ ] Assert trick 13's four literal seat/card associations and winner remain
      visible.
- [ ] Assert “Waiting for the opening card.” is absent in the scored state.
- [ ] Replace table-structure assertions with user-visible result assertions for
      four responsive seat result items containing estimate, actual, outcome,
      score, and Risk.
- [ ] Assert the caller and viewer labels and round summary are visible.

Run:

```powershell
npx vitest run src/app/components/GameplayFinalTrick.test.tsx src/app/components/GameplayCardPanel.test.tsx src/app/components/GameplayRoundResultPanel.test.tsx
```

Expected RED: the scored panel still follows cleared `currentTrick`, and results
use the old wide table.

### GREEN

- [ ] Implement `GameplayFinalTrick` from the presentation's
      `lastCompletedTrick`.
- [ ] Render current-trick empty copy only during active card play.
- [ ] Render the final trick before scored results.
- [ ] Convert the result table to a semantic responsive seat-card list with a
      concise result/multiplier summary.
- [ ] Add translations and scoped responsive CSS.

Run the RED command again. Expected GREEN: all scored-state tests pass.

### REFACTOR AND COMMIT

- [ ] Check 320 px layout in the component test viewport and ensure all values
      have visible labels rather than relying on column position.
- [ ] Run:

```powershell
npm run typecheck:app
npx vitest run src/app/components/GameplayFinalTrick.test.tsx src/app/components/GameplayCardPanel.test.tsx src/app/components/GameplayRoundResultPanel.test.tsx
```

- [ ] Commit:

```powershell
git add src/app/components/GameplayFinalTrick.tsx src/app/components/GameplayFinalTrick.test.tsx src/app/components/GameplayRoundResultPanel.tsx src/app/components/GameplayRoundResultPanel.test.tsx src/app/components/GameplayCardPanel.tsx src/app/components/GameplayCardPanel.test.tsx src/app/i18n/translations.ts src/app/styles/gameplay.css
git commit -m "feat: retain final trick and clarify round results"
```

## Task 4: Integrate the coordinator into the active screen

**Files:**

- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Modify: `src/app/screens/ActiveGameplayScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayBiddingScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayCardPlayScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayBotDirectiveScreen.test.tsx`
- Modify: `src/app/styles/gameplay.css`

### RED

- [ ] Add integration tests proving:
  - only one status banner is rendered in a compatible human bid turn;
  - all 13 viewer cards remain visible and read-only during bidding;
  - a human card turn enables only projected legal cards;
  - an incompatible exact turn ID shows neutral synchronization and no enabled
    bid/card action;
  - incompatible state calls both authoritative refresh paths once per mismatch
    key, not on every render;
  - advancing fake timers decreases the visible countdown each second;
  - round Realtime arriving before active Realtime never exposes contradictory
    instructions;
  - active Realtime arriving before round Realtime behaves the same;
  - a compatible pair resumes controls;
  - scored reconnect restores final trick and results;
  - a bot turn remains non-actionable and continues through the existing bot
    coordinator.
- [ ] Retain an explicit test that bid/card submission still invokes the existing
      human-action-boundary completion path.

Run:

```powershell
npx vitest run src/app/screens/ActiveGameplayScreen.test.tsx src/app/screens/ActiveGameplayBiddingScreen.test.tsx src/app/screens/ActiveGameplayCardPlayScreen.test.tsx src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx src/app/screens/ActiveGameplayBotDirectiveScreen.test.tsx
```

Expected RED: the screen renders both snapshot-derived instructions and has no
compatibility refresh or ticking clock.

### GREEN

- [ ] Build the presentation with the two snapshots, viewer ID, and current
      time.
- [ ] Replace the current active-turn block with `GameplayActionBanner`.
- [ ] Render status, bid, card, final-trick, and result components from the
      presentation.
- [ ] Add a one-second local display clock while an active deadline exists.
      Clean up the timer on phase change/unmount; never use it to submit a
      command.
- [ ] Add a deduplicated incompatibility effect that refreshes active control
      and round state together. Keep error text privacy-safe.
- [ ] Keep the two existing Realtime synchronizers; do not combine or bypass
      them.
- [ ] Keep human and bot coordinators wired to the same command boundaries.

Run the RED command again. Expected GREEN: the screen integration suite passes.

### REFACTOR AND COMMIT

- [ ] Search rendered component code for any second turn/waiting derivation and
      remove it.
- [ ] Run:

```powershell
npm run typecheck:app
npx vitest run src/app/screens/ActiveGameplayScreen.test.tsx src/app/screens/ActiveGameplayBiddingScreen.test.tsx src/app/screens/ActiveGameplayCardPlayScreen.test.tsx src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx src/app/screens/ActiveGameplayBotDirectiveScreen.test.tsx
```

- [ ] Commit:

```powershell
git add src/app/screens/ActiveGameplayScreen.tsx src/app/screens/ActiveGameplayScreen.test.tsx src/app/screens/ActiveGameplayBiddingScreen.test.tsx src/app/screens/ActiveGameplayCardPlayScreen.test.tsx src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx src/app/screens/ActiveGameplayBotDirectiveScreen.test.tsx src/app/styles/gameplay.css
git commit -m "feat: coordinate active gameplay projections"
```

## Task 5: Extend the existing bootstrap for subsequent rounds

**Files:**

- Modify: `src/gameplay/session/GameplaySessionBootstrapService.ts`
- Modify: `src/gameplay/types.ts`
- Modify: `tests/gameplaySessionBootstrapService.test.ts`

### RED

- [ ] Add hand-derived fixtures proving:
  - round 1 still uses the supplied random source exactly as before;
  - a subsequent round can select explicit dealer/caller seat 1 after previous
    seat 0;
  - bid order and first lead follow the existing bootstrap mapping;
  - round number increments;
  - prior `nextRoundMultiplier` becomes the new `roundMultiplier`;
  - a new 52-card deal validates with 13 cards per seat;
  - invalid dealer or multiplier input is rejected.

Run:

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplaySessionBootstrapService.test.js
```

Expected RED: the bootstrap has no explicit subsequent-round input.

### GREEN

- [ ] Extend bootstrap input with explicit subsequent-round dealer, round number,
      and multiplier.
- [ ] Route both random first-round and explicit next-round cases through one
      order/deal initializer.
- [ ] Keep secure random generation outside the domain service; the service
      consumes a provided random source and does not log it.
- [ ] Do not change engine scoring or legal-estimate behavior.

Run the RED command again. Expected GREEN: bootstrap tests pass.

### REFACTOR AND COMMIT

- [ ] Run:

```powershell
npm run typecheck:engine
npm run test:engine
```

- [ ] Commit:

```powershell
git add src/gameplay/session/GameplaySessionBootstrapService.ts src/gameplay/types.ts tests/gameplaySessionBootstrapService.test.ts
git commit -m "feat: bootstrap secure subsequent gameplay rounds"
```

## Task 6: Add the atomic, idempotent next-round transaction

**Files:**

- Create:
  `supabase/migrations/202607290011_active_round_next_round.sql`
- Create:
  `supabase-gameplay/supabase/migrations/202607290011_active_round_next_round.sql`
- Create:
  `supabase-gameplay/supabase/tests/active_round_next_round.sql`
- Modify: `tests/gameplayStartRpcContract.test.ts`
- Modify: `tests/gameplayDeploymentReadiness.test.ts`
- Modify: `tests/gameplaySupabaseWorkspaceIsolation.test.ts`

### RED

- [ ] Add database behavior tests that seed only synthetic public-safe fixtures
      and exercise the real RPC:
  - service-role execution succeeds for a scored round with no active turn;
  - host/user roles cannot execute the private RPC directly;
  - the next round and first bid turn commit together;
  - round version is previous version plus one, not reset;
  - active-control version increments;
  - one round invalidation is emitted;
  - same command ID returns the committed transition and does not replace the
    committed private aggregate;
  - changed payload with a reused command ID is rejected;
  - stale round number/version/control version is rejected;
  - two concurrent expected-version attempts produce one commit;
  - non-scored, paused/terminated, and pending-turn states are rejected;
  - command/event ledger rows contain no deal, hand, seed, nonce, or aggregate
    fields.
- [ ] Add isolation tests requiring byte-identical root and isolated migration
      copies and the updated isolated migration inventory.
- [ ] Update the existing RPC contract coverage only for public function
      signature/privilege expectations; the real database test remains the
      primary transaction evidence.

Run:

```powershell
npx supabase --workdir supabase-gameplay start
npx supabase --workdir supabase-gameplay test db
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayStartRpcContract.test.js dist/tests/gameplayDeploymentReadiness.test.js dist/tests/gameplaySupabaseWorkspaceIsolation.test.js
```

Expected RED: the RPC/migration is absent.

If local Supabase cannot start because the required local runtime is
unavailable, record the exact command failure. Do not replace the database
behavior test with a source-text assertion; resolve the local runtime before
claiming this task green.

### GREEN

- [ ] Implement a `SECURITY DEFINER`, service-role-only RPC with a fixed
      `search_path`.
- [ ] Lock active control and private round state in a consistent order.
- [ ] Validate lifecycle, host actor, scored phase, absence of a pending turn,
      expected round number, expected round version, and expected control
      version.
- [ ] Resolve an already-committed identical command before consuming the
      retry's new private aggregate.
- [ ] Replace the aggregate, increment the monotonic round version, insert the
      invalidation, initialize the first bid turn, increment active-control
      version, and write privacy-safe command/event metadata in the same
      transaction.
- [ ] Revoke execution from `public`, `anon`, and `authenticated`; grant only to
      `service_role`.
- [ ] Keep root and isolated migration copies identical.

Run the RED commands again. Expected GREEN: real database behavior and isolation
tests pass.

### REFACTOR AND COMMIT

- [ ] Stop the local Supabase stack after the database suite:

```powershell
npx supabase --workdir supabase-gameplay stop
```

- [ ] Review every persisted JSON key and raised error for private-state
      leakage.
- [ ] Commit:

```powershell
git add supabase/migrations/202607290011_active_round_next_round.sql supabase-gameplay/supabase/migrations/202607290011_active_round_next_round.sql supabase-gameplay/supabase/tests/active_round_next_round.sql tests/gameplayStartRpcContract.test.ts tests/gameplayDeploymentReadiness.test.ts tests/gameplaySupabaseWorkspaceIsolation.test.ts
git commit -m "feat: transact idempotent next-round activation"
```

## Task 7: Add the authenticated next-round Edge command

**Files:**

- Modify: `supabase/functions/gameplay-round-command/index.ts`
- Create: `supabase/functions/gameplay-round-command/nextRoundHandler.ts`
- Modify:
  `supabase-gameplay/supabase/functions/gameplay-round-command/index.ts`
- Create:
  `supabase-gameplay/supabase/functions/gameplay-round-command/nextRoundHandler.ts`
- Create:
  `supabase-gameplay/supabase/functions/gameplay-round-command/nextRoundHandler.test.ts`
- Modify: `tests/gameplayBotDirectiveEdgeFunction.test.ts`
- Modify: `tests/gameplayHumanActionBoundaryEdgeFunction.test.ts`
- Create: `tests/gameplayNextRoundEdgeFunction.test.ts`

### RED

- [ ] Add boundary behavior tests for:
  - unauthenticated request rejected;
  - non-host request rejected;
  - host request accepted only for a scored current round;
  - request body contains expected public concurrency fields and command ID but
    no deal material;
  - the server rotates dealer/caller through the existing bootstrap service;
  - the score result's `nextRoundMultiplier` is carried forward;
  - a fresh cryptographic seed/deal ID/nonce is generated for a new command;
  - an identical retry returns the existing committed result rather than
    replacing it;
  - stale/concurrent RPC errors map to privacy-safe client errors;
  - the response is projected for the authenticated viewer only;
  - bid/card routes still invoke the current human-boundary coordinator;
  - bot command behavior remains unchanged.
- [ ] Exercise an extracted handler/application boundary with injected auth,
      random, repository, and RPC ports so assertions observe behavior. Do not
      make source-regex checks the primary evidence.

Run:

```powershell
deno test supabase-gameplay/supabase/functions/gameplay-round-command/nextRoundHandler.test.ts
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayNextRoundEdgeFunction.test.js dist/tests/gameplayHumanActionBoundaryEdgeFunction.test.js dist/tests/gameplayBotDirectiveEdgeFunction.test.js
```

Expected RED: `start-next-round` is not accepted.

### GREEN

- [ ] Put only the new next-round orchestration behind the injected handler
      boundary. Keep the proven bid, card, bot, and human-boundary paths in
      `index.ts` unchanged except for dispatching the new action.
- [ ] Add `start-next-round` to the authenticated command handler.
- [ ] Check the privacy-safe active command ledger before reading a scored
      aggregate. Return the current viewer projection for a committed matching
      retry.
- [ ] Read actor/table/scored state server-side and reject non-host actors.
- [ ] Generate fresh private deal inputs only in the server function.
- [ ] Call the extended bootstrap, validate the aggregate, then invoke the new
      RPC with optimistic concurrency values.
- [ ] Keep same-command retry idempotent and return only the viewer projection.
- [ ] Copy the reviewed function source to the isolated workspace and verify the
      two copies are identical.
- [ ] Leave JWT verification and human bid/card boundaries unchanged.

Run the RED command again. Expected GREEN: next-round and regression tests pass.

### REFACTOR AND COMMIT

- [ ] Search response/error/log construction for private fields and remove any
      payload interpolation.
- [ ] Run:

```powershell
npm run typecheck
npm run test:engine
npm run test:isolation-static
```

- [ ] Commit:

```powershell
git add supabase/functions/gameplay-round-command/index.ts supabase/functions/gameplay-round-command/nextRoundHandler.ts supabase-gameplay/supabase/functions/gameplay-round-command/index.ts supabase-gameplay/supabase/functions/gameplay-round-command/nextRoundHandler.ts supabase-gameplay/supabase/functions/gameplay-round-command/nextRoundHandler.test.ts tests/gameplayNextRoundEdgeFunction.test.ts tests/gameplayHumanActionBoundaryEdgeFunction.test.ts tests/gameplayBotDirectiveEdgeFunction.test.ts
git commit -m "feat: orchestrate secure host next rounds"
```

## Task 8: Add client command and host/non-host progression UI

**Files:**

- Modify: `src/online/gameplay/OnlineGameplayRoundService.ts`
- Modify: `src/app/gameplay/GameplayContext.tsx`
- Modify: `src/app/services/createGameplayBrowserServices.ts`
- Modify: `tests/onlineGameplayRoundService.test.ts`
- Create: `src/app/components/GameplayNextRoundPanel.tsx`
- Create: `src/app/components/GameplayNextRoundPanel.test.tsx`
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Modify: `src/app/screens/ActiveGameplayScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx`
- Modify: `src/app/i18n/translations.ts`
- Modify: `src/app/styles/gameplay.css`

### RED

- [ ] Add service tests asserting the exact public request body, authenticated
      function route, parsed viewer snapshot, stale response handling, and
      privacy-safe failure messages.
- [ ] Add next-round panel tests:
  - host sees “Start Next Round” only in a compatible scored state;
  - non-host sees the approved waiting text;
  - pending request disables duplicate clicks;
  - bidding, playing, synchronizing, paused, and terminated states show no
    start control.
- [ ] Add screen tests:
  - one click sends one command with current expected versions;
  - no effect or timer starts a round automatically;
  - success applies the returned viewer round snapshot but stays neutral until
    matching active control arrives;
  - Realtime propagation enables the exact new first bidder;
  - reconnect in scored and newly started rounds restores the correct state;
  - stale/concurrent rejection reloads both sources and leaves no partial
    actionable UI;
  - a first-bidder bot resumes through the existing bot coordinator.

Run:

```powershell
npx vitest run src/app/components/GameplayNextRoundPanel.test.tsx src/app/screens/ActiveGameplayScreen.test.tsx src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/onlineGameplayRoundService.test.js
```

Expected RED: no client port or host progression panel exists.

### GREEN

- [ ] Add the typed round-port method and browser service implementation.
- [ ] Generate one command ID per deliberate click and retain it for a retry of
      that pending operation.
- [ ] Implement the panel from `canStartNextRound`, host/viewer state, and
      pending state.
- [ ] On success, update the round snapshot and request both authoritative
      refreshes. Let compatibility decide when controls appear.
- [ ] On stale/concurrent response, show a public error and refresh; never invent
      local next-round state.
- [ ] Add English/Arabic strings and scoped styles.

Run the RED command again. Expected GREEN: service and screen tests pass.

### REFACTOR AND COMMIT

- [ ] Run:

```powershell
npm run typecheck:app
npx vitest run src/app/components/GameplayNextRoundPanel.test.tsx src/app/screens/ActiveGameplayScreen.test.tsx src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/onlineGameplayRoundService.test.js
```

- [ ] Commit:

```powershell
git add src/online/gameplay/OnlineGameplayRoundService.ts src/app/gameplay/GameplayContext.tsx src/app/services/createGameplayBrowserServices.ts tests/onlineGameplayRoundService.test.ts src/app/components/GameplayNextRoundPanel.tsx src/app/components/GameplayNextRoundPanel.test.tsx src/app/screens/ActiveGameplayScreen.tsx src/app/screens/ActiveGameplayScreen.test.tsx src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx src/app/i18n/translations.ts src/app/styles/gameplay.css
git commit -m "feat: add host-controlled round progression"
```

## Task 9: Guard database deployment and update the UAT runbook

**Files:**

- Create: `scripts/isolation/deploy-gameplay-migrations.mjs`
- Create: `tests/isolation/gameplayMigrationDeployment.test.mjs`
- Create: `tests/gameplayMigrationDeploymentWorkspace.test.ts`
- Modify: `package.json`
- Modify: `tests/gameplayIsolationSpecification.test.ts`
- Modify: `tests/gameplayDeploymentReadiness.test.ts`
- Modify: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`

### RED

- [ ] Add executable wrapper tests using a fake CLI/process boundary to prove:
  - target guard runs before any mutation;
  - only the isolated `supabase-gameplay` workspace is accepted;
  - only gameplay ref `stedjwppoanbmhxsfhcg` is accepted;
  - score ref `lexewcehptnmikwfizhj` and an unknown ref are rejected;
  - pending migration output must exactly match
    `202607290011_active_round_next_round.sql`;
  - extra/unreviewed pending migrations stop deployment;
  - migration push uses the isolated linked workspace;
  - post-push migration verification is required;
  - no credentials are printed.
- [ ] Update runbook behavior/readiness tests to require the guarded migration
      command and prohibit direct root migration deployment.

Run:

```powershell
node --test tests/isolation/gameplayMigrationDeployment.test.mjs
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayMigrationDeploymentWorkspace.test.js dist/tests/gameplayIsolationSpecification.test.js dist/tests/gameplayDeploymentReadiness.test.js
```

Expected RED: no guarded migration wrapper or package command exists.

### GREEN

- [ ] Implement the wrapper by composing the existing target guard, isolated
      workspace, linked-ref verification, exact pending allowlist, database
      push, and post-push list verification.
- [ ] Define its public CLI with the gameplay project ref as the first
      positional argument and a required `--expected-sha` 40-character commit
      argument; reject missing or additional positional targets before invoking
      the Supabase CLI.
- [ ] Add `deploy:gameplay-migrations` to `package.json`.
- [ ] Update the UAT runbook migration inventory, approved deployment order,
      rollback steps, and fresh-table rules.
- [ ] Keep Function and Vercel instructions on their existing guarded wrappers.

Run the RED command again. Expected GREEN: wrapper/isolation/runbook tests pass.

### REFACTOR AND COMMIT

- [ ] Run the wrapper in its non-mutating verification mode only:

```powershell
npm run verify:gameplay-target
```

- [ ] Do not run the deployment mode without the explicit hosted deployment
      approval.
- [ ] Commit:

```powershell
git add scripts/isolation/deploy-gameplay-migrations.mjs tests/isolation/gameplayMigrationDeployment.test.mjs tests/gameplayMigrationDeploymentWorkspace.test.ts package.json tests/gameplayIsolationSpecification.test.ts tests/gameplayDeploymentReadiness.test.ts docs/GAMEPLAY_UAT_DEPLOYMENT.md
git commit -m "chore: guard gameplay migration deployment"
```

## Task 10: Full local verification and review

**Files:** Review every file changed by Tasks 1–9; make only fixes required by
the stabilization scope.

### VERIFICATION

- [ ] Confirm the checkout and diff:

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status --short
git diff --check
git diff --name-only origin/feature/online-game-bot-mvp...HEAD
```

- [ ] Run the complete local gates:

```powershell
npm run typecheck
npm test
npm run build
npm run build:gameplay
npm run ci:isolation
deno test supabase-gameplay/supabase/functions/gameplay-round-command/nextRoundHandler.test.ts
npx supabase --workdir supabase-gameplay start
npx supabase --workdir supabase-gameplay test db
npx supabase --workdir supabase-gameplay stop
```

- [ ] Run privacy and behavior review:
  - no non-viewer hand prop/type/projection;
  - no deal material in logs, errors, ledgers, invalidations, or tests;
  - no second actionable status message;
  - no countdown-triggered command;
  - no automatic next-round effect;
  - exact turn ID required for actionability;
  - final accepted estimates cannot total 13;
  - human bid/card boundary still covered;
  - no score-UAT ref or workspace introduced outside explicit rejection tests.
- [ ] Run `superpowers:requesting-code-review` and address only verified,
      in-scope findings using RED/GREEN cycles.
- [ ] Rerun every gate affected by a review fix.
- [ ] If review produces changes, list the exact stabilization paths with
      `git status --short`, stage each reviewed path explicitly, inspect
      `git diff --cached --name-only`, and commit with
      `fix: close active-round stabilization review findings`. Never stage the
      repository indiscriminately.

## Deployment gate: explicit approval required

Stop after local verification and report the exact results. Do not perform any
hosted command until the user explicitly approves deployment.

After approval, re-verify:

```powershell
git status --short
npm run verify:gameplay-target
```

Then deploy in this order, using only guarded package commands:

```powershell
$testedSha = git rev-parse HEAD

npm run deploy:gameplay-migrations -- `
  stedjwppoanbmhxsfhcg `
  --expected-sha $testedSha

npm run deploy:gameplay-function -- `
  gameplay-round-command `
  stedjwppoanbmhxsfhcg `
  --expected-sha $testedSha

npm run deploy:gameplay-vercel -- `
  --expected-sha $testedSha `
  --supabase-url https://stedjwppoanbmhxsfhcg.supabase.co `
  --workspace-slug estimation-gameplay-uat
```

The Vercel command is run only inside the updated runbook's secure publishable
key prompt/cleanup block. No key is placed on the command line or in a report.

After each command, capture only public deployment identifiers/status. Never
include tokens, environment values, connection strings, or private game data.
If any gate identifies a target other than gameplay ref
`stedjwppoanbmhxsfhcg`, stop immediately.

Rollback, if required:

1. redeploy the previously verified `gameplay-round-command` source through the
   guarded wrapper;
2. redeploy the preceding gameplay Vercel artifact through the guarded wrapper;
3. leave the additive unused RPC in place;
4. stop hosted testing and create a new table for a later retest.

Do not run a destructive down migration and do not repair/reuse an affected UAT
table.

## Hosted UAT gate: fresh tables only

Hosted UAT also requires explicit approval and successful deployment gates.
Record table display names/IDs privately in the operator session; do not add
private hands or deal material to reports.

### Solo versus three bots

- [ ] Create a new table; do not select any preserved table.
- [ ] Verify 13 read-only viewer cards throughout bidding.
- [ ] Verify seat-bound estimates; separate caller, trump, and numeric estimate.
- [ ] Verify persistent total, Under/Over distance, and Risk during bidding/play.
- [ ] Verify exactly one banner and a visibly ticking countdown.
- [ ] Verify viewer bid/card actions are immediately obvious and legal controls
      only are enabled.
- [ ] Complete all 13 tricks and verify trick 13/winner remains visible.
- [ ] Verify result cards and host Start Next Round.
- [ ] Reload while scored; verify final trick/results/control persist.
- [ ] Start one next round and verify round increment, existing rotation/order,
      multiplier carry, fresh viewer hand, and new first bid turn.
- [ ] Retry the same command ID; verify no additional round/deal.
- [ ] Attempt a stale/concurrent command; verify clean rejection/no partial state.
- [ ] Verify bot continuation and human boundary in the new round.
- [ ] Verify no later round starts automatically.

### Four authenticated browsers

- [ ] Create another new table with four humans.
- [ ] At each bid/card boundary, verify one actionable viewer and a consistent
      waiting seat everywhere else.
- [ ] Verify each browser sees only its authenticated hand.
- [ ] Reconnect one browser during bidding and one during card play.
- [ ] Finish the round and verify host-only start plus exact non-host waiting
      text.
- [ ] Reload all browsers while scored.
- [ ] Race two host start requests and verify one committed transition.
- [ ] Reconnect immediately after the transition and verify neutral
      synchronization until the matching new turn arrives.
- [ ] Verify Realtime propagation to all browsers and correct new first bidder.
- [ ] Verify termination, not a fixed count, remains the way to end the game.

## Final reporting checklist

- [ ] Branch and implementation start/end SHAs.
- [ ] Local verification commands with observed exit status.
- [ ] Migration, Function, and Vercel public deployment status if separately
      approved.
- [ ] Fresh solo and multi-browser UAT outcomes if separately approved.
- [ ] Confirmation that preserved tables and score-UAT resources were untouched.
- [ ] Confirmation that PR #14 remains open, draft, and unmerged.
- [ ] Remaining blockers/product decisions.
- [ ] Per-activity and overall delivery percentages.
