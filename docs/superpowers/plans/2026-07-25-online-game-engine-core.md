# Online Estimation Gameplay Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic House Rules V1 gameplay engine that deals cards, validates bids and card play, resolves complete rounds, emits versioned commands/events, and supports deterministic replay.

**Architecture:** Keep this package as pure TypeScript with immutable state transitions. It accepts explicit player, seat, bidding-order, and play-order inputs, delegates bid and score rules to existing services, and delegates card legality/trick resolution to focused gameplay services. Online persistence, Edge Functions, bots, and React consume this package later and are not implemented in this plan.

**Tech Stack:** TypeScript 5.5+, Node.js 24, Node test runner, Web Crypto, existing House Rules V1 scoring engine.

## Global Constraints

- House Rules V1 only.
- Exactly four unique seats and four unique player IDs.
- Each round starts with exactly thirteen cards per seat and fifty-two unique cards overall.
- Total accepted estimates must never equal thirteen.
- The last bidder is the Risk taker for scoring metadata.
- The existing `EstimationMvpService` and House Rules V1 profile remain the scoring authority.
- Follow-suit and trick winners are resolved only through `LegalCardPlayService` and `TrickResolutionService`.
- All public state-transition methods return a new state and do not mutate the supplied state.
- `npm run ci` is the acceptance command after every task.

---

### Task 1: Canonical deck and fair deterministic deal

**Status:** Completed. CI RED #663; GREEN #673.

**Files:**
- `src/gameplay/types.ts`
- `src/gameplay/CanonicalDeck.ts`
- `src/gameplay/DeterministicRandomSource.ts`
- `src/gameplay/FairDealService.ts`
- `tests/gameplayCanonicalDeck.test.ts`
- `tests/gameplayFairDeal.test.ts`

**Produces:**
- `SeatIndex`, `SeatHand`, `SeatHands`, `FairDealInput`, `FairDealResult`.
- `createCanonicalDeck()`.
- `FairDealService.deal()` and `FairDealService.verify()`.

---

### Task 2: Legal card play and trick resolution

**Status:** Completed. CI RED #675; GREEN #679.

**Files:**
- `src/gameplay/LegalCardPlayService.ts`
- `src/gameplay/TrickResolutionService.ts`
- `tests/gameplayLegalCardPlay.test.ts`
- `tests/gameplayTrickResolution.test.ts`

**Produces:**
- `LegalCardPlayService.legalCards(hand, trickEntries)`.
- `LegalCardPlayService.validate(selectedCard, hand, trickEntries)`.
- `TrickResolutionService.resolve(entries, contractSuit)`.

---

### Task 3: House Rules V1 playable round state machine and scoring handoff

**Files:**
- Modify: `src/gameplay/types.ts`
- Create: `src/gameplay/HouseRulesRoundEngine.ts`
- Modify: `src/index.ts`
- Test: `tests/gameplayRoundEngine.test.ts`

**Interfaces:**

```ts
export type GameplayRoundPhase = 'bidding' | 'playing' | 'scored';

export interface GameplaySeatPlayer {
  readonly seat: SeatIndex;
  readonly playerId: string;
}

export type GameplaySeatPlayers = readonly [
  GameplaySeatPlayer,
  GameplaySeatPlayer,
  GameplaySeatPlayer,
  GameplaySeatPlayer,
];

export interface CompletedGameplayTrick {
  readonly trickNumber: number;
  readonly leaderSeat: SeatIndex;
  readonly entries: readonly GameplayTrickEntry[];
  readonly winnerSeat: SeatIndex;
}

export interface HouseRulesRoundState {
  readonly roundNumber: number;
  readonly phase: GameplayRoundPhase;
  readonly players: GameplaySeatPlayers;
  readonly hands: SeatHands;
  readonly bidOrder: readonly [SeatIndex, SeatIndex, SeatIndex, SeatIndex];
  readonly playOrder: readonly [SeatIndex, SeatIndex, SeatIndex, SeatIndex];
  readonly bidOwnerSeat: SeatIndex;
  readonly firstLeadSeat: SeatIndex;
  readonly currentBidIndex: number;
  readonly currentTurnSeat?: SeatIndex;
  readonly bids: readonly EstimationBid[];
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly completedTricks: readonly CompletedGameplayTrick[];
  readonly actualTricksBySeat: readonly [number, number, number, number];
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
  readonly scoreResult?: MvpRoundResult;
}

export interface CreateHouseRulesRoundInput {
  readonly roundNumber: number;
  readonly players: GameplaySeatPlayers;
  readonly hands: SeatHands;
  readonly bidOrder: readonly [SeatIndex, SeatIndex, SeatIndex, SeatIndex];
  readonly playOrder: readonly [SeatIndex, SeatIndex, SeatIndex, SeatIndex];
  readonly bidOwnerSeat: SeatIndex;
  readonly firstLeadSeat: SeatIndex;
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
}

export interface GameplayStateTransition {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly state: HouseRulesRoundState;
}
```

`HouseRulesRoundEngine` produces:

```ts
create(input: CreateHouseRulesRoundInput): HouseRulesRoundState;
submitBid(state: HouseRulesRoundState, seat: SeatIndex, bid: EstimationBid): GameplayStateTransition;
legalCards(state: HouseRulesRoundState, seat: SeatIndex): readonly Card[];
playCard(state: HouseRulesRoundState, seat: SeatIndex, card: Card): GameplayStateTransition;
```

- [ ] **Step 1: Write failing bidding-state tests**

Add tests proving:

```ts
test('round starts with the first seat in the explicit bidding order', () => {
  const state = engine.create(fixture());
  assert.equal(state.phase, 'bidding');
  assert.equal(state.bidOrder[state.currentBidIndex], 2);
});

test('out-of-turn estimate is rejected without changing state', () => {
  const state = engine.create(fixture());
  const result = engine.submitBid(state, 1, bidFor('p1', 2));
  assert.equal(result.valid, false);
  assert.equal(result.state, state);
});

test('fourth estimate that makes total thirteen is rejected', () => {
  let state = engine.create(fixture());
  state = accepted(engine.submitBid(state, 2, ownerBid('p2', 5, 'spades')));
  state = accepted(engine.submitBid(state, 3, bidFor('p3', 3)));
  state = accepted(engine.submitBid(state, 0, bidFor('p0', 2)));
  const result = engine.submitBid(state, 1, bidFor('p1', 3));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Total estimates cannot equal 13. The round must be Over or Under.'));
  assert.equal(result.state, state);
});
```

- [ ] **Step 2: Run `npm run test:engine` and verify RED**

Expected: compilation fails because `HouseRulesRoundEngine` and round-state types are absent.

- [ ] **Step 3: Implement immutable round creation and bid submission**

Implementation rules:

1. Validate positive round number.
2. Validate exactly four unique seats and player IDs.
3. Validate each hand is associated with the matching seat, contains thirteen cards, and all fifty-two cards are unique.
4. Validate `bidOrder` and `playOrder` are permutations of seats `0,1,2,3`.
5. Validate `bidOwnerSeat` and `firstLeadSeat` exist in the supplied orders.
6. For each submission, require bidding phase, current bid seat, and player ID matching the seat.
7. Validate the individual bid with `BidValidationService.validateBid(..., { playerCount: 4, cardsPerPlayer: 13, mode: 'round-estimates', bidOwnerPlayerId })`.
8. For the fourth submission, validate all four bids with `EstimationMvpService.validateBids(..., { mode: 'round-estimates', bidOwnerPlayerId })` before committing it.
9. On accepted fourth bid, set phase to `playing`, set `currentTurnSeat` to `firstLeadSeat`, and retain the final bidding order so the last bidder can be supplied as `riskPlayerId` during scoring.

- [ ] **Step 4: Write failing card progression tests**

Add tests proving:

```ts
test('only the current play seat can act and the selected card is removed', () => {
  const playing = completeValidBidding(engine.create(fixture()));
  const legal = engine.legalCards(playing, playing.currentTurnSeat!);
  const result = engine.playCard(playing, playing.currentTurnSeat!, legal[0]!);
  assert.equal(result.valid, true);
  assert.equal(result.state.hands[playing.currentTurnSeat!]!.cards.length, 12);
});

test('completed trick increments winner count and winner leads next trick', () => {
  let state = completeValidBidding(engine.create(fixture()));
  for (let index = 0; index < 4; index += 1) {
    const seat = state.currentTurnSeat!;
    state = accepted(engine.playCard(state, seat, engine.legalCards(state, seat)[0]!));
  }
  const completed = state.completedTricks[0]!;
  assert.equal(state.actualTricksBySeat[completed.winnerSeat], 1);
  assert.equal(state.currentTurnSeat, completed.winnerSeat);
});
```

- [ ] **Step 5: Implement card transitions and trick completion**

Use `playOrder` to choose the next seat. On each accepted card, remove exactly that card by `cardId`. At four entries, call `TrickResolutionService.resolve`. Append a `CompletedGameplayTrick`, clear `currentTrick`, increment the winner's actual count, and set the winner as the next leader.

- [ ] **Step 6: Write failing complete-round scoring test**

Use a deterministic fair deal and repeatedly play the first legal card until all thirteen tricks finish. Assert:

```ts
assert.equal(state.phase, 'scored');
assert.equal(state.completedTricks.length, 13);
assert.equal(state.actualTricksBySeat.reduce((sum, value) => sum + value, 0), 13);
assert.equal(state.scoreResult?.valid, true);
assert.equal(state.scoreResult?.scoreResult?.playerScores.length, 4);
```

- [ ] **Step 7: Implement scoring-engine handoff**

After trick thirteen, call:

```ts
estimationMvpService.calculateRound({
  roundNumber: state.roundNumber,
  bids: state.bids,
  actualResults: state.players.map(({ seat, playerId }) => ({
    playerId,
    actualTricks: state.actualTricksBySeat[seat],
  })),
  profile: houseRulesV1ScoringProfile,
  ruleSet: HOUSE_RULES_V1,
  bidValidationMode: 'round-estimates',
  bidOwnerPlayerId,
  riskPlayerId: playerIdForSeat(lastBidSeat),
  roundMultiplier: state.roundMultiplier,
  multipleWithMultiplier: state.multipleWithMultiplier,
});
```

If scoring unexpectedly returns invalid after accepted bidding and thirteen legal tricks, throw an internal consistency error rather than returning a partially scored state.

- [ ] **Step 8: Export the engine and run full validation**

Run: `npm run ci`

Expected: all engine tests, UI tests, typechecks, and Vite build pass.

- [ ] **Step 9: Commit**

```bash
git add src/gameplay/types.ts src/gameplay/HouseRulesRoundEngine.ts src/index.ts tests/gameplayRoundEngine.test.ts
git commit -m "feat: add playable House Rules round engine"
```

---

### Task 4: Versioned idempotent gameplay command processor

**Files:**
- Extend: `src/gameplay/types.ts`
- Create: `src/gameplay/GameplayCommandProcessor.ts`
- Test: `tests/gameplayCommandProcessor.test.ts`

**Interfaces:**

```ts
export type GameplayCommand =
  | { readonly type: 'SUBMIT_BID'; readonly seat: SeatIndex; readonly bid: EstimationBid }
  | { readonly type: 'PLAY_CARD'; readonly seat: SeatIndex; readonly card: Card };

export interface GameplayCommandEnvelope {
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly command: GameplayCommand;
}

export interface GameplayCommandRecord {
  readonly commandId: string;
  readonly acceptedVersion: number;
  readonly result: GameplayStateTransition;
}
```

Tests must prove stale versions are rejected, duplicate command IDs return the original record, rejected commands do not increment version, and accepted commands increment by exactly one. The processor must be pure and accept prior command records as input so the database adapter can persist them later.

Acceptance command: `npm run ci`.

---

### Task 5: Deterministic gameplay replay

**Files:**
- Create: `src/gameplay/ReplayService.ts`
- Test: `tests/gameplayReplay.test.ts`

**Interfaces:**

```ts
replay(
  initial: HouseRulesRoundState,
  commands: readonly GameplayCommandRecord[],
): HouseRulesRoundState;
```

Replay applies accepted commands in `acceptedVersion` order, rejects gaps or duplicate accepted versions, and verifies that the reconstructed final state equals the recorded final state. Tests must cover a complete round, altered command payload, missing version, and deterministic score output.

Acceptance command: `npm run ci`.
