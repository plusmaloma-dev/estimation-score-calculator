# Secure Start Game Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the host's Start Game action create a recoverable, secure, authoritative first round rather than only changing the lobby lifecycle.

**Architecture:** An authenticated Edge Function coordinates idempotent table Start, active-control initialization, secure private deal creation, private round-state initialization, and first-turn activation. A pure TypeScript bootstrap service generates the initial House Rules V1 state from a started four-seat table and an injected cryptographic seed source. Every server step uses a deterministic command identity derived from the original Start command so a retry resumes safely after a partial failure.

**Tech Stack:** TypeScript, Web Crypto, existing `FairDealService`, `DeterministicRandomSource`, `HouseRulesRoundEngine`, Supabase Edge Functions, PostgreSQL RPCs, React 19, Vitest, Node test runner.

## Global Constraints

- House Rules V1 only.
- One to four humans; permanent Standard bots fill all vacant seats.
- The browser never receives the seed, shuffled deck, other hands, or service-role credentials.
- The server generates a fresh 256-bit seed with `crypto.getRandomValues`.
- No `Math.random()`, random sorting, modulo-biased selection, Node-only crypto, or `Buffer`.
- Initial dealer/caller is selected deterministically and without bias from the secure seed.
- The first caller is the bid owner and first bidder for round 1; the first card lead is the next seat in table order.
- All Start sub-commands are idempotent and retryable.
- Existing direct table Start remains available only as an internal fallback for tests; the browser uses the session bootstrap when configured.
- PR #14 remains draft and unmerged.

---

### Task 1: Pure Secure Bootstrap Service

**Files:**
- Create: `src/gameplay/session/types.ts`
- Create: `src/gameplay/session/GameplaySessionBootstrapService.ts`
- Test: `tests/gameplaySessionBootstrapService.test.ts`
- Modify: `src/gameplay/types.ts`
- Modify: `src/gameplay/HouseRulesRoundEngine.ts`
- Modify: `src/gameplay/GameplayRoundSnapshotProjector.ts`
- Modify: `src/online/gameplay/roundTypes.ts`
- Modify: `src/online/gameplay/OnlineGameplayRoundService.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: a started four-seat `OnlineGameplayTableSnapshot`, injected 32-byte seed, deal ID, nonce, and `FairDealService`.
- Produces: `GameplaySessionBootstrapResult` containing private `HouseRulesRoundState`, public commitment, dealer seat, first bid turn, and verification record.

- [ ] Write tests proving four-player mapping, 13-card hands, deterministic dealer selection, caller/bid order, first lead, public commitment, private seed retention, and rejection of incomplete tables.
- [ ] Run engine tests and confirm RED because the bootstrap service does not exist.
- [ ] Add `GameplayDealAuditRecord` to the private round state and preserve it through immutable transitions.
- [ ] Implement unbiased dealer selection using `DeterministicRandomSource.nextInt(4)`.
- [ ] Generate the fair deal through `FairDealService.deal` and create the first round through `HouseRulesRoundEngine.create`.
- [ ] Expose only `dealCommitment` through player snapshots and strict online parsing.
- [ ] Run focused and full validation and confirm GREEN.

### Task 2: Idempotent Edge Function Start Orchestration

**Files:**
- Modify: `supabase/functions/gameplay-round-command/index.ts`
- Test: `tests/gameplayStartEdgeFunction.test.ts`

**Interfaces:**
- Consumes browser body `{ action: 'start-game', tableId, expectedVersion, commandId }`.
- Produces a viewer-scoped initial `OnlineGameplayRoundSnapshot`.

- [ ] Write static security/orchestration tests requiring authenticated user resolution, server-only seed creation, deterministic command IDs, table Start, active-control initialization, private round initialization, and first-turn activation.
- [ ] Confirm RED.
- [ ] Add `start-game` to the Edge Function request contract.
- [ ] Call `start_gameplay_table` with the authenticated client and `table-start:<commandId>`.
- [ ] Call `initialize_active_game_control` with `control-init:<commandId>`.
- [ ] Load the authoritative started table and build the private bootstrap result server-side.
- [ ] Call `initialize_gameplay_round_state` with the private state.
- [ ] Call `start_active_game_turn` with `turn-start:<commandId>` and the generated first bid turn.
- [ ] On retry, load and return the existing scoped round if each prior step already succeeded.
- [ ] Never serialize private deal audit data in the response.
- [ ] Run full validation and confirm GREEN.

### Task 3: Typed Browser Start Service and Waiting-Room Wiring

**Files:**
- Modify: `src/online/gameplay/OnlineGameplayRoundService.ts`
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/screens/GameplayTableScreen.tsx`
- Test: `tests/onlineGameplayStartService.test.ts`
- Test: `src/app/screens/GameplayTableStartBootstrap.test.tsx`

**Interfaces:**
- Produces: `OnlineGameplayRoundService.startGame(tableId, expectedVersion, commandId)`.
- The waiting room uses this method when configured and navigates only after receiving a valid initial round snapshot.

- [ ] Add RED tests for public Start request shape, strict snapshot parsing, error propagation, and waiting-room navigation.
- [ ] Implement `startGame` using the existing authenticated Edge Function.
- [ ] Extend `GameplayRoundPort` with optional `startGame` for backward-compatible test doubles.
- [ ] Change the waiting-room Start handler to prefer `gameplayRound.startGame`; retain direct table Start only when bootstrap is unavailable.
- [ ] Confirm that failed bootstrap keeps the host in the waiting room and displays the authoritative error.
- [ ] Run full validation and confirm GREEN.

### Task 4: Opening Permanent-Bot Kickoff and Recovery

**Files:**
- Modify: `supabase/functions/gameplay-round-command/index.ts`
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Test: `tests/gameplayStartBotKickoff.test.ts`
- Test: `src/app/screens/GameplayStartBotRecovery.test.tsx`

**Interfaces:**
- The first turn is always persisted as `running`.
- Existing deadline/directive orchestration immediately evaluates a permanent-bot first seat and executes it using the verified Task 6 pipeline.

- [ ] Add tests for a bot first bidder and a human first bidder.
- [ ] Confirm RED where required.
- [ ] Verify the Start response contains the initial turn identity and scoped round state.
- [ ] Ensure the active screen can recover the first bot directive after navigation or reconnect.
- [ ] Run complete validation and confirm GREEN.

### Task 5: Delivery Record and Release Gates

**Files:**
- Modify: `docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md`
- Create: `docs/superpowers/reports/2026-07-26-start-game-bootstrap-delivery.md`
- Update: PR #14 body

- [ ] Record RED/GREEN CI runs and exact files changed.
- [ ] Document the dealer/caller/first-lead baseline used by the bootstrap.
- [ ] State that live PostgreSQL, RLS, Edge runtime, and multi-browser testing remain unverified until deployment.
- [ ] Run fresh full repository validation before reporting completion.
