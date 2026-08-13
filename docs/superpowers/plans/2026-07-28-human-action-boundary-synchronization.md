# Human Action Boundary Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every accepted human bid and card play advance the round and active-control state exactly once, including safe recovery after an interrupted response.

**Architecture:** A shared coordinator executes the round command, checks whether the deterministic active-control completion already exists, and completes the boundary only when needed. Both maintained `gameplay-round-command` copies provide a Supabase-backed boundary port and route `submit-bid` and `play-card` through the coordinator. The existing bot path reuses the same next-turn projection but otherwise remains unchanged.

**Tech Stack:** TypeScript, Node test runner, Supabase Edge Functions, Supabase JavaScript client, PostgreSQL RPCs, npm CI.

## Global Constraints

- Work only in `C:\Users\rjamm\estimation-gameplay-uat` on `feature/online-game-bot-mvp`.
- Keep PR #14 open, draft, unmerged, and unauthorized for merge.
- Preserve `Solo UAT Bot Retest 4` untouched.
- Do not add or apply a migration.
- Do not deploy Vercel during this plan.
- Deploy only `gameplay-round-command`, only after explicit approval, through the guarded wrapper.
- Supabase target must remain `stedjwppoanbmhxsfhcg`; never target `lexewcehptnmikwfizhj`.
- Never use `--no-verify-jwt`.
- Never expose credentials, tokens, private hands, seeds, nonces, commitments, or deck order.
- Commit and push only after focused GREEN, `npm run ci`, and `npm run ci:isolation` pass.

---

### Task 1: Add the RED coordinator contract

**Files:**
- Create: `tests/humanActionBoundaryCoordinator.test.ts`
- Future create: `src/online/gameplay/HumanActionBoundaryCoordinator.ts`

**Interfaces:**
- Consumes: the existing round result shape `{ valid, errors, duplicate, value? }`.
- Produces: failing tests for accepted bid/card completion, scored completion, rejection, duplicate recovery, and boundary failure.

- [ ] **Step 1: Write the failing test**

Create `tests/humanActionBoundaryCoordinator.test.ts`:

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

function boundary(input: {
  readonly alreadyCompleted?: boolean;
  readonly completionValid?: boolean;
} = {}): HumanActionBoundaryPort & { readonly completions: unknown[] } {
  const completions: unknown[] = [];
  return {
    completions,
    async resolve() {
      return input.alreadyCompleted === true
        ? { valid: true, completed: true }
        : {
            valid: true,
            completed: false,
            workspaceId: 'workspace-1',
            expectedVersion: 7,
          };
    },
    async complete(value) {
      completions.push(value);
      return input.completionValid === false
        ? { valid: false, errors: ['Boundary unavailable.'] }
        : { valid: true, errors: [] };
    },
  };
}

test('accepted bid completes the next authoritative turn', async () => {
  const port = boundary();
  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'submit-bid:1',
    actionKind: 'bid',
    boundary: port,
    occurredAt: '2026-07-28T12:00:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot(),
    }),
  });
  assert.equal(result.valid, true);
  assert.deepEqual(port.completions, [{
    tableId: 'table-1',
    workspaceId: 'workspace-1',
    actorUserId: 'human-0',
    commandId: 'human-complete:submit-bid:1',
    expectedVersion: 7,
    nextTurn: { turnId: 'round-1:bid:3:1', seat: 1, actionKind: 'bid' },
    occurredAt: '2026-07-28T12:00:00.000Z',
  }]);
});

test('accepted card and scored round project card or null next turns', async () => {
  const cardPort = boundary();
  await coordinateHumanRoundAction({
    tableId: 'table-1', actorUserId: 'human-0', roundCommandId: 'play-card:1',
    actionKind: 'card', boundary: cardPort, occurredAt: '2026-07-28T12:01:00.000Z',
    executeRound: async () => ({
      valid: true, errors: [], duplicate: false,
      value: snapshot({ phase: 'playing', version: 8, nextBidSeat: undefined, currentTurnSeat: 2 }),
    }),
  });
  assert.deepEqual(
    (cardPort.completions[0] as { nextTurn: unknown }).nextTurn,
    { turnId: 'round-1:card:8:2', seat: 2, actionKind: 'card' },
  );

  const scoredPort = boundary();
  await coordinateHumanRoundAction({
    tableId: 'table-1', actorUserId: 'human-0', roundCommandId: 'play-card:13',
    actionKind: 'card', boundary: scoredPort, occurredAt: '2026-07-28T12:02:00.000Z',
    executeRound: async () => ({
      valid: true, errors: [], duplicate: false,
      value: snapshot({ phase: 'scored', version: 56, nextBidSeat: undefined, currentTurnSeat: undefined }),
    }),
  });
  assert.equal((scoredPort.completions[0] as { nextTurn: unknown }).nextTurn, null);
});

test('rejected action does not complete active control', async () => {
  const port = boundary();
  const result = await coordinateHumanRoundAction({
    tableId: 'table-1', actorUserId: 'human-0', roundCommandId: 'submit-bid:bad',
    actionKind: 'bid', boundary: port, occurredAt: '2026-07-28T12:03:00.000Z',
    executeRound: async () => ({ valid: false, errors: ['Estimate is not legal.'], duplicate: false }),
  });
  assert.equal(result.valid, false);
  assert.deepEqual(port.completions, []);
});

test('accepted duplicate skips an already completed boundary', async () => {
  const port = boundary({ alreadyCompleted: true });
  const result = await coordinateHumanRoundAction({
    tableId: 'table-1', actorUserId: 'human-0', roundCommandId: 'submit-bid:dup',
    actionKind: 'bid', boundary: port, occurredAt: '2026-07-28T12:04:00.000Z',
    executeRound: async () => ({ valid: true, errors: [], duplicate: true, value: snapshot() }),
  });
  assert.equal(result.valid, true);
  assert.equal(result.duplicate, true);
  assert.deepEqual(port.completions, []);
});

test('boundary failure is returned without reporting success', async () => {
  const port = boundary({ completionValid: false });
  const result = await coordinateHumanRoundAction({
    tableId: 'table-1', actorUserId: 'human-0', roundCommandId: 'play-card:fail',
    actionKind: 'card', boundary: port, occurredAt: '2026-07-28T12:05:00.000Z',
    executeRound: async () => ({ valid: true, errors: [], duplicate: false, value: snapshot() }),
  });
  assert.deepEqual(result, { valid: false, errors: ['Boundary unavailable.'], duplicate: false });
});

test('next-turn projection is deterministic', () => {
  assert.deepEqual(nextAuthoritativeTurn(snapshot()), {
    turnId: 'round-1:bid:3:1', seat: 1, actionKind: 'bid',
  });
  assert.deepEqual(nextAuthoritativeTurn(snapshot({
    phase: 'playing', version: 4, nextBidSeat: undefined, currentTurnSeat: 3,
  })), {
    turnId: 'round-1:card:4:3', seat: 3, actionKind: 'card',
  });
  assert.equal(nextAuthoritativeTurn(snapshot({
    phase: 'scored', nextBidSeat: undefined, currentTurnSeat: undefined,
  })), null);
});
```

- [ ] **Step 2: Run RED**

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/humanActionBoundaryCoordinator.test.js
```

Expected: non-zero exit because the coordinator module does not exist.

- [ ] **Step 3: Commit RED**

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
- Produces: `HumanActionBoundaryPort`, `nextAuthoritativeTurn()`, and `coordinateHumanRoundAction()`.

- [ ] **Step 1: Create the coordinator**

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
  | { readonly valid: true; readonly completed: false; readonly workspaceId: string; readonly expectedVersion: number }
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
  complete(input: HumanBoundaryCompletionInput): Promise<{ readonly valid: boolean; readonly errors: readonly string[] }>;
}

export function nextAuthoritativeTurn(snapshot: OnlineGameplayRoundSnapshot): AuthoritativeNextTurn | null {
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
    return { valid: false, errors: resolution.errors, duplicate: roundResult.duplicate };
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
  return completed.valid
    ? roundResult
    : {
        valid: false,
        errors: completed.errors.length > 0
          ? completed.errors
          : ['Human action boundary could not complete.'],
        duplicate: roundResult.duplicate,
      };
}
```

- [ ] **Step 2: Run GREEN**

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/humanActionBoundaryCoordinator.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```powershell
git add src/online/gameplay/HumanActionBoundaryCoordinator.ts tests/humanActionBoundaryCoordinator.test.ts
git commit -m "feat: coordinate human action boundaries"
```

---

### Task 3: Wire both Edge Function copies

**Files:**
- Create: `tests/gameplayHumanActionBoundaryEdgeFunction.test.ts`
- Modify: `supabase/functions/gameplay-round-command/index.ts`
- Modify: `supabase-gameplay/supabase/functions/gameplay-round-command/index.ts`

**Interfaces:**
- Consumes: the coordinator, `complete_active_action_boundary`, active-control command records, active-control state, and human seat control.
- Produces: server-side completion for accepted human bids/cards and idempotent recovery.

- [ ] **Step 1: Add RED cross-copy tests**

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
  test(`human actions synchronize active control in copy ${index + 1}`, () => {
    assert.match(source, /coordinateHumanRoundAction/);
    assert.match(source, /class SupabaseHumanActionBoundaryPort/);
    assert.match(source, /complete_active_action_boundary/);
    assert.match(source, /actionKind:\s*'bid'/);
    assert.match(source, /actionKind:\s*'card'/);
    assert.doesNotMatch(source, /return json\(await service\.(submitBid|playCard)\(/);
  });
  test(`copy ${index + 1} supports deterministic completion recovery and timer races`, () => {
    assert.match(source, /human-complete:\$\{input\.roundCommandId\}/);
    assert.match(source, /completedCommand\?\.accepted === true/);
    assert.match(source, /\['running', 'assistant-pending', 'bot-processing'\]/);
    assert.match(source, /turn_action_kind/);
    assert.match(source, /turn_seat/);
  });
}
```

Run:

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayHumanActionBoundaryEdgeFunction.test.js
```

Expected: RED because human routes still return the round result directly.

- [ ] **Step 2: Import the coordinator in both copies**

Repository copy uses `../../../src/online/gameplay/HumanActionBoundaryCoordinator.ts`; isolated copy uses `../../../../src/online/gameplay/HumanActionBoundaryCoordinator.ts`.

Import:

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

Delete the local `nextTurn()` function and replace the bot-path call with `nextAuthoritativeTurn(botResult.value)`.

- [ ] **Step 3: Add the Supabase boundary port in both copies**

Add after `userRpc()`:

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
    const completedCommand = await commandRecord(this.serviceClient, input.tableId, completionId);
    if (completedCommand?.accepted === true) return { valid: true, completed: true };

    const { data: tableData, error: tableError } = await this.serviceClient
      .from('gameplay_tables').select('workspace_id').eq('id', input.tableId).single();
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
    const recoverableStatuses = ['running', 'assistant-pending', 'bot-processing'];

    if (
      typeof control?.version !== 'number'
      || control.lifecycle !== 'active'
      || typeof seat?.seat_number !== 'number'
      || seat.control_owner !== 'human'
      || control.turn_seat !== seat.seat_number
      || control.turn_action_kind !== input.actionKind
      || typeof control.turn_status !== 'string'
      || !recoverableStatuses.includes(control.turn_status)
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

- [ ] **Step 4: Route `submit-bid` and `play-card` through the coordinator**

Construct once:

```ts
const humanBoundary = new SupabaseHumanActionBoundaryPort(serviceClient, authClient);
```

Bid route:

```ts
return json(await coordinateHumanRoundAction({
  tableId: body.tableId,
  actorUserId: actor.userId,
  roundCommandId: body.commandId!,
  actionKind: 'bid',
  boundary: humanBoundary,
  occurredAt: new Date().toISOString(),
  executeRound: () => service.submitBid(
    body.tableId!, actor, body.commandId!, body.expectedVersion!, body.bid!,
  ),
}));
```

Card route uses the same structure with `actionKind: 'card'` and `service.playCard(...)`.

- [ ] **Step 5: Run focused GREEN**

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test `
  dist/tests/humanActionBoundaryCoordinator.test.js `
  dist/tests/gameplayHumanActionBoundaryEdgeFunction.test.js `
  dist/tests/gameplayBotDirectiveEdgeFunction.test.js
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

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
- Verify: all Task 1–3 changes and this plan.

**Interfaces:**
- Produces: one CI-green SHA, one guarded Function deployment after approval, and hosted synchronization evidence.

- [ ] **Step 1: Add the preserved-table note**

Add exactly:

```text
Solo UAT Bot Retest 4 is preserved as split-state evidence. Do not refresh,
repair, pause, terminate, delete, or reuse it. Human-boundary retesting must
use a new table because its round and active-control ledgers have diverged.
```

- [ ] **Step 2: Run full verification**

```powershell
npm run ci
npm run ci:isolation
git diff --check
git status --short
git diff --stat
```

Expected: both CI commands exit `0`; only coordinator/test, two Function copies, runbook, and plan files changed.

- [ ] **Step 3: Commit and push remaining verified changes**

```powershell
git add docs/GAMEPLAY_UAT_DEPLOYMENT.md docs/superpowers/plans/2026-07-28-human-action-boundary-synchronization.md
git commit -m "docs: record human boundary UAT recovery"
git push origin feature/online-game-bot-mvp
```

- [ ] **Step 4: Verify GitHub CI and PR**

Required on the exact pushed SHA:

```text
Validate package: success
Validate isolation boundaries: success
PR #14: open, draft, unmerged
```

Stop and request explicit deployment approval.

- [ ] **Step 5: Deploy only `gameplay-round-command` after approval**

```powershell
$testedSha = (git rev-parse HEAD).Trim()
$gameplayRef = 'stedjwppoanbmhxsfhcg'
node scripts/isolation/gameplay-target-guard.mjs supabase $gameplayRef --expected-sha $testedSha
node scripts/isolation/deploy-gameplay-function.mjs gameplay-round-command $gameplayRef --expected-sha $testedSha
```

Expected: only `gameplay-round-command` deploys; JWT verification stays enabled.

- [ ] **Step 6: Run fresh hosted UAT**

Create:

```text
Name: Solo UAT Boundary Retest 5
Visibility: Private
Turn timer: 45 seconds
Disconnect grace: 60 seconds
```

Without refreshing:

1. Start once and wait for the human bid turn.
2. Submit one legal estimate once; confirm the next bot acts automatically.
3. Continue to card play.
4. On the first human card turn, play one legal card once.
5. Confirm the next bot acts automatically.
6. Confirm no stale-seat directive error appears.
7. Stop after the next bot card succeeds.

Read-only acceptance query must show:

```text
active-control turn seat = round current turn seat + 1
accepted human completion exists for each accepted human action
no unmatched completion caused by the tested human bid or card
```

Do not select payloads, directives, cards, hands, IDs, seeds, nonces, or commitments.
