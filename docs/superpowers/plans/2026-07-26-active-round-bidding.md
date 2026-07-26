# Active Round Bidding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first server-authoritative active-round interaction slice: a privacy-safe player snapshot, versioned bid commands, authenticated Edge Function boundary, and a React estimate-submission interface that advances an initialized House Rules V1 round into card play.

**Architecture:** The existing framework-agnostic `HouseRulesRoundEngine` and `GameplayCommandProcessor` remain the only rule authority. A transport-neutral application service loads a full private round aggregate, verifies actor seat control, processes one command, and atomically commits the resulting aggregate through a repository port. A seat-scoped projector returns only the authenticated player's own hand plus public bids/tricks. Supabase Edge Functions adapt HTTP/authentication to this service; PostgreSQL RPCs persist state and command records but do not duplicate game rules.

**Tech Stack:** TypeScript, Node test runner, React 19, Vitest/Testing Library, Supabase Edge Functions, PostgreSQL migrations/RLS/RPCs, Supabase Realtime, Vite.

## Global Constraints

- Work only on `feature/online-game-bot-mvp`; do not modify the UAT branch.
- Keep PR #14 draft and unmerged.
- House Rules V1 only.
- Current slice begins from an initialized round with known `bidOwnerSeat`, bid order, hands, and first lead; it does not invent a separate pre-estimate contract-auction rule.
- Total estimates must never equal 13.
- Clients receive only their own hand and public played-card/bid state.
- Opponent hands, shuffled deck, seed, nonce, and unrevealed deal material must never enter browser DTOs.
- Every mutation requires authenticated actor identity, seat-control authorization, command ID, and expected version.
- Duplicate command IDs return the recorded outcome; conflicting reuse is rejected.
- PostgreSQL enforces atomicity/idempotency only; TypeScript decides gameplay legality.
- React submits commands and renders authoritative snapshots; it does not duplicate scoring or follow-suit logic.
- Use RED/GREEN TDD and run complete typecheck, test suite, and production build before delivery claims.

---

## File Structure

- `src/gameplay/GameplayRoundSnapshotProjector.ts`: allow-listed, seat-scoped projection from private round state.
- `src/gameplay/GameplayRoundApplicationService.ts`: actor authorization, command processing, and atomic repository orchestration.
- `src/gameplay/roundApplicationTypes.ts`: aggregate, repository, actor-control, and application-result contracts.
- `src/online/gameplay/roundTypes.ts`: browser-safe round DTOs and command inputs.
- `src/online/gameplay/OnlineGameplayRoundService.ts`: authenticated Edge Function client with strict DTO parsing.
- `src/online/gameplay/GameplayRoundRealtimeSynchronizer.ts`: invalidation-only Realtime channel and authoritative reload.
- `supabase/migrations/202607260009_gameplay_round_state.sql`: private aggregate, commands, and public invalidation records.
- `supabase/migrations/202607260010_gameplay_round_rpc.sql`: narrow load/commit/snapshot helper RPCs for the Edge Function.
- `supabase/functions/gameplay-round-command/index.ts`: authenticated Edge Function adapter.
- `src/app/components/GameplayBidPanel.tsx`: legal estimate/trump controls and public bid progress.
- `src/app/screens/ActiveGameplayScreen.tsx`: integrates the round snapshot beside continuity controls.
- `tests/gameplayRoundSnapshotProjection.test.ts`: privacy and legal-action projection.
- `tests/gameplayRoundApplicationService.test.ts`: actor/version/idempotency orchestration.
- `tests/gameplayRoundSchema.test.ts`: static schema/RLS/RPC/Edge boundary contract.
- `tests/onlineGameplayRoundService.test.ts`: strict browser client parsing and command routing.
- `tests/gameplayRoundRealtimeSynchronizer.test.ts`: invalidation/reload behavior.
- `src/app/screens/ActiveGameplayBiddingScreen.test.tsx`: React bidding flow.

---

### Task 1: Privacy-safe active-round snapshot

**Files:**
- Create: `src/online/gameplay/roundTypes.ts`
- Create: `src/gameplay/GameplayRoundSnapshotProjector.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayRoundSnapshotProjection.test.ts`

**Interfaces:**
- Consumes: `HouseRulesRoundState`, `HouseRulesRoundEngine.legalCards(state, seat)`, `SeatIndex`, and authoritative version.
- Produces: `GameplayRoundSnapshotProjector.project(tableId, state, version, viewerSeat): OnlineGameplayRoundSnapshot`.

- [ ] **Step 1: Write failing projection tests**

Create fixtures with unique cards in each seat. Assert that a bidding snapshot includes public player/estimate state, the viewer's 13 cards, the next bid seat, and legal normal estimates. Assert serialized output contains none of the other 39 card IDs and none of `seedHex`, `nonce`, `shuffledDeck`, or `hands`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- tests/gameplayRoundSnapshotProjection.test.ts`

Expected: FAIL because `GameplayRoundSnapshotProjector` and `OnlineGameplayRoundSnapshot` do not exist.

- [ ] **Step 3: Implement allow-listed DTOs and projector**

Define:

```ts
export interface OnlineGameplayRoundPlayer {
  readonly seat: SeatIndex;
  readonly playerId: string;
  readonly cardCount: number;
  readonly bid?: EstimationBid;
  readonly actualTricks: number;
}

export interface OnlineGameplayRoundSnapshot {
  readonly tableId: string;
  readonly roundNumber: number;
  readonly phase: GameplayRoundPhase;
  readonly version: number;
  readonly viewerSeat: SeatIndex;
  readonly bidOwnerSeat: SeatIndex;
  readonly nextBidSeat?: SeatIndex;
  readonly currentTurnSeat?: SeatIndex;
  readonly players: readonly OnlineGameplayRoundPlayer[];
  readonly ownHand: readonly Card[];
  readonly legalNormalEstimates: readonly number[];
  readonly legalCards: readonly Card[];
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly completedTricks: readonly CompletedGameplayTrick[];
  readonly scoreResult?: MvpRoundResult;
}
```

For the fourth estimate, remove the value that would make the total exactly 13. For other bidding turns expose 0–12. Expose legal cards only when the viewer owns the current card turn. Build each property explicitly; never spread `HouseRulesRoundState`.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
npm test -- tests/gameplayRoundSnapshotProjection.test.ts
npm run typecheck
npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/online/gameplay/roundTypes.ts src/gameplay/GameplayRoundSnapshotProjector.ts src/index.ts tests/gameplayRoundSnapshotProjection.test.ts
git commit -m "feat: add privacy-safe active round snapshots"
```

---

### Task 2: Authoritative round application service

**Files:**
- Create: `src/gameplay/roundApplicationTypes.ts`
- Create: `src/gameplay/GameplayRoundApplicationService.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayRoundApplicationService.test.ts`

**Interfaces:**
- Consumes: `GameplayCommandProcessor.process(...)` and Task 1 projector.
- Produces:

```ts
export interface GameplayRoundRepository {
  load(tableId: string): Promise<GameplayRoundAggregate | undefined>;
  commit(input: GameplayRoundCommitInput): Promise<GameplayRoundCommitResult>;
}

export class GameplayRoundApplicationService {
  getSnapshot(tableId: string, actor: GameplayRoundActor): Promise<GameplayRoundApplicationResult>;
  submitBid(tableId: string, actor: GameplayRoundActor, commandId: string, expectedVersion: number, bid: EstimationBid): Promise<GameplayRoundApplicationResult>;
  playCard(tableId: string, actor: GameplayRoundActor, commandId: string, expectedVersion: number, card: Card): Promise<GameplayRoundApplicationResult>;
}
```

- [ ] **Step 1: Write failing orchestration tests**

Cover authorized snapshot, wrong-seat bid rejection, paused/terminated rejection, accepted bid commit, duplicate retry, stale version, and conflicting command ID. Verify the repository receives the complete private aggregate while the returned value is the Task 1 safe projection.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- tests/gameplayRoundApplicationService.test.ts`

Expected: FAIL because the service and repository contracts do not exist.

- [ ] **Step 3: Implement minimum application service**

Load the aggregate, resolve the actor's controlled seat, reject missing/non-member actors, reject non-active lifecycle, and ensure command seat equals the actor-controlled seat. Process through `GameplayCommandProcessor`. Commit both accepted and domain-rejected command outcomes atomically so retries are deterministic. After commit, project the authoritative resulting aggregate for the same actor seat.

- [ ] **Step 4: Run focused and full validation**

Run:

```bash
npm test -- tests/gameplayRoundApplicationService.test.ts
npm run typecheck
npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameplay/roundApplicationTypes.ts src/gameplay/GameplayRoundApplicationService.ts src/index.ts tests/gameplayRoundApplicationService.test.ts
git commit -m "feat: add authoritative round application service"
```

---

### Task 3: Supabase round persistence and Edge Function boundary

**Files:**
- Create: `supabase/migrations/202607260009_gameplay_round_state.sql`
- Create: `supabase/migrations/202607260010_gameplay_round_rpc.sql`
- Create: `supabase/functions/gameplay-round-command/index.ts`
- Modify: `tests/deploymentConfiguration.test.ts`
- Test: `tests/gameplayRoundSchema.test.ts`

**Interfaces:**
- Consumes: Task 2 aggregate/commit semantics.
- Produces: private engine-load RPC, atomic commit RPC, seat-scoped snapshot load, and authenticated Edge Function actions `snapshot`, `submit-bid`, and `play-card`.

- [ ] **Step 1: Write failing static security tests**

Require private aggregate and command tables, RLS enabled with no direct client write policy, unique `(table_id, command_id)`, expected/resulting versions, actor IDs, accepted/errors/transition fields, seat-scoped snapshot RPC, Edge Function JWT actor extraction, and absence of service-role credentials in browser files.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- tests/gameplayRoundSchema.test.ts`

Expected: FAIL because migrations and Edge Function are absent.

- [ ] **Step 3: Add schema and narrow RPCs**

Persist the full private aggregate in a table inaccessible to browser `SELECT`. Persist every command outcome append-only. The commit RPC must lock the round row, verify expected version and duplicate identity, insert the command outcome, replace the aggregate only when accepted, and emit a public invalidation row containing table ID/version only.

- [ ] **Step 4: Add Edge Function adapter**

The adapter validates JWT/session, action shape, UUID/table identity, command ID, and expected version. It uses the TypeScript application service; it never returns the full aggregate. Error responses contain safe messages and authoritative snapshot when available.

- [ ] **Step 5: Run static and complete validation**

Run:

```bash
npm test -- tests/gameplayRoundSchema.test.ts
npm run typecheck
npm test
npm run build
```

Expected: all PASS. Record that live PostgreSQL/Deno execution remains a release gate.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607260009_gameplay_round_state.sql supabase/migrations/202607260010_gameplay_round_rpc.sql supabase/functions/gameplay-round-command/index.ts tests/gameplayRoundSchema.test.ts tests/deploymentConfiguration.test.ts
git commit -m "feat: add active round persistence boundary"
```

---

### Task 4: Typed browser round service

**Files:**
- Create: `src/online/gameplay/OnlineGameplayRoundService.ts`
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/services/createBrowserServices.ts`
- Test: `tests/onlineGameplayRoundService.test.ts`

**Interfaces:**
- Consumes: Edge Function actions from Task 3 and Task 1 DTOs.
- Produces: `getSnapshot`, `submitBid`, and `playCard` methods returning `OnlineGameplayResult<OnlineGameplayRoundSnapshot>`.

- [ ] **Step 1: Write failing client-contract tests**

Cover authentication/session injection, function action routing, command/version payloads, strict card/bid/snapshot parsing, server rejection propagation, malformed payload rejection, and no success on ambiguous network failure.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- tests/onlineGameplayRoundService.test.ts`

- [ ] **Step 3: Implement strict service**

Call the Supabase Function client rather than direct gameplay-table writes. Validate every enum, seat index, card rank/suit, version, bid, trick entry, and own-hand length. Ignore no malformed fields; reject the entire snapshot when required data is incomplete.

- [ ] **Step 4: Run focused and full validation**

Run the focused test, typecheck, all tests, and build.

- [ ] **Step 5: Commit**

```bash
git add src/online/gameplay/OnlineGameplayRoundService.ts src/app/AppContext.tsx src/app/services/createBrowserServices.ts tests/onlineGameplayRoundService.test.ts
git commit -m "feat: add typed online round service"
```

---

### Task 5: React estimate-submission interface

**Files:**
- Create: `src/app/components/GameplayBidPanel.tsx`
- Create: `src/app/screens/ActiveGameplayBiddingScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Modify: `src/app/i18n/translations.ts`
- Modify: `src/app/styles/gameplay.css`

**Interfaces:**
- Consumes: `OnlineGameplayRoundSnapshot` and `OnlineGameplayRoundService.submitBid(...)`.
- Produces: public bid progress, own-turn estimate controls, bid-owner contract-suit selector, and authoritative transition to playing.

- [ ] **Step 1: Write failing React tests**

Cover public bid list, controls hidden for non-turn seats, 0–12 legal options, fourth-bid total-13 exclusion, bid-owner trump requirement, disabled submission while busy, authoritative error display/reload, and transition to card phase after the accepted fourth estimate.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- src/app/screens/ActiveGameplayBiddingScreen.test.tsx`

- [ ] **Step 3: Implement the bid panel**

Render one public row per seat. Allow the acting user to choose a normal estimate from `legalNormalEstimates`; require a contract suit for the configured bid owner. Build `EstimationBid` using the authenticated seat's public player ID. Submit with command ID and expected round version. Never calculate scores or mutate local bid arrays optimistically.

- [ ] **Step 4: Run focused accessibility and full validation**

Use role/label based tests. Run focused test, typecheck, all tests, and build.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/GameplayBidPanel.tsx src/app/screens/ActiveGameplayScreen.tsx src/app/screens/ActiveGameplayBiddingScreen.test.tsx src/app/i18n/translations.ts src/app/styles/gameplay.css
git commit -m "feat: add authoritative online estimate entry"
```

---

### Task 6: Active-round Realtime invalidation

**Files:**
- Create: `src/online/gameplay/GameplayRoundRealtimeSynchronizer.ts`
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/services/createBrowserServices.ts`
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Test: `tests/gameplayRoundRealtimeSynchronizer.test.ts`

**Interfaces:**
- Consumes: Task 4 snapshot reader and public invalidation table from Task 3.
- Produces: one channel per table, coalesced invalidations, authoritative reload, version-gap tolerance, and mutation serialization.

- [ ] **Step 1: Write failing synchronizer tests**

Cover subscribe reload, invalidation reload, duplicate coalescing, stale-version ignore, gap reload, failure surfacing, unsubscription, and failed-mutation reload before another mutation starts.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- tests/gameplayRoundRealtimeSynchronizer.test.ts`

- [ ] **Step 3: Implement invalidation-only synchronization**

Never trust row payloads as round state. Reload through Task 4 after every accepted notification. Publish only snapshots with version greater than or equal to the current authoritative version; force reload on gaps.

- [ ] **Step 4: Wire the active screen and validate**

Connect on mount, disconnect on unmount/table change, and route mutations through the synchronizer's serialization boundary.

- [ ] **Step 5: Commit**

```bash
git add src/online/gameplay/GameplayRoundRealtimeSynchronizer.ts src/app/AppContext.tsx src/app/services/createBrowserServices.ts src/app/screens/ActiveGameplayScreen.tsx tests/gameplayRoundRealtimeSynchronizer.test.ts
git commit -m "feat: synchronize active round bidding state"
```

---

### Task 7: Delivery record and next card-play gate

**Files:**
- Create: `docs/superpowers/reports/2026-07-26-active-round-bidding-delivery.md`
- Modify: `docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md`
- Modify: PR #14 body

- [ ] **Step 1: Run fresh full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: zero failures.

- [ ] **Step 2: Review privacy and architecture contracts**

Confirm browser sources contain no opponent hand projection, seed, nonce, shuffled deck, service-role key, or direct authoritative table write.

- [ ] **Step 3: Record RED/GREEN evidence and limitations**

Document each task's CI runs, files delivered, and the live Supabase limitation. State clearly that card play, bot directive execution, next-round orchestration, and live multi-browser UAT are the following plan.

- [ ] **Step 4: Commit documentation and update draft PR**

```bash
git add docs/superpowers/reports/2026-07-26-active-round-bidding-delivery.md docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md
git commit -m "docs: record active round bidding delivery"
```

---

## Self-Review

- **Spec coverage:** This plan covers seat-scoped privacy, actor/seat authorization, versioned/idempotent commands, TypeScript rule authority, Edge Function placement, PostgreSQL atomic persistence, Realtime authoritative reload, and the first estimate-submission UI. Card play and bot execution are intentionally the next independently testable plan.
- **Placeholder scan:** No TBD/TODO/implement-later placeholders are used; every task has explicit files, interfaces, tests, commands, and acceptance behavior.
- **Type consistency:** `OnlineGameplayRoundSnapshot`, `GameplayRoundApplicationService`, `OnlineGameplayRoundService`, and synchronizer signatures are defined once and consumed consistently by later tasks.
