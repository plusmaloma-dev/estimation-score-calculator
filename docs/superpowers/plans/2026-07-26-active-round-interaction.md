# Active Round Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a privacy-safe, server-authoritative online House Rules V1 round that supports human bidding, legal card play, Standard-bot directives, trick progression, scoring, replay, and verification.

**Architecture:** Keep the existing framework-agnostic round engine authoritative. Add a player-scoped projection and versioned online command service around it, then render only the authenticated player’s hand plus public round data in React. Realtime messages are invalidation signals; every mutation or notification is followed by an authoritative snapshot reload.

**Tech Stack:** TypeScript, React, Vitest/Testing Library, Node test runner, Supabase PostgreSQL/RPC/RLS/Realtime, existing House Rules V1 engine and Standard bot.

## Global Constraints

- House Rules V1 only.
- Total estimates must never equal 13.
- A client may receive only its own hand and public state.
- Opponent hands, deal seed, shuffled deck, and bot private observations must never reach browser DTOs.
- Every mutation requires a command ID and expected version.
- Duplicate commands are idempotent; conflicting duplicates are rejected.
- Standard bots use the existing policy and legal-action validation.
- React must not duplicate scoring, bidding, or follow-suit rules.
- PR #14 remains draft and must not be merged without explicit approval.
- Live Supabase execution remains a release gate.

---

### Task 1: Player-scoped round projection

**Files:**
- Create: `src/gameplay/GameplayPlayerSnapshotProjector.ts`
- Modify: `src/gameplay/types.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayPlayerSnapshotProjection.test.ts`

**Interfaces:**
- Consumes: `HouseRulesRoundState`, `SeatIndex`, `LegalCardPlayService`
- Produces: `GameplayPlayerSnapshotProjector.project(state, viewerSeat)` returning own hand, legal actions, public bids/tricks/totals, phase, current turn, and score result without opponent cards.

- [ ] Write failing tests proving own-hand visibility, opponent-card exclusion, public-state completeness, and legal-action projection.
- [ ] Run focused test and confirm RED because the projector is absent.
- [ ] Implement explicit allow-listed projection without object spreading from authoritative state.
- [ ] Run focused and full validation; record GREEN CI.
- [ ] Commit.

### Task 2: Persistent round schema and authoritative RPCs

**Files:**
- Create: `supabase/migrations/202607260009_gameplay_rounds.sql`
- Create: `supabase/migrations/202607260010_gameplay_round_rpc.sql`
- Modify: `tests/deploymentConfiguration.test.ts`
- Test: `tests/gameplayRoundSchema.test.ts`

**Interfaces:**
- Produces RPCs: `initialize_gameplay_round`, `get_gameplay_player_snapshot`, `submit_gameplay_bid`, `play_gameplay_card`, `process_gameplay_bot_directive`.

- [ ] Write failing static schema/security tests for round state, private hands, commands, player-scoped snapshots, actor checks, version checks, idempotency, and Realtime publication.
- [ ] Confirm RED because migrations/RPCs are absent.
- [ ] Add one-way migrations and update deterministic deployment ordering.
- [ ] Run focused and full validation; record GREEN CI.
- [ ] Commit.

### Task 3: Typed online round service and Realtime synchronization

**Files:**
- Create: `src/online/gameplay/activeRoundTypes.ts`
- Create: `src/online/gameplay/ActiveRoundService.ts`
- Create: `src/online/gameplay/ActiveRoundRealtimeSynchronizer.ts`
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/services/createBrowserServices.ts`
- Test: `tests/activeRoundService.test.ts`
- Test: `tests/activeRoundRealtimeSynchronizer.test.ts`

**Interfaces:**
- Produces typed methods for snapshot, bid, card, and bot directive processing.

- [ ] Write failing tests for strict DTO parsing, session injection, expected version, command IDs, database errors, authoritative reload, and mutation serialization.
- [ ] Confirm RED.
- [ ] Implement strict adapters and invalidation-only Realtime synchronization.
- [ ] Run focused and full validation; record GREEN CI.
- [ ] Commit.

### Task 4: Playable bidding interface

**Files:**
- Create: `src/app/components/OnlineBiddingPanel.tsx`
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Modify: `src/app/i18n/translations.ts`
- Modify: `src/app/styles/gameplay.css`
- Test: `src/app/screens/ActiveGameplayBiddingScreen.test.tsx`

**Interfaces:**
- Consumes player snapshot legal bids and `ActiveRoundService.submitBid`.

- [ ] Write failing UI tests for current bidder, legal bid choices, total-13 exclusion, disabled non-turn controls, authoritative refresh, and error display.
- [ ] Confirm RED.
- [ ] Implement the minimum accessible bidding panel using only legal actions from the snapshot.
- [ ] Run focused and full validation; record GREEN CI.
- [ ] Commit.

### Task 5: Own-hand card play and trick progression

**Files:**
- Create: `src/app/components/OnlineHand.tsx`
- Create: `src/app/components/OnlineTrickTable.tsx`
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Modify: `src/app/styles/gameplay.css`
- Test: `src/app/screens/ActiveGameplayCardPlayScreen.test.tsx`

**Interfaces:**
- Consumes own hand, legal card IDs, current trick, completed trick count, and `ActiveRoundService.playCard`.

- [ ] Write failing UI tests for own-hand-only rendering, legal/illegal card states, follow-suit projection, trick updates, bot-processing state, and scored-round display.
- [ ] Confirm RED.
- [ ] Implement accessible card buttons and public trick table without client-side rule derivation.
- [ ] Run focused and full validation; record GREEN CI.
- [ ] Commit.

### Task 6: Bot directive execution and end-to-end deterministic round

**Files:**
- Create: `src/online/gameplay/BotDirectiveCoordinator.ts`
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Test: `tests/botDirectiveCoordinator.test.ts`
- Test: `src/app/screens/ActiveGameplayRoundCompletion.test.tsx`

**Interfaces:**
- Consumes pending public directive IDs and calls the authoritative bot RPC exactly once.

- [ ] Write failing tests for exactly-once processing, retries, stale directives, errors, and no hidden bot observations in the browser.
- [ ] Confirm RED.
- [ ] Implement coordinator and round-completion UI with score and verification status.
- [ ] Run full validation and deterministic four-seat integration tests; record GREEN CI.
- [ ] Commit.

### Task 7: Delivery record and live integration gate

**Files:**
- Create: `docs/superpowers/reports/2026-07-26-active-round-interaction-delivery.md`
- Modify: `docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md`
- Update: draft PR #14 body

- [ ] Run complete typecheck, tests, and production build on the final branch head.
- [ ] Document RED/GREEN evidence, privacy guarantees, remaining live-Supabase risks, and manual multi-browser UAT steps.
- [ ] Keep PR draft and unmerged.
