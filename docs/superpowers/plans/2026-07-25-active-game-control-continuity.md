# Active Game Control and Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** In progress. Tasks 1–3 are complete; Tasks 4–6 remain.  
**Checkpoint report:** `docs/superpowers/reports/2026-07-25-active-game-control-checkpoint.md`

**Goal:** Add deterministic active-game host controls, turn deadlines, connected-player timeout assistance, disconnect grace, temporary bot takeover, and safe human reclaim without weakening the authoritative gameplay or hidden-information boundaries.

**Architecture:** A pure immutable `ActiveGameControlEngine` owns lifecycle, seat connectivity/control, pause/resume, termination, deadline freezing, host succession, and safe reclaim. A separate deadline evaluator emits auditable bot-action directives but never plays a card or bid itself. Versioned command processing and Supabase RPCs persist the same transitions; a typed Realtime synchronizer reloads authoritative snapshots after reconnects or ambiguous command outcomes.

**Tech Stack:** TypeScript 5.5+, Node test runner, existing gameplay/table/bot domain services, Supabase PostgreSQL/RLS/RPC/Realtime abstractions, GitHub Actions.

## Global Constraints

- House Rules V1 only.
- Active control begins only after a four-seat gameplay table has successfully started.
- Permanent bots remain permanent and cannot be reclaimed by humans.
- Turn timer values remain `20 | 30 | 45 | 60 | 90` seconds and are locked after Start.
- Disconnect grace values remain `30 | 60 | 90 | 120` seconds and are locked after Start.
- A connected human timeout triggers exactly one Standard bot action for that turn and never transfers seat ownership.
- Repeated connected-human timeouts may continue indefinitely, one action per expired turn.
- A disconnected human receives normal one-turn timeout assistance during the grace period.
- Grace expiry transfers only temporary seat control to a Standard bot.
- A returning human reclaims at the next safe uncommitted action boundary.
- An already committed or transactionally processing bot action remains final.
- Active host disconnection transfers host privileges immediately to the longest-connected remaining human.
- Host privileges do not automatically return on reconnection.
- Pause freezes turn deadlines, disconnect grace deadlines, and uncommitted bot directives.
- Resume restores the exact remaining durations.
- Confirmed termination stops timers/directives, rejects future gameplay writes, and preserves history.
- Every timeout, disconnect, takeover, reconnect, reclaim, host transfer, pause, resume, and termination is auditable.
- Server-authoritative expected-version and idempotency checks remain mandatory.
- No control snapshot or Realtime payload may contain hands, seed, shuffled deck, future cards, or unpublished bot decisions.
- `npm run ci` is required after every TypeScript task.

---

### Task 1: Active lifecycle, pause/resume, termination, and host succession — Complete

**Delivered:**
- `src/gameplay/control/types.ts`
- `src/gameplay/control/ActiveGameControlEngine.ts`
- `src/index.ts`
- `tests/activeGameControlEngine.test.ts`

**Verified:** started-table validation, permanent bot controls, host-only administration, exact pause/resume timer freezing, confirmed termination, read-only terminated state.

**TDD evidence:** RED #760 / GREEN #766.

---

### Task 2: Disconnect grace, immediate active-host succession, and safe reclaim — Complete

**Delivered:**
- Extended `src/gameplay/control/types.ts`
- Extended `src/gameplay/control/ActiveGameControlEngine.ts`
- `tests/activeGameConnectionControl.test.ts`

**Verified:** disconnect grace, duplicate protection, immediate host transfer, last-human handling, temporary takeover, reconnect during grace, reconnect after takeover, non-interruption of processing bot action, safe boundary reclaim, permanent bot protection.

**TDD evidence:** RED #767 / GREEN #769.

---

### Task 3: Deterministic turn deadlines and one-action bot directives — Complete

**Delivered:**
- Extended `src/gameplay/control/types.ts`
- `src/gameplay/control/ActiveGameControlEngineWithTurns.ts`
- `src/gameplay/control/ActiveGameDeadlineService.ts`
- `tests/activeGameDeadlines.test.ts`

**Verified:** configured turn deadlines, no early directive, exactly-once connected timeout assistance, grace-period timeout assistance, immediate permanent/temporary bot directives, pause/termination suppression, deterministic directive IDs, and one-action-only ownership behavior.

**TDD evidence:** RED #770 / GREEN #774.

**Refactor note:** the public turn-capable engine currently extends the verified lifecycle/connection engine. Consolidate the classes after command/replay and persistence contracts stabilize.

---

### Task 4: Versioned control commands and replayable audit events

**Files:**
- Extend: `src/gameplay/control/types.ts`
- Create: `src/gameplay/control/ActiveControlCommandProcessor.ts`
- Create: `src/gameplay/control/ActiveControlReplayService.ts`
- Test: `tests/activeControlCommandProcessor.test.ts`
- Test: `tests/activeControlReplay.test.ts`

**Commands:**

```ts
export type ActiveControlCommand =
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'TERMINATE'; readonly confirmed: boolean }
  | { readonly type: 'DISCONNECT'; readonly userId: string }
  | { readonly type: 'RECONNECT'; readonly userId: string }
  | { readonly type: 'EVALUATE_GRACE' }
  | { readonly type: 'START_TURN'; readonly turnId: string; readonly seat: SeatIndex; readonly actionKind: 'bid' | 'card' }
  | { readonly type: 'BEGIN_BOT_ACTION'; readonly seat: SeatIndex; readonly turnId: string }
  | { readonly type: 'COMPLETE_ACTION_BOUNDARY'; readonly nextTurn?: StartTurnInput };
```

- [ ] **Step 1: Write failing command and replay tests**

Prove accepted increment-once behavior, stale rejection, same-ID retry identity, payload conflict, rejected-event recording, event ordering, and deterministic state rebuilding/tamper detection.

- [ ] **Step 2: Run RED verification**

Run: `npm run ci`  
Expected: FAIL because processor/replay APIs are absent.

- [ ] **Step 3: Implement minimum processor and replay service**

Use the same record structure and integrity semantics as `GameplayTableCommandProcessor`, without sharing mutable records.

- [ ] **Step 4: Run GREEN verification**

Run: `npm run ci`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameplay/control tests/activeControlCommandProcessor.test.ts tests/activeControlReplay.test.ts
git commit -m "feat: add versioned active control commands"
```

---

### Task 5: Supabase active-control persistence and RPC extensions

**Files:**
- Create: `supabase/migrations/202607250007_active_game_control.sql`
- Create: `supabase/migrations/202607250008_active_game_control_rpc.sql`
- Modify: `tests/deploymentConfiguration.test.ts`
- Test: `tests/activeGameControlSchema.test.ts`

**Persistence:**
- `gameplay_active_controls`: lifecycle, host, timers, turn clock, version, pause/termination metadata.
- `gameplay_active_seat_controls`: connection, owner, grace/reclaim fields per seat.
- `gameplay_active_control_commands`: idempotent command envelope/outcome.
- Control events continue in append-only `gameplay_table_events`.

**RPCs:**
- `initialize_active_game_control`
- `pause_active_game`
- `resume_active_game`
- `terminate_active_game`
- `disconnect_active_game_user`
- `reconnect_active_game_user`
- `evaluate_active_game_deadlines`
- `start_active_game_turn`
- `begin_active_bot_action`
- `complete_active_action_boundary`
- `get_active_game_control_snapshot`

- [ ] **Step 1: Write failing static schema/security tests**

Require tables, constraints, fixed search paths, `auth.uid()` actor binding, expected versions, idempotency, host checks, seat-scoped state, no direct writes, explicit execute grants, and safe snapshot keys.

- [ ] **Step 2: Run RED verification**

Run: `npm run ci`  
Expected: FAIL because migrations are absent.

- [ ] **Step 3: Implement one-way migrations and RPCs**

Do not alter existing score-calculator tables. Keep private hands outside control snapshots.

- [ ] **Step 4: Run GREEN verification**

Run: `npm run ci`  
Expected: PASS static validation. Record that live PostgreSQL/Supabase execution remains a deployment gate.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/activeGameControlSchema.test.ts tests/deploymentConfiguration.test.ts
git commit -m "feat: persist active game control state"
```

---

### Task 6: Realtime reconnect and authoritative snapshot synchronization

**Files:**
- Create: `src/online/gameplay/ActiveGameControlService.ts`
- Create: `src/online/gameplay/ActiveGameRealtimeSynchronizer.ts`
- Test: `tests/activeGameControlService.test.ts`
- Test: `tests/activeGameRealtimeSynchronizer.test.ts`

**Interfaces:**

```ts
export interface GameplayRealtimeChannel {
  on(event: 'postgres_changes', filter: Readonly<Record<string, unknown>>, callback: () => void): GameplayRealtimeChannel;
  subscribe(callback: (status: string) => void): GameplayRealtimeChannel;
  unsubscribe(): Promise<void>;
}

export interface GameplayRealtimeClient extends OnlineGameplayTableDatabase {
  channel(name: string): GameplayRealtimeChannel;
}

ActiveGameRealtimeSynchronizer.connect(tableId, onSnapshot, onError): Promise<void>;
ActiveGameRealtimeSynchronizer.refresh(): Promise<void>;
ActiveGameRealtimeSynchronizer.disconnect(): Promise<void>;
```

- [ ] **Step 1: Write failing service/synchronizer tests**

Prove RPC routing, strict parsing, one channel per table, authoritative refresh after subscription/reconnect, event coalescing, unsubscribe cleanup, and ambiguous mutation failure causing snapshot reload before another command is allowed.

- [ ] **Step 2: Run RED verification**

Run: `npm run ci`  
Expected: FAIL because service/synchronizer APIs are absent.

- [ ] **Step 3: Implement minimum typed service and synchronizer**

Realtime events are invalidation signals only. Never derive authoritative state by merging row payloads in the browser.

- [ ] **Step 4: Run GREEN verification**

Run: `npm run ci`  
Expected: PASS.

- [ ] **Step 5: Commit and document**

```bash
git add src/online/gameplay tests/activeGameControlService.test.ts tests/activeGameRealtimeSynchronizer.test.ts docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md
git commit -m "feat: synchronize active game control state"
```

## Self-review record

- Spec coverage: turn timer, repeated one-action assistance, disconnect grace, takeover, safe reclaim, active host succession, pause/resume freeze, termination, auditing, server authority, and Realtime reload are each assigned to a task.
- Type consistency: control state, transitions, turn input, directives, and command names are defined before later use.
- Privacy coverage: control state intentionally contains no cards, hands, deal seed, or bot policy observation.
- Deployment limitation: static SQL validation is not treated as live Supabase verification.
