# Online Gameplay Table and Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Status:** Complete on `feature/online-game-bot-mvp` as of 25 July 2026.  
**Delivery report:** `docs/superpowers/reports/2026-07-25-online-table-lobby-delivery.md`

**Goal:** Deliver the authoritative pre-game table/lobby subsystem for public and private four-seat gameplay tables, including joining, approval requests, host succession, settings, bot seat filling, Supabase persistence, RLS, and snapshot access.

**Architecture:** A pure immutable TypeScript table engine owns lifecycle rules without database dependencies. Versioned table commands wrap the engine. Security-definer Supabase RPCs persist the same command boundaries. Typed online services and allow-listed projections expose authoritative snapshots; clients never write table rows directly.

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

### Task 1: Immutable table lifecycle, settings, and open joining — Complete

**Delivered files:**
- `src/gameplay/table/types.ts`
- `src/gameplay/table/GameplayTableEngine.ts`
- `src/index.ts`
- `tests/gameplayTableEngine.test.ts`

**Verified behavior:**
- Host creation seats one human and applies default timers.
- Duplicate users and occupied requested seats are rejected without mutation.
- Private tables require explicit access before joining.
- Public approval-required tables reject direct open join.
- Only the host can change lobby settings; invalid timers are rejected.
- Start fills vacant seats with deterministic Standard bot IDs.
- Start locks settings and blocks later joining.
- Host leave transfers to the earliest joined remaining human; no humans closes the table.

**TDD evidence:** RED #735 / GREEN #738.

---

### Task 2: Approval-required join requests and host decisions — Complete

**Delivered files:**
- `src/gameplay/table/types.ts`
- `src/gameplay/table/GameplayTableEngine.ts`
- `tests/gameplayTableJoinRequests.test.ts`

**Verified behavior:**
- Only public approval-required lobby tables accept requests.
- One pending request per user.
- Only the current host may accept or reject.
- Acceptance atomically claims the requested vacant seat or first vacant seat.
- Occupied requested seats reject without partial mutation.
- Resolved requests remain in history.
- Start rejects while pending requests exist.

**TDD evidence:** RED #739 / GREEN #741.

---

### Task 3: Versioned and idempotent table command processor — Complete

**Delivered files:**
- `src/gameplay/table/types.ts`
- `src/gameplay/table/GameplayTableCommandProcessor.ts`
- `tests/gameplayTableCommandProcessor.test.ts`

**Verified behavior:**
- Settings, open join, request join, response, leave, and Start commands.
- Accepted commands increment once.
- Rejected and stale commands retain the version and are recorded.
- Same ID and envelope returns the original outcome.
- Same ID with a different envelope is an integrity conflict.

**TDD evidence:** RED #742 / GREEN #745.

---

### Task 4: Supabase gameplay table schema, RLS, and transactional RPCs — Complete with deployment verification pending

**Delivered files:**
- `supabase/migrations/202607250004_gameplay_tables.sql`
- `supabase/migrations/202607250005_gameplay_tables_rls.sql`
- `supabase/migrations/202607250006_gameplay_table_rpc.sql`
- `tests/gameplayTableSchema.test.ts`
- `tests/deploymentConfiguration.test.ts`

**Delivered persistence:**
- Gameplay tables, seats, requests, commands, and events.
- Workspace-scoped RLS and no direct authenticated writes.
- Security-definer RPCs for create, settings, join, request, respond, leave, Start, lobby, and snapshot.
- Safe JSON snapshots without hand/deal/bot-decision secrets.

**TDD evidence:** RED #746 / GREEN #750.

**Open release gate:** migrations have not yet been executed against a live/local Supabase PostgreSQL instance.

---

### Task 5: Typed online table service adapter — Complete

**Delivered files:**
- `src/online/gameplay/types.ts`
- `src/online/gameplay/OnlineGameplayTableService.ts`
- `tests/onlineGameplayTableService.test.ts`

**Verified behavior:**
- Session workspace/actor injection.
- Client validation before RPC invocation.
- Strict lobby and table snapshot parsing.
- Explicit database, domain-rejection, and incomplete-response failures.
- No service-role credentials.

**TDD evidence:** RED #751 / GREEN #753.

---

### Task 6: Realtime-safe public/private snapshot projection — Complete

**Delivered files:**
- `src/online/gameplay/GameplayTableSnapshotProjector.ts`
- `tests/gameplayTableSnapshotProjection.test.ts`

**Verified behavior:**
- Exact allow-listed public lobby card.
- Seated member snapshot with own request history.
- Host/Admin request visibility with host powers kept host-only.
- Explicit Start/settings permission projection.
- Malicious extra fields, hands, seeds, deck state, and unpublished decisions cannot leak through projections.

**TDD evidence:** RED #754 / GREEN #755.

## Final verification

CI run #755 passed repository typechecking, the complete test suite, and the production build.
