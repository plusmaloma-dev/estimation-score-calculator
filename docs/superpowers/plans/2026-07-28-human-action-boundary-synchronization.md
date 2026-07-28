# Human Action Boundary Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every accepted human bid and card play advance the authoritative gameplay round and active-control state exactly once, including safe recovery after an interrupted response.

**Architecture:** Add a small shared coordinator that executes the round command first, resolves whether its deterministic active-control completion already exists, and completes the boundary only when required. Both maintained `gameplay-round-command` Edge Function copies provide the Supabase-backed boundary port and route `submit-bid` and `play-card` through the coordinator. The existing bot path reuses the same next-turn projection but otherwise remains unchanged.

**Tech Stack:** TypeScript, Node test runner, Supabase Edge Functions, Supabase JavaScript client, PostgreSQL security-definer RPCs, npm CI.

## Global Constraints

- Work only in `C:\Users\rjamm\estimation-gameplay-uat` on branch `feature/online-game-bot-mvp`.
- Keep PR #14 open, draft, unmerged, and unauthorized for merge.
- Preserve `Solo UAT Bot Retest 4` untouched as diagnostic evidence.
- Do not add or apply a migration.
- Do not deploy Vercel during this plan.
- Deploy only `gameplay-round-command`, only after explicit approval, through `scripts/isolation/deploy-gameplay-function.mjs`.
- Supabase target must remain `stedjwppoanbmhxsfhcg`; the prohibited score ref is `lexewcehptnmikwfizhj`.
- Never use `--no-verify-jwt`.
- Never expose credentials, tokens, private hands, seeds, nonces, commitments, or deck order.
- Commit and push only after focused GREEN, `npm run ci`, and `npm run ci:isolation` all pass.
- Hosted UAT must use a fresh table and must not refresh the browser during the active test.

---

### Task 1: Add the RED coordinator contract

**Files:**
- Create: `src/online/gameplay/HumanActionBoundaryCoordinator.ts`
- Create: `tests/humanActionBoundaryCoordinator.test.ts`

**Interfaces:**
- Consumes: `OnlineGameplayRoundSnapshot` and the existing round result shape `{ valid, errors, duplicate, value? }`.
- Produces: `nextAuthoritativeTurn(snapshot)`, `HumanActionBoundaryPort`, and `coordinateHumanRoundAction(input)` for Edge Function orchestration.

- [ ] **Step 1: Create the failing coordinator test before the implementation file exists**

Create `tests/humanActionBoundaryCoordinator.test.ts` with tests for all required paths:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coordinateHumanRoundAction,
  nextAuthoritativeTurn,
  type HumanActionBoundaryPort,
} from '../src/online/gameplay/HumanActionBoundaryCoordinator.js';
import type { OnlineGameplayRoundSnapshot } from '../src/online/gameplay/roundTypes.js';

function snapshot(
  overrides: Partial<OnlineGameplayRoundSnapshot> = {},
): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'bidding',
    version: 3,
    viewerSeat: 0,
    bidOwnerSeat: 2,
    nextBidSeat: 1,
    players: [
      { seat: 0, playerId: 'human-0', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'bot-2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'bot-3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
    ...overrides,
  };
}

function boundaryPort(input: {
  readonly completed?: boolean;
  readonly completionValid?: boolean;
} = {}): HumanActionBoundaryPort & {
  readonly resolved: string[];
  readonly completedInputs: unknown[];
} {
  const resolved: string[] = [];
  const completedInputs: unknown[] = [];
  return {
    resolved,
    completedInputs,
    async resolve(value) {
      resolved.push(value.roundCommandId);
      return input.completed === true
        ? { valid: true, completed: true }
        : {
            valid: true,
            completed: false,
            workspaceId: 'workspace-1',
            expectedVersion: 7,
          };
    },
    async complete(value) {
      completedInputs.push(value);
      return input.completionValid === false
        ? { valid: false, errors: ['Boundary unavailable.'] }
        : { valid: true, errors: [] };
    },
  };
}

test('accepted human bid completes the next authoritative bid turn', async () => {
  const boundary = boundaryPort();
  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'submit-bid:1',
    actionKind: 'bid',
    boundary,
    occurredAt: '2026-07-28T12:00:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot(),
    }),
  });

  assert.equal(result.valid, true);
  assert.deepEqual(boundary.completedInputs, [{
    tableId: 'table-1',
    workspaceId: 'workspace-1',
    actorUserId: 'human-0',
    commandId: 'human-complete:submit-bid:1',
    expectedVersion: 7,
    nextTurn: {
      turnId: 'round-1:bid:3:1',
      seat: 1,
      actionKind: 'bid',
    },
    occurredAt: '2026-07-28T12:00:00.000Z',
  }]);
});

test('accepted human card completes the next card turn', async () => {
  const boundary = boundaryPort();
  await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'play-card:1',
    actionKind: 'card',
    boundary,
    occurredAt: '2026-07-28T12:01:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot({
        phase: 'playing',
        version: 8,
        nextBidSeat: undefined,
        currentTurnSeat: 2,
      }),
    }),
  });

  assert.deepEqual(
    (boundary.completedInputs[0] as { nextTurn: unknown }).nextTurn,
    { turnId: 'round-1:card:8:2', seat: 2, actionKind: 'card' },
  );
});

test('scored round completes the boundary without a next turn', async () => {
  const boundary = boundaryPort();
  await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'play-card:13',
    actionKind: 'card',
    boundary,
    occurredAt: '2026-07-28T12:02:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot({
        phase: 'scored',
        version: 56,
        nextBidSeat: undefined,
        currentTurnSeat: undefined,
      }),
    }),
  });

  assert.equal(
    (boundary.completedInputs[0] as { nextTurn: unknown }).nextTurn,
    null,
  );
});

test('rejected round action never touches active control', async () => {
  const boundary = boundaryPort();
  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'submit-bid:rejected',
    actionKind: 'bid',
    boundary,
    occurredAt: '2026-07-28T12:03:00.000Z',
    executeRound: async () => ({
      valid: false,
      errors: ['Estimate is not legal.'],
      duplicate: false,
    }),
  });

  assert.equal(result.valid, false);
  assert.deepEqual(boundary.resolved, []);
  assert.deepEqual(boundary.completedInputs, []);
});

test('accepted duplicate skips an already-completed boundary', async () => {
  const boundary = boundaryPort({ completed: true });
  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'submit-bid:duplicate',
    actionKind: 'bid',
    boundary,
    occurredAt: '2026-07-28T12:04:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: true,
      value: snapshot(),
    }),
  });

  assert.equal(result.valid, true);
  assert.equal(result.duplicate, true);
  assert.deepEqual(boundary.completedInputs, []);
});

test('boundary failure returns a retryable synchronization error', async () => {
  const boundary = boundaryPort({ completionValid: false });
  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'play-card:failure',
    actionKind: 'card',
    boundary,
    occurredAt: '2026-07-28T12:05:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot({ phase: 'playing', currentTurnSeat: 1 }),
    }),
  });

  assert.deepEqual(result, {
    valid: false,
    errors: ['Boundary unavailable.'],
    duplicate: false,
  });
});

test('next turn projection is deterministic for bid, card, and scored phases', () => {
  assert.deepEqual(nextAuthoritativeTurn(snapshot()), {
    turnId: 'round-1:bid:3:1',
    seat: 1,
    actionKind: 'bid',
  });
  assert.deepEqual(nextAuthoritativeTurn(snapshot({
    phase: 'playing', version: 4, nextBidSeat: undefined, currentTurnSeat: 3,
  })), {
    turnId: 'round-1:card:4:3',
    seat: 3,
    actionKind: 'card',
  });
  assert.equal(nextAuthoritativeTurn(snapshot({
    phase: 'scored', nextBidSeat: undefined, currentTurnSeat: undefined,
  })), null);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/humanActionBoundaryCoordinator.test.js
```

Expected: non-zero exit because `HumanActionBoundaryCoordinator` does not yet exist.

- [ ] **Step 3: Commit the RED test only**

```powershell
git add tests/humanActionBoundaryCoordinator.test.ts
git commit -m "test: reproduce missing human action boundary"
```

---

### Task 2: Implement the shared coordinator

**Files:**
- Create: `src/online/gameplay/HumanActionBoundaryCoordinator.ts`
- Test: `tests/humanActionBoundaryCoordinator.test.ts`

**Interfaces:**
- Consumes: an async round command and a persistence-specific `HumanActionBoundaryPort`.
- Produces: deterministic `human-complete:<round-command-id>` completion and `nextAuthoritativeTurn()`.

- [ ] **Step 1: Add the exact coordinator types and next-turn projection**

Create `src/online/gameplay/HumanActionBoundaryCoordinator.ts`:

```ts
import type { OnlineGameplayRoundSnapshot } from './roundTypes.js';

export type HumanActionKind = 'bid' | 'card';

export interface HumanRoundActionResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly duplicate: boolean;
  readonly value?: OnlineGameplayRoundSnapshot;
}

export interface AuthoritativeNextTurn {
  readonly turnId: string;
  readonly seat: number;
  readonly actionKind: HumanActionKind;
}

export type HumanBoundaryResolution =
  | { readonly valid: true; readonly completed: true }
  | {
      readonly valid: true;
      readonly completed: false;
      readonly workspaceId: string;
      readonly expectedVersion: number;
    }
  | { readonly valid: false; readonly errors: readonly string[] };

export interface HumanBoundaryCompletionInput {
  readonly tableId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly nextTurn: AuthoritativeNextTurn | null;
  readonly occurredAt: string;
}

export interface HumanActionBoundaryPort {
  resolve(input: {
    readonly tableId: string;
    readonly actorUserId: string;
    readonly roundCommandId: string;
    readonly actionKind: HumanActionKind;
  }): Promise<HumanBoundaryResolution>;
  complete(input: HumanBoundaryCompletionInput): Promise<{
    readonly valid: boolean;
    readonly errors: readonly string[];
  }>;
}

export function nextAuthoritativeTurn(
  snapshot: OnlineGameplayRoundSnapshot,
): AuthoritativeNextTurn | null {
  const seat = snapshot.phase === 'bidding'
    ? snapshot.nextBidSeat
    : snapshot.phase === 'playing'
      ? snapshot.currentTurnSeat
      : undefined;
  if (seat === undefined) return null;
  const actionKind: HumanActionKind = snapshot.phase === 'bidding' ? 'bid' : 'card';
  return {
    turnId: `round-${snapshot.roundNumber}:${actionKind}:${snapshot.version}:${seat}`,
    seat,
    actionKind,
  };
}
```

- [ ] **Step 2: Add the exact orchestration function**

Append:

```ts
export async function coordinateHumanRoundAction(input: {
  readonly tableId: string;
  readonly actorUserId: string;
  readonly roundCommandId: string;
  readonly actionKind: HumanActionKind;
  readonly boundary: HumanActionBoundaryPort;
  readonly occurredAt: string;
  readonly executeRound: () => Promise<HumanRoundActionResult>;
}): Promise<HumanRoundActionResult> {
  const roundResult = await input.executeRound();
  if (!roundResult.valid || roundResult.value === undefined) return roundResult;

  const resolution = await input.boundary.resolve({
    tableId: input.tableId,
    actorUserId: input.actorUserId,
    roundCommandId: input.roundCommandId,
    actionKind: input.actionKind,
  });
  if (!resolution.valid) {
    return {
      valid: false,
      errors: resolution.errors,
      duplicate: roundResult.duplicate,
    };
  }
  if (resolution.completed) return roundResult;

  const completed = await input.boundary.complete({
    tableId: input.tableId,
    workspaceId: resolution.workspaceId,
    actorUserId: input.actorUserId,
    commandId: `human-complete:${input.roundCommandId}`,
    expectedVersion: resolution.expectedVersion,
    nextTurn: nextAuthoritativeTurn(roundResult.value),
    occurredAt: input.occurredAt,
  });
  if (!completed.valid) {
    return {
      valid: false,
      errors: completed.errors.length > 0
        ? completed.errors
        : ['Human action boundary could not complete.'],
      duplicate: roundResult.duplicate,
    };
  }
  return roundResult;
}
```

- [ ] **Step 3: Run the focused test and verify GREEN**

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/humanActionBoundaryCoordinator.test.js
```

Expected: all coordinator tests pass.

- [ ] **Step 4: Commit the coordinator**

```powershell
git add src/online/gameplay/HumanActionBoundaryCoordinator.ts tests/humanActionBoundaryCoordinator.test.ts
git commit -m "feat: coordinate human action boundaries"
```

---

### Task 3: Wire both Edge Function copies through the coordinator

**Files:**
- Create: `tests/gameplayHumanActionBoundaryEdgeFunction.test.ts`
- Modify: `supabase/functions/gameplay-round-command/index.ts`
- Modify: `supabase-gameplay/supabase/functions/gameplay-round-command/index.ts`
- Reference: `supabase-gameplay/supabase/migrations/202607260007_active_game_control_rpc.sql`

**Interfaces:**
- Consumes: `coordinateHumanRoundAction`, `nextAuthoritativeTurn`, `complete_active_action_boundary`, active-control command records, active-control state, and viewer seat control.
- Produces: server-side completion after accepted human bids/cards and idempotent response recovery when `human-complete:<command-id>` already succeeded.

- [ ] **Step 1: Add a RED cross-copy static contract**

Create `tests/gameplayHumanActionBoundaryEdgeFunction.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const copies = [
  readFileSync('supabase/functions/gameplay-round-command/index.ts', 'utf8'),
  readFileSync('supabase-gameplay/supabase/functions/gameplay-round-command/index.ts', 'utf8'),
] as const;

for (const [index, source] of copies.entries()) {
  test(`human bid and card routes synchronize active control in Edge copy ${index + 1}`, () => {
    assert.match(source, /coordinateHumanRoundAction/);
    assert.match(source, /class SupabaseHumanActionBoundaryPort/);
    assert.match(source, /human-complete:\$\{input\.roundCommandId\}/);
    assert.match(source, /complete_active_action_boundary/);
    assert.match(source, /actionKind:\s*'bid'/);
    assert.match(source, /actionKind:\s*'card'/);
    assert.doesNotMatch(
      source,
      /return json\(await service\.(submitBid|playCard)\(/,
    );
  });

  test(`human boundary recovery checks a prior deterministic completion in Edge copy ${index + 1}`, () => {
    assert.match(source, /commandRecord\([\s\S]*human-complete:/);
    assert.match(source, /completedCommand\?\.accepted === true/);
    assert.match(source, /gameplay_active_controls/);
    assert.match(source, /gameplay_active_seat_controls/);
    assert.match(source, /turn_action_kind/);
    assert.match(source, /turn_seat/);
  });
}

test('both maintained Edge Function copies remain behaviorally equivalent', () => {
  const normalize = (value: string) => value
    .replace(/\.\.\/\.\.\/\.\.\/\.\.\/src/g, '../../../src')
    .replace(/\r\n/g, '\n');
  assert.equal(normalize(copies[0]), normalize(copies[1]));
});
```

- [ ] **Step 2: Run the cross-copy test and verify RED**

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayHumanActionBoundaryEdgeFunction.test.js
```

Expected: non-zero exit because the two human routes still return the round service result directly.

- [ ] **Step 3: Import the shared coordinator in both Edge copies**

Repository copy:

```ts
import {
  coordinateHumanRoundAction,
  nextAuthoritativeTurn,
  type HumanActionBoundaryPort,
  type HumanActionKind,
  type HumanBoundaryCompletionInput,
  type HumanBoundaryResolution,
} from '../../../src/online/gameplay/HumanActionBoundaryCoordinator.ts';
```

Isolated deployment copy uses the same import with `../../../../src/...`.

Delete the local `nextTurn()` function and replace its bot-path call with `nextAuthoritativeTurn(botResult.value)`.

- [ ] **Step 4: Add the Supabase-backed human boundary port to both copies**

Add this class after `userRpc()` and adapt only the relative source imports between copies:

```ts
class SupabaseHumanActionBoundaryPort implements HumanActionBoundaryPort {
  constructor(
    private readonly serviceClient: ServiceClient,
    private readonly authClient: ServiceClient,
  ) {}

  async resolve(input: {
    readonly tableId: string;
    readonly actorUserId: string;
    readonly roundCommandId: string;
    readonly actionKind: HumanActionKind;
  }): Promise<HumanBoundaryResolution> {
    const completionId = `human-complete:${input.roundCommandId}`;
    const completedCommand = await commandRecord(
      this.serviceClient,
      input.tableId,
      completionId,
    );
    if (completedCommand?.accepted === true) {
      return { valid: true, completed: true };
    }

    const { data: tableData, error: tableError } = await this.serviceClient
      .from('gameplay_tables')
      .select('workspace_id')
      .eq('id', input.tableId)
      .single();
    if (tableError !== null) return { valid: false, errors: [tableError.message] };
    const workspaceId = object(tableData)?.workspace_id;
    if (typeof workspaceId !== 'string') {
      return { valid: false, errors: ['Gameplay workspace could not be resolved.'] };
    }

    const { data: controlData, error: controlError } = await this.serviceClient
      .from('gameplay_active_controls')
      .select('version,lifecycle,turn_seat,turn_action_kind,turn_status')
      .eq('table_id', input.tableId)
      .single();
    if (controlError !== null) return { valid: false, errors: [controlError.message] };
    const control = object(controlData);

    const { data: seatData, error: seatError } = await this.serviceClient
      .from('gameplay_active_seat_controls')
      .select('seat_number,control_owner')
      .eq('table_id', input.tableId)
      .eq('human_user_id', input.actorUserId)
      .single();
    if (seatError !== null) return { valid: false, errors: [seatError.message] };
    const seat = object(seatData);

    if (
      typeof control?.version !== 'number'
      || control.lifecycle !== 'active'
      || typeof seat?.seat_number !== 'number'
      || seat.control_owner !== 'human'
      || control.turn_seat !== seat.seat_number
      || control.turn_action_kind !== input.actionKind
      || control.turn_status !== 'running'
    ) {
      return {
        valid: false,
        errors: ['Human action does not match the authoritative active-control turn.'],
      };
    }

    return {
      valid: true,
      completed: false,
      workspaceId,
      expectedVersion: control.version,
    };
  }

  async complete(input: HumanBoundaryCompletionInput): Promise<{
    readonly valid: boolean;
    readonly errors: readonly string[];
  }> {
    const completed = await userRpc(this.authClient, 'complete_active_action_boundary', {
      p_table_id: input.tableId,
      p_workspace_id: input.workspaceId,
      p_actor_user_id: input.actorUserId,
      p_command_id: input.commandId,
      p_expected_version: input.expectedVersion,
      p_next_turn: input.nextTurn,
      p_occurred_at: input.occurredAt,
    });
    return completed.valid === true
      ? { valid: true, errors: [] }
      : {
          valid: false,
          errors: stringArray(completed.errors).length > 0
            ? stringArray(completed.errors)
            : ['Human action boundary could not complete.'],
        };
  }
}
```

- [ ] **Step 5: Route accepted human bids and cards through the coordinator**

After constructing `authClient`, `serviceClient`, and `actor`, add:

```ts
const humanBoundary = new SupabaseHumanActionBoundaryPort(serviceClient, authClient);
```

Replace the `submit-bid` success path with:

```ts
const occurredAt = new Date().toISOString();
return json(await coordinateHumanRoundAction({
  tableId: body.tableId,
  actorUserId: actor.userId,
  roundCommandId: body.commandId!,
  actionKind: 'bid',
  boundary: humanBoundary,
  occurredAt,
  executeRound: () => service.submitBid(
    body.tableId!,
    actor,
    body.commandId!,
    body.expectedVersion!,
    body.bid!,
  ),
}));
```

Replace the `play-card` success path with the same structure using `actionKind: 'card'` and `service.playCard(...)`.

- [ ] **Step 6: Run all focused tests and verify GREEN**

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test `
  dist/tests/humanActionBoundaryCoordinator.test.js `
  dist/tests/gameplayHumanActionBoundaryEdgeFunction.test.js `
  dist/tests/gameplayBotDirectiveEdgeFunction.test.js
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the Edge wiring**

```powershell
git add `
  src/online/gameplay/HumanActionBoundaryCoordinator.ts `
  tests/humanActionBoundaryCoordinator.test.ts `
  tests/gameplayHumanActionBoundaryEdgeFunction.test.ts `
  supabase/functions/gameplay-round-command/index.ts `
  supabase-gameplay/supabase/functions/gameplay-round-command/index.ts

git commit -m "fix: synchronize human gameplay action boundaries"
```

---

### Task 4: Verify, publish, deploy with approval, and run fresh UAT

**Files:**
- Modify: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`
- Verify: all files changed in Tasks 1–3 and this plan.

**Interfaces:**
- Consumes: the completed human boundary correction.
- Produces: one CI-green SHA, one guarded Function deployment after approval, and hosted evidence from a fresh table.

- [ ] **Step 1: Record the preserved table and fresh-retest rule**

Add a short runbook note stating:

```text
Solo UAT Bot Retest 4 is preserved as split-state evidence. Do not refresh,
repair, pause, terminate, delete, or reuse it. Human-boundary retesting must
use a new table because its round and active-control ledgers have already
diverged.
```

- [ ] **Step 2: Run full local verification**

```powershell
npm run ci
npm run ci:isolation
```

Expected: both commands exit `0`.

- [ ] **Step 3: Review scope and patch quality**

```powershell
git status --short
git diff --check
git diff --stat
git diff
```

Required scope: coordinator source/test, cross-copy test, two Function copies, runbook, and this plan only.

- [ ] **Step 4: Commit and push**

```powershell
git add `
  src/online/gameplay/HumanActionBoundaryCoordinator.ts `
  tests/humanActionBoundaryCoordinator.test.ts `
  tests/gameplayHumanActionBoundaryEdgeFunction.test.ts `
  supabase/functions/gameplay-round-command/index.ts `
  supabase-gameplay/supabase/functions/gameplay-round-command/index.ts `
  docs/GAMEPLAY_UAT_DEPLOYMENT.md `
  docs/superpowers/plans/2026-07-28-human-action-boundary-synchronization.md

git commit -m "fix: complete human gameplay action boundaries"
git push origin feature/online-game-bot-mvp
```

- [ ] **Step 5: Verify GitHub CI and PR state**

Confirm on the exact pushed SHA:

```text
Validate package: success
Validate isolation boundaries: success
PR #14: open, draft, unmerged
```

Stop and request explicit deployment approval.

- [ ] **Step 6: Deploy only `gameplay-round-command` through the guard**

After approval:

```powershell
$testedSha = (git rev-parse HEAD).Trim()
$gameplayRef = 'stedjwppoanbmhxsfhcg'

node scripts/isolation/gameplay-target-guard.mjs `
  supabase $gameplayRef `
  --expected-sha $testedSha

node scripts/isolation/deploy-gameplay-function.mjs `
  gameplay-round-command $gameplayRef `
  --expected-sha $testedSha
```

Expected: target guard passes and only `gameplay-round-command` is deployed with JWT verification enabled.

- [ ] **Step 7: Run the hosted synchronization retest**

Create a new private table:

```text
Name: Solo UAT Boundary Retest 5
Turn timer: 45 seconds
Disconnect grace: 60 seconds
```

Test without refreshing:

1. Start once and wait for the human bidding turn.
2. Submit one legal human estimate once.
3. Confirm active control advances and the next bot acts automatically.
4. Continue until card play begins.
5. On the first human card turn, play one legal card once.
6. Confirm active control advances and the next bot acts automatically.
7. Confirm no `Bot directive does not match the authoritative active seat` error appears.
8. Stop after the next bot card succeeds.

- [ ] **Step 8: Verify ledger alignment with a read-only SQL query**

Use a query that reports only table name, active-control version/turn seat/status, round version/current turn seat, accepted human completion count, accepted bot begin count, and accepted completed-boundary count. Do not select payloads, directives, cards, hands, IDs, seeds, nonces, or commitments.

Acceptance:

```text
active-control turn seat = round current turn seat + 1
no unmatched human action boundary
no stale-seat directive error
```

Stop before starting the bidding-hand implementation plan.
