# Online Estimation Game and Computer-Player MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a real-time four-seat House Rules V1 Estimation game where humans can play online and Standard computer players fill vacant or temporarily disconnected seats.

**Architecture:** Keep the existing scoring engine framework-agnostic and add a pure TypeScript gameplay layer for dealing, legal actions, trick resolution, exact-target bot decisions, and deterministic replay. Supabase Edge Functions act as the authenticated command boundary and use narrow transactional PostgreSQL RPCs for idempotent versioned commits, while React clients consume seat-scoped snapshots and Realtime events.

**Tech Stack:** TypeScript 5.5+, Node.js 24, React 19, Vite 7, Vitest 3, Node test runner, Supabase Auth/PostgreSQL/RLS/Realtime/Edge Functions, Web Crypto/Node `crypto`.

## Global Constraints

- House Rules V1 only for the MVP; Federation 2026 gameplay is excluded.
- Exactly four seats and thirteen cards per seat.
- Total accepted estimates must never equal thirteen.
- The existing House Rules V1 scoring engine remains the single scoring authority.
- All authoritative gameplay writes pass through authenticated server commands.
- Clients and bots never receive another seat's private hand or future deck order.
- `Math.random()`, random sort comparators, and modulo-biased bounded random selection are forbidden.
- Every command carries an idempotency key and expected game version.
- Standard bot decisions target exact-estimate success, not maximum tricks.
- Standard bot latency target: 2 seconds p95, 5 seconds hard limit, then a legal deterministic fallback within 250 milliseconds.
- Turn timers: 20, 30, 45, 60, or 90 seconds; default 45.
- Disconnect grace: 30, 60, 90, or 120 seconds; default 60.
- Work remains isolated from `main` and the current online-UAT stabilization branch until explicit integration readiness.
- `npm run ci` is the minimum repository acceptance command.

---

## Planned File Structure

### Pure gameplay engine

- `src/gameplay/types.ts` — gameplay phases, seat indices, hands, deal records, trick state, commands, events, and snapshots.
- `src/gameplay/CanonicalDeck.ts` — creates and validates the canonical 52-card deck.
- `src/gameplay/DeterministicRandomSource.ts` — HMAC-SHA-256 counter stream with unbiased bounded integers.
- `src/gameplay/FairDealService.ts` — seed commitment, Fisher-Yates shuffle, one-card-at-a-time deal, and verification.
- `src/gameplay/LegalCardPlayService.ts` — follow-suit legal-action generation and validation.
- `src/gameplay/TrickResolutionService.ts` — resolves trick winners using led suit and selected contract suit.
- `src/gameplay/HouseRulesRoundEngine.ts` — bidding order, accepted estimates, turn progression, trick counts, and scoring-engine handoff.
- `src/gameplay/GameplayCommandProcessor.ts` — pure expected-version/idempotency command evaluation and event emission.
- `src/gameplay/ReplayService.ts` — deterministic reconstruction from deal and accepted events.

### Standard computer player

- `src/gameplay/bot/types.ts` — allow-listed `BotObservation`, decisions, reason codes, and policy interface.
- `src/gameplay/bot/HandStrengthEvaluator.ts` — honours, distribution, trump, No Trump, and exact-trick probability estimates.
- `src/gameplay/bot/StandardBidPolicy.ts` — legal bid expected-utility selection through House Rules V1 scoring.
- `src/gameplay/bot/StandardCardPolicy.ts` — Acquire, Control, Dump, Recovery, and Endgame modes.
- `src/gameplay/bot/StandardBotPolicy.ts` — time-bounded orchestration and deterministic fallback.

### Online command and persistence layer

- `supabase/migrations/202607250001_gameplay_mvp.sql` — tables, enums, indexes, RLS, append-only events, private hands, commands, bot decisions, and snapshots.
- `supabase/migrations/202607250002_gameplay_rpc.sql` — transactional create/join/start/commit/pause/resume/terminate/reclaim RPCs.
- `supabase/functions/game-command/index.ts` — authenticated Edge Function command router.
- `supabase/functions/game-command/observation.ts` — seat-scoped snapshot and bot-observation projection.
- `src/online/gameplay/OnlineGameplayService.ts` — browser client for tables, commands, snapshots, and reconnect.
- `src/online/gameplay/GameplayRealtimeService.ts` — version-aware Realtime subscription and gap recovery.

### React application

- `src/app/screens/GameLobbyScreen.tsx` — public/private table creation and joining.
- `src/app/screens/GameTableScreen.tsx` — bids, private hand, legal cards, trick state, timers, pause, and termination.
- `src/app/components/PlayingCard.tsx` — accessible card rendering and selection.
- `src/app/components/GameSeat.tsx` — human/bot/control/connection status.
- `src/app/components/GameTimer.tsx` — server-deadline countdown presentation.

### Tests

- `tests/gameplayCanonicalDeck.test.ts`
- `tests/gameplayFairDeal.test.ts`
- `tests/gameplayLegalCardPlay.test.ts`
- `tests/gameplayTrickResolution.test.ts`
- `tests/gameplayRoundEngine.test.ts`
- `tests/gameplayCommandProcessor.test.ts`
- `tests/gameplayReplay.test.ts`
- `tests/standardBotPolicy.test.ts`
- `tests/gameplayDealStatistics.test.ts`
- `tests/onlineGameplaySchema.test.ts`
- `tests/onlineGameplayRpc.test.ts`
- `src/app/screens/GameLobbyScreen.test.tsx`
- `src/app/screens/GameTableScreen.test.tsx`

---

### Task 1: Canonical deck, secure deterministic shuffle, and fair four-seat deal

**Files:**
- Create: `src/gameplay/types.ts`
- Create: `src/gameplay/CanonicalDeck.ts`
- Create: `src/gameplay/DeterministicRandomSource.ts`
- Create: `src/gameplay/FairDealService.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayCanonicalDeck.test.ts`
- Test: `tests/gameplayFairDeal.test.ts`

**Interfaces:**
- Produces: `SeatIndex`, `SeatHands`, `FairDealInput`, `FairDealResult`, `DealVerificationResult`.
- Produces: `createCanonicalDeck(): readonly Card[]`.
- Produces: `DeterministicRandomSource.nextInt(maxExclusive: number): number`.
- Produces: `FairDealService.deal(input: FairDealInput): FairDealResult` and `verify(result: FairDealResult): DealVerificationResult`.

- [ ] **Step 1: Write canonical-deck failing tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardId, createCanonicalDeck } from '../src/index.js';

test('canonical deck contains each of the 52 cards exactly once', () => {
  const deck = createCanonicalDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(cardId)).size, 52);
});

test('canonical deck order is stable', () => {
  const deck = createCanonicalDeck();
  assert.equal(cardId(deck[0]!), '2-spades');
  assert.equal(cardId(deck[51]!), 'A-clubs');
});
```

- [ ] **Step 2: Run the canonical-deck test and verify RED**

Run: `npm run test:engine`

Expected: compilation fails because `createCanonicalDeck` is not exported.

- [ ] **Step 3: Implement the canonical deck**

```ts
import { CARD_SUITS, RANKS, type Card } from '../domain/card.js';

export function createCanonicalDeck(): readonly Card[] {
  return CARD_SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}
```

- [ ] **Step 4: Write fair-deal failing tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardId, FairDealService } from '../src/index.js';

const input = {
  gameId: 'game-1',
  dealId: 'deal-1',
  ruleSet: 'HOUSE_RULES_V1' as const,
  nonce: 'nonce-1',
  seedHex: '00'.repeat(32),
  firstSeat: 1 as const,
};

test('fair deal gives four seats thirteen unique cards each', () => {
  const result = new FairDealService().deal(input);
  const cards = result.hands.flatMap((hand) => hand.cards);
  assert.deepEqual(result.hands.map((hand) => hand.cards.length), [13, 13, 13, 13]);
  assert.equal(new Set(cards.map(cardId)).size, 52);
});

test('same seed and deal metadata reproduce the same commitment and hands', () => {
  const service = new FairDealService();
  assert.deepEqual(service.deal(input), service.deal(input));
});

test('verification rejects a modified hand', () => {
  const service = new FairDealService();
  const result = service.deal(input);
  const altered = {
    ...result,
    hands: result.hands.map((hand, index) => index === 0
      ? { ...hand, cards: [...hand.cards.slice(1), hand.cards[0]!] }
      : hand),
  };
  assert.equal(service.verify(altered).valid, false);
});
```

- [ ] **Step 5: Run the fair-deal tests and verify RED**

Run: `npm run test:engine`

Expected: compilation fails because `FairDealService` and gameplay types do not exist.

- [ ] **Step 6: Implement deterministic HMAC counter randomness and unbiased bounds**

```ts
export class DeterministicRandomSource {
  private counter = 0;
  private pool = Buffer.alloc(0);

  constructor(private readonly seed: Buffer) {}

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1) {
      throw new Error('maxExclusive must be a positive safe integer.');
    }
    const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    for (;;) {
      const value = this.nextUint32();
      if (value < limit) return value % maxExclusive;
    }
  }

  private nextUint32(): number {
    if (this.pool.length < 4) this.refill();
    const value = this.pool.readUInt32BE(0);
    this.pool = this.pool.subarray(4);
    return value;
  }

  private refill(): void {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(this.counter++));
    this.pool = Buffer.concat([
      this.pool,
      createHmac('sha256', this.seed).update(counter).digest(),
    ]);
  }
}
```

- [ ] **Step 7: Implement commitment, Fisher-Yates, round-robin distribution, and verification**

The commitment payload is the UTF-8 string:

```text
seedHex|dealId|gameId|HOUSE_RULES_V1|nonce
```

Hash with SHA-256. Shuffle a mutable copy from index 51 down to 1 using `nextInt(index + 1)`. Deal card index `n` to seat `(firstSeat + n) % 4`. Return hands ordered by seat 0, 1, 2, 3 and preserve the shuffled deck for post-game verification only.

- [ ] **Step 8: Export the gameplay APIs from `src/index.ts`**

```ts
export * from './gameplay/types.js';
export * from './gameplay/CanonicalDeck.js';
export * from './gameplay/DeterministicRandomSource.js';
export * from './gameplay/FairDealService.js';
```

- [ ] **Step 9: Run focused and full validation**

Run: `npm run test:engine`

Expected: all engine tests pass, including canonical-deck and fair-deal tests.

Run: `npm run ci`

Expected: typecheck, engine tests, UI tests, and Vite build pass.

- [ ] **Step 10: Commit**

```bash
git add src/gameplay src/index.ts tests/gameplayCanonicalDeck.test.ts tests/gameplayFairDeal.test.ts
git commit -m "feat: add secure deterministic Estimation dealing"
```

---

### Task 2: Legal card actions and trick winner resolution

**Files:**
- Create: `src/gameplay/LegalCardPlayService.ts`
- Create: `src/gameplay/TrickResolutionService.ts`
- Modify: `src/gameplay/types.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayLegalCardPlay.test.ts`
- Test: `tests/gameplayTrickResolution.test.ts`

**Interfaces:**
- Consumes: `Card`, `ContractSuit`, `SeatIndex`.
- Produces: `LegalCardPlayService.legalCards(hand, trick): readonly Card[]`.
- Produces: `LegalCardPlayService.validate(card, hand, trick): ValidationResult`.
- Produces: `TrickResolutionService.resolve(entries, contractSuit): SeatIndex`.

- [ ] **Step 1: Write failing tests proving a player must follow the led suit when possible and may discard otherwise.**
- [ ] **Step 2: Run `npm run test:engine` and verify failure is caused by missing services.**
- [ ] **Step 3: Implement `legalCards` by returning the full hand for an empty trick, matching-suit cards when any exist, otherwise the full hand.**
- [ ] **Step 4: Write failing tests for No Trump, trumped tricks, and highest card of the led suit.**
- [ ] **Step 5: Implement winner resolution using `compareRanks`; trump beats non-trump, otherwise only the led suit can win.**
- [ ] **Step 6: Extend the existing `TrickValidationService` only where necessary so duplicate-card and player-count checks remain reusable.**
- [ ] **Step 7: Run `npm run ci` and commit with `feat: add legal Estimation card play`.**

---

### Task 3: House Rules V1 round state machine and scoring handoff

**Files:**
- Create: `src/gameplay/HouseRulesRoundEngine.ts`
- Modify: `src/gameplay/types.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayRoundEngine.test.ts`

**Interfaces:**
- Consumes: `BidValidationService`, `TrickResolutionService`, `EstimationMvpService`.
- Produces: `createRound(input): GameplayRoundState`.
- Produces: `submitEstimate(state, command): RoundTransition`.
- Produces: `playCard(state, command): RoundTransition`.
- Produces: `scoreCompletedRound(state): MvpRoundResult`.

- [ ] **Step 1: Write a failing test for four accepted estimates where the last estimate cannot make the total thirteen.**
- [ ] **Step 2: Verify RED with `npm run test:engine`.**
- [ ] **Step 3: Implement ordered estimate submission using existing round-estimate validation.**
- [ ] **Step 4: Write a failing test for thirteen complete tricks producing actual trick totals of thirteen.**
- [ ] **Step 5: Implement card removal, next-seat turn progression, trick completion, winner-led next trick, and actual-trick accumulation.**
- [ ] **Step 6: Write a failing test proving the round invokes the existing House Rules V1 score service without duplicating scoring formulas.**
- [ ] **Step 7: Implement the scoring handoff and immutable score snapshot.**
- [ ] **Step 8: Run `npm run ci` and commit with `feat: add playable House Rules round engine`.**

---

### Task 4: Versioned commands, idempotency, events, and deterministic replay

**Files:**
- Create: `src/gameplay/GameplayCommandProcessor.ts`
- Create: `src/gameplay/ReplayService.ts`
- Modify: `src/gameplay/types.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayCommandProcessor.test.ts`
- Test: `tests/gameplayReplay.test.ts`

**Interfaces:**
- Produces: `GameplayCommand` discriminated union.
- Produces: `AcceptedGameplayEvent` discriminated union.
- Produces: `process(snapshot, command, priorCommandResult): CommandResult`.
- Produces: `ReplayService.replay(initialDeal, events): GameplaySnapshot`.

- [ ] **Step 1: Test stale expected versions are rejected without events.**
- [ ] **Step 2: Test duplicate idempotency keys return the original command result.**
- [ ] **Step 3: Implement pure command processing with one version increment per accepted command.**
- [ ] **Step 4: Test replay reconstructs the exact snapshot, hand contents, active seat, and trick history.**
- [ ] **Step 5: Implement replay as a total reducer over accepted events with exhaustive switch checking.**
- [ ] **Step 6: Run `npm run ci` and commit with `feat: add replayable gameplay commands`.**

---

### Task 5: Supabase gameplay schema, RLS, and transactional RPCs

**Files:**
- Create: `supabase/migrations/202607250001_gameplay_mvp.sql`
- Create: `supabase/migrations/202607250002_gameplay_rpc.sql`
- Test: `tests/onlineGameplaySchema.test.ts`
- Test: `tests/onlineGameplayRpc.test.ts`

**Interfaces:**
- Produces tables: `game_tables`, `game_table_seats`, `game_deals`, `game_private_hands`, `gameplay_commands`, `gameplay_events`, `gameplay_snapshots`, `bot_decisions`, `game_join_requests`.
- Produces RPCs: `create_game_table`, `join_game_table`, `approve_game_join`, `start_game_table`, `commit_gameplay_command`, `pause_game`, `resume_game`, `terminate_game`, `reclaim_game_seat`.

- [ ] **Step 1: Write schema text tests for required tables, foreign keys, unique command idempotency, expected-version checks, append-only event triggers, and seat-scoped private-hand RLS.**
- [ ] **Step 2: Verify RED because migrations are absent.**
- [ ] **Step 3: Implement enums and normalized tables with workspace and authenticated-user ownership.**
- [ ] **Step 4: Implement RLS where public lobby queries expose only safe table metadata and private hands require matching authenticated seat ownership.**
- [ ] **Step 5: Write RPC text tests for security-definer functions with fixed search paths and transactional version checks.**
- [ ] **Step 6: Implement narrow RPCs; reject direct authoritative table mutation by authenticated clients.**
- [ ] **Step 7: Run `npm run ci` and commit with `feat: add authoritative gameplay persistence`.**

---

### Task 6: Authenticated game-command Edge Function

**Files:**
- Create: `supabase/functions/game-command/index.ts`
- Create: `supabase/functions/game-command/observation.ts`
- Create: `supabase/functions/game-command/errors.ts`
- Test: `tests/gameCommandEdgeFunction.test.ts`

**Interfaces:**
- Accepts: `{ gameId, commandId, expectedVersion, type, payload }`.
- Returns: `{ accepted, version, snapshot, errorCode? }`.
- Calls: TypeScript command processor, Standard bot policy when required, and `commit_gameplay_command` RPC.

- [ ] **Step 1: Test unauthenticated, non-member, stale, illegal, duplicate, and accepted command outcomes.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement JWT actor resolution and seat-scoped observation loading.**
- [ ] **Step 4: Implement command routing without exposing service-role credentials in responses or logs.**
- [ ] **Step 5: Implement safe error codes: `NOT_AUTHENTICATED`, `NOT_MEMBER`, `STALE_VERSION`, `NOT_ACTIVE_SEAT`, `ILLEGAL_ACTION`, `GAME_NOT_ACTIVE`, and `TEMPORARY_FAILURE`.**
- [ ] **Step 6: Run `npm run ci` and commit with `feat: add gameplay command edge boundary`.**

---

### Task 7: Lobby, seats, public/private joining, and host succession

**Files:**
- Create: `src/online/gameplay/OnlineGameplayService.ts`
- Create: `src/app/screens/GameLobbyScreen.tsx`
- Create: `src/app/screens/GameLobbyScreen.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `createTable`, `listPublicTables`, `joinByCode`, `requestJoin`, `approveJoin`, `leaveTable`, `startTable`.

- [ ] **Step 1: Write UI/service tests for private code access, public open join, approval-required joining, four-seat capacity, and start-time bot filling.**
- [ ] **Step 2: Verify RED with `npm run test:ui`.**
- [ ] **Step 3: Implement async service calls and a lobby route without changing the score-calculator home flow.**
- [ ] **Step 4: Implement pre-game host transfer to the earliest accepted connected human and automatic table closure when no human remains.**
- [ ] **Step 5: Run `npm run ci` and commit with `feat: add online Estimation lobby`.**

---

### Task 8: Standard exact-target computer player

**Files:**
- Create: `src/gameplay/bot/types.ts`
- Create: `src/gameplay/bot/HandStrengthEvaluator.ts`
- Create: `src/gameplay/bot/StandardBidPolicy.ts`
- Create: `src/gameplay/bot/StandardCardPolicy.ts`
- Create: `src/gameplay/bot/StandardBotPolicy.ts`
- Modify: `src/index.ts`
- Test: `tests/standardBotPolicy.test.ts`

**Interfaces:**
- Produces an allow-listed `BotObservation` with no opponent hands.
- Produces: `StandardBotPolicy.decide(observation, deadline): Promise<BotDecision>`.

- [ ] **Step 1: Write a contract test listing the exact allowed top-level observation keys and rejecting hidden-hand/deck fields.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement deterministic hand features: rank control, suit length, void/singleton value, trump control, and No Trump stoppers.**
- [ ] **Step 4: Write bid fixtures where the selected legal estimate maximizes expected House Rules V1 utility and never makes the total thirteen.**
- [ ] **Step 5: Implement exact-trick probability weights and score-based bid comparison.**
- [ ] **Step 6: Write card fixtures for Acquire, Control, Dump, Recovery, and mandatory follow-suit.**
- [ ] **Step 7: Implement deterministic card ranking plus known-void/card-count tracking.**
- [ ] **Step 8: Add a forced-timeout test and implement the legal fallback reason `POLICY_TIMEOUT_FALLBACK`.**
- [ ] **Step 9: Run `npm run ci` and commit with `feat: add Standard exact-target bot`.**

---

### Task 9: Realtime snapshots, private projection, and reconnect

**Files:**
- Create: `src/online/gameplay/GameplayRealtimeService.ts`
- Create: `src/app/screens/GameTableScreen.tsx`
- Create: `src/app/screens/GameTableScreen.test.tsx`
- Create: `src/app/components/PlayingCard.tsx`
- Create: `src/app/components/GameSeat.tsx`
- Create: `src/app/components/GameTimer.tsx`

- [ ] **Step 1: Test that a player sees only their own hand and public table data.**
- [ ] **Step 2: Test duplicate events are ignored and version gaps trigger authoritative snapshot reload.**
- [ ] **Step 3: Implement seat-scoped snapshot hydration and version-aware Realtime subscription.**
- [ ] **Step 4: Implement accessible legal-card selection, bid controls, current trick, seat status, and server-deadline timer display.**
- [ ] **Step 5: Run `npm run ci` and commit with `feat: add realtime game table`.**

---

### Task 10: Timers, disconnection takeover, reclaim, and host transfer

**Files:**
- Modify: `src/gameplay/GameplayCommandProcessor.ts`
- Modify: `supabase/functions/game-command/index.ts`
- Modify: `supabase/migrations/202607250002_gameplay_rpc.sql`
- Test: `tests/gameplayControlTransfer.test.ts`

- [ ] **Step 1: Test connected timeout produces one bot action only and returns future control to the human.**
- [ ] **Step 2: Test disconnect grace expiry transfers temporary control and safe reconnect reclaims before the next uncommitted action.**
- [ ] **Step 3: Test an already committed bot action cannot be reversed.**
- [ ] **Step 4: Test active host disconnection immediately transfers administrative authority to the longest-connected human.**
- [ ] **Step 5: Implement server-deadline scheduling and transactional control ownership.**
- [ ] **Step 6: Run `npm run ci` and commit with `feat: add resilient bot takeover`.**

---

### Task 11: Pause, resume, termination, fair-deal reveal, and replay UI

**Files:**
- Modify: `src/gameplay/GameplayCommandProcessor.ts`
- Modify: `src/gameplay/ReplayService.ts`
- Modify: `src/app/screens/GameTableScreen.tsx`
- Create: `src/app/screens/GameReplayScreen.tsx`
- Test: `tests/gameplayLifecycle.test.ts`
- Test: `src/app/screens/GameReplayScreen.test.tsx`

- [ ] **Step 1: Test pause freezes turn and disconnect deadlines and blocks gameplay commands.**
- [ ] **Step 2: Test resume restores remaining durations.**
- [ ] **Step 3: Test confirmed termination rejects new commands, preserves history, marks `TERMINATED`, excludes formal statistics, and reveals seed/nonce.**
- [ ] **Step 4: Test the revealed seed independently rebuilds the commitment, deck, hands, and played-card history.**
- [ ] **Step 5: Implement read-only event-by-event replay with bot reason codes and policy versions.**
- [ ] **Step 6: Run `npm run ci` and commit with `feat: add auditable gameplay lifecycle`.**

---

### Task 12: Statistical, security, simulation, load, and deployed UAT release gate

**Files:**
- Create: `tests/gameplayDealStatistics.test.ts`
- Create: `tests/gameplaySimulation.test.ts`
- Create: `docs/ONLINE_GAMEPLAY_UAT.md`
- Modify: `BACKLOG.md`
- Modify: `PROJECT_LOG.md`

- [ ] **Step 1: Add a deterministic 100,000-seed distribution test keeping each card's seat frequency within ±2% of 25%.**
- [ ] **Step 2: Add bot-versus-bot simulations proving zero illegal actions, no deadlocks, replay equality, and complete thirteen-trick rounds.**
- [ ] **Step 3: Add latency instrumentation and verify 2-second p95, 5-second hard limit, and 250-millisecond fallback in the UAT load profile.**
- [ ] **Step 4: Audit browser network payloads, Realtime channels, Edge Function logs, error responses, and analytics for private-hand leakage.**
- [ ] **Step 5: Deploy a gameplay UAT environment separate from production and document environment variables, migration order, Edge Function deployment, and smoke-test procedure.**
- [ ] **Step 6: Complete one 1-human/3-bot game, one multi-human game, one terminated-game verification, and one deterministic replay.**
- [ ] **Step 7: Run `npm run ci`, record the exact successful workflow run, update progress logs, and commit with `docs: publish online gameplay UAT`.**

---

## Execution Decision

The user approved the specification and all recommended subsequent steps on 25 July 2026, explicitly authorizing implementation without additional approval prompts. Execution therefore uses the inline `superpowers:executing-plans` workflow with TDD checkpoints, isolated implementation branches, GitHub Actions as the authoritative verification environment, and no merge to `main` without a separate explicit merge decision.
