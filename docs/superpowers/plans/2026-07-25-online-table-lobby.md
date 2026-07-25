# Online Gameplay Table and Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the authoritative pre-game table/lobby subsystem for public and private four-seat gameplay tables, including joining, approval requests, host succession, settings, bot seat filling, Supabase persistence, RLS, and snapshot access.

**Architecture:** First implement a pure immutable TypeScript table engine that owns lifecycle rules without database dependencies. Add versioned table commands around it. Then persist the same command boundaries through security-definer Supabase RPCs and expose them through a typed online service. Realtime and React consume authoritative snapshots later; clients never write table rows directly.

**Tech Stack:** TypeScript 5.5+, Node test runner, Supabase PostgreSQL/RLS/RPC, Supabase JS client abstractions, GitHub Actions.

## Global Constraints

- House Rules V1 only for the gameplay MVP.
- Exactly four seats indexed `0..3` in TypeScript and stored as `1..4` in PostgreSQL.
- Table visibility is `private` or `public`.
- Public join policy is `open` or `approval-required`.
- Turn timer values: `20 | 30 | 45 | 60 | 90`; default `45` seconds.
- Disconnect grace values: `30 | 60 | 90 | 120`; default `60` seconds.
- Settings and seat assignment lock when Start succeeds.
- Start requires the current host and at least one connected human; every vacant seat becomes a clearly identified permanent Standard bot.
- A permanent pre-game bot cannot be replaced after Start.
- Before Start, a departing host transfers authority to the connected human with the earliest accepted join timestamp; no remaining human closes the table.
- Active-game host transfer and temporary bot takeover are deferred to the timer/control plan.
- Clients propose commands with command ID and expected version; only server-authoritative code commits state.
- Direct authenticated writes to gameplay tables are not granted.
- Every accepted/rejected command and host transfer is auditable.
- Existing score-calculator `games` semantics remain unchanged; gameplay tables use separate persistence objects.
- `npm run ci` must pass after every TypeScript task.

---

### Task 1: Immutable table lifecycle, settings, and open joining

**Files:**
- Create: `src/gameplay/table/types.ts`
- Create: `src/gameplay/table/GameplayTableEngine.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayTableEngine.test.ts`

**Interfaces:**

```ts
export type GameplayTableVisibility = 'private' | 'public';
export type GameplayTableJoinPolicy = 'open' | 'approval-required';
export type GameplayTableLifecycle = 'lobby' | 'active' | 'paused' | 'completed' | 'terminated' | 'closed';
export type GameplaySeatKind = 'human' | 'bot';
export type TurnTimerSeconds = 20 | 30 | 45 | 60 | 90;
export type DisconnectGraceSeconds = 30 | 60 | 90 | 120;

export interface GameplayTableSeat {
  readonly seat: SeatIndex;
  readonly kind: GameplaySeatKind;
  readonly userId?: string;
  readonly botId?: string;
  readonly displayName: string;
  readonly joinedAt: string;
}

export interface GameplayJoinRequest {
  readonly requestId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly requestedSeat?: SeatIndex;
  readonly requestedAt: string;
  readonly status: 'pending' | 'accepted' | 'rejected';
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
}

export interface GameplayTableState {
  readonly tableId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly lifecycle: GameplayTableLifecycle;
  readonly visibility: GameplayTableVisibility;
  readonly joinPolicy: GameplayTableJoinPolicy;
  readonly hostUserId?: string;
  readonly turnTimerSeconds: TurnTimerSeconds;
  readonly disconnectGraceSeconds: DisconnectGraceSeconds;
  readonly settingsLocked: boolean;
  readonly seats: readonly GameplayTableSeat[];
  readonly joinRequests: readonly GameplayJoinRequest[];
  readonly createdAt: string;
}

export interface GameplayTableTransition {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly state: GameplayTableState;
}
```

`GameplayTableEngine` methods:

```ts
create(input: CreateGameplayTableInput): GameplayTableState;
updateSettings(state, actorUserId, patch): GameplayTableTransition;
joinOpenTable(state, input): GameplayTableTransition;
leaveLobby(state, actorUserId, occurredAt): GameplayTableTransition;
start(state, actorUserId, occurredAt): GameplayTableTransition;
```

Tests first prove:

1. Host creation seats one human and applies default timers.
2. Duplicate users and occupied requested seats are rejected without mutation.
3. Private tables require `privateAccessGranted: true` before joining.
4. Public approval-required tables reject direct open join.
5. Only host can change lobby settings; settings reject invalid timer values.
6. Start fills all vacant seats with deterministic IDs `standard-bot:<tableId>:<seat>`.
7. Start locks settings and blocks later joining.
8. Host leave transfers to earliest joined remaining human; no humans closes the table.

Acceptance command: `npm run ci`.

---

### Task 2: Approval-required join requests and host decisions

**Files:**
- Extend: `src/gameplay/table/types.ts`
- Modify: `src/gameplay/table/GameplayTableEngine.ts`
- Test: `tests/gameplayTableJoinRequests.test.ts`

Methods:

```ts
requestJoin(state, input): GameplayTableTransition;
respondToJoinRequest(state, actorUserId, requestId, decision, occurredAt): GameplayTableTransition;
```

Rules:

- Only public `approval-required` lobby tables accept requests.
- One pending request per user.
- Only the current host may accept/reject.
- Acceptance atomically claims the requested vacant seat or first vacant seat.
- A request whose requested seat became occupied is rejected without a partial seat mutation.
- Accepted/rejected requests remain in history.
- Start rejects while pending requests exist; the host must resolve or reject them first.

Acceptance command: `npm run ci`.

---

### Task 3: Versioned and idempotent table command processor

**Files:**
- Extend: `src/gameplay/table/types.ts`
- Create: `src/gameplay/table/GameplayTableCommandProcessor.ts`
- Test: `tests/gameplayTableCommandProcessor.test.ts`

Commands cover update settings, open join, request join, respond request, leave, and start. Every envelope has `commandId`, `expectedVersion`, actor, occurrence timestamp, and payload. Accepted commands increment once; rejected/stale commands retain version; same ID/same payload returns original outcome; same ID/different payload is an integrity conflict.

Acceptance command: `npm run ci`.

---

### Task 4: Supabase gameplay table schema, RLS, and transactional RPCs

**Files:**
- Create: `supabase/migrations/202607250004_gameplay_tables.sql`
- Create: `supabase/migrations/202607250005_gameplay_tables_rls.sql`
- Create: `supabase/migrations/202607250006_gameplay_table_rpc.sql`
- Test: `tests/gameplayTableSchema.test.ts`

Schema:

- `gameplay_tables`: workspace, name, visibility, join policy, lifecycle, host user, timers, settings lock, version, timestamps.
- `gameplay_table_seats`: table, seat number, seat kind, human user or bot ID, display-name snapshot, joined time; constraints enforce exactly one human/bot identifier for its kind.
- `gameplay_join_requests`: pending/accepted/rejected requests and resolution metadata.
- `gameplay_table_commands`: command ID, expected/resulting versions, payload, accepted flag, errors, actor, timestamp; unique per table/command ID.
- `gameplay_table_events`: append-only lifecycle/join/host/start events.

RLS:

- Workspace membership remains the authentication boundary.
- Public lobby rows may be selected by workspace members.
- Private table details are selectable only by seated humans, table host, or workspace admins.
- Seat-private data for active gameplay remains outside public lobby projections.
- No direct insert/update/delete grants to authenticated clients.

RPCs:

- `create_gameplay_table`
- `update_gameplay_table_settings`
- `join_gameplay_table`
- `request_gameplay_table_join`
- `respond_gameplay_join_request`
- `leave_gameplay_table`
- `start_gameplay_table`
- `get_gameplay_lobby`
- `get_gameplay_table_snapshot`

Each RPC asserts `auth.uid() = p_actor_user_id`, workspace membership, expected version/idempotency, table lifecycle, host authority where required, and commits command/event/snapshot changes atomically.

Static schema tests assert security-definer fixed search paths, revoked public access, authenticated execute grants, constraints, and required JSON snapshot sections.

---

### Task 5: Typed online table service adapter

**Files:**
- Create: `src/online/gameplay/types.ts`
- Create: `src/online/gameplay/OnlineGameplayTableService.ts`
- Test: `tests/onlineGameplayTableService.test.ts`

Follow the existing `OnlineGameDatabase.rpc` abstraction. Every method supplies workspace/actor IDs from `AuthSessionState`, validates client input before RPC, parses incomplete payloads as explicit failures, and never accepts service-role credentials.

Methods:

```ts
createTable(input)
listLobby()
openTable(tableId)
updateSettings(tableId, expectedVersion, patch, commandId)
joinTable(tableId, expectedVersion, input, commandId)
requestJoin(tableId, expectedVersion, input, commandId)
respondJoinRequest(tableId, expectedVersion, requestId, decision, commandId)
leaveTable(tableId, expectedVersion, commandId)
startTable(tableId, expectedVersion, commandId)
```

Acceptance command: `npm run ci`.

---

### Task 6: Realtime-safe public/private snapshot projection

**Files:**
- Create: `src/online/gameplay/GameplayTableSnapshotProjector.ts`
- Test: `tests/gameplayTableSnapshotProjection.test.ts`

Produce:

- Public lobby card: no private code, no private-hand/deal fields, only host display, occupied count, join policy, timers, lifecycle, and version.
- Seated table member snapshot: table settings, seats, relevant join requests, lifecycle/version.
- Host snapshot: pending requests and host controls.
- No projection includes hands, seed, shuffled deck, or unpublished bot decisions.

Tests enumerate exact own-property keys and scan serialized payloads for forbidden fields.

Acceptance command: `npm run ci`.
