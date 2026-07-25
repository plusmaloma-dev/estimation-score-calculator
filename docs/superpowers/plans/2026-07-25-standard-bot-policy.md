# Standard Estimation Bot Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, explainable Standard bot that receives only its private hand plus public state, chooses only legal actions, estimates exact-trick probabilities, and selects bids/cards for House Rules V1.

**Architecture:** A projection service creates an allow-listed observation from authoritative round state. Focused policies handle card mode/selection and bid expected utility. A final orchestrator adds policy versioning, decision metadata, time limits, and deterministic fallback without exposing database access or hidden hands.

**Tech Stack:** TypeScript 5.5+, Node.js 24, Node test runner, existing gameplay engine and House Rules V1 scoring services.

## Global Constraints

- The bot receives no opponent hand, deal seed, shuffled deck, future cards, private reconnect data, or unpublished bot decision.
- Every selected bid/card must already be present in the supplied legal-action list.
- Illegal-action rate must remain zero in deterministic bot-vs-bot simulations.
- The objective is exact-estimate success and House Rules V1 expected score, not maximum trick count.
- Policy version for the MVP is `STANDARD_V1`.
- Card modes are `acquire`, `control`, `dump`, `recovery`, and `endgame`.
- Decision reason codes are stable audit values, not localized user-facing text.
- The policy is deterministic for the same observation.
- `npm run ci` is required after every task.

---

### Task 1: Allow-listed card observation and deterministic legal fallback

**Files:**
- Create: `src/gameplay/bot/types.ts`
- Create: `src/gameplay/bot/BotObservationService.ts`
- Create: `src/gameplay/bot/StandardCardPolicy.ts`
- Modify: `src/index.ts`
- Test: `tests/standardBotCardPolicy.test.ts`

**Interfaces:**

```ts
export type BotCardMode = 'acquire' | 'control' | 'dump' | 'recovery' | 'endgame';
export type BotReasonCode =
  | 'FOLLOW_SUIT_ONLY_ACTION'
  | 'ACQUIRE_REQUIRED_TRICK'
  | 'CONTROL_EXACT_TARGET'
  | 'AVOID_OVERTRICK'
  | 'MINIMIZE_DAMAGE'
  | 'ENDGAME_EXACT_SEARCH';

export interface BotCardObservation {
  readonly policyVersion: 'STANDARD_V1';
  readonly seat: SeatIndex;
  readonly hand: readonly Card[];
  readonly legalCards: readonly Card[];
  readonly bids: readonly EstimationBid[];
  readonly contractSuit: ContractSuit;
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly completedTricks: readonly CompletedGameplayTrick[];
  readonly estimate: number;
  readonly tricksWon: number;
  readonly cardsRemaining: number;
}

export interface BotCardDecision {
  readonly policyVersion: 'STANDARD_V1';
  readonly mode: BotCardMode;
  readonly reasonCode: BotReasonCode;
  readonly card: Card;
  readonly legalCardIds: readonly string[];
}
```

`BotObservationService.createCardObservation(state, seat)` must require the playing phase and active turn. Its returned own-property keys must exactly match the interface fields listed above.

`StandardCardPolicy.decide(observation)` rules:

1. One legal card: select it with `FOLLOW_SUIT_ONLY_ACTION`.
2. `needed = estimate - tricksWon`.
3. `needed <= 0`: `dump`, choose the lowest legal rank, `AVOID_OVERTRICK`.
4. `needed > cardsRemaining`: `recovery`, choose the lowest legal rank, `MINIMIZE_DAMAGE`.
5. `cardsRemaining <= 3`: `endgame`; choose highest legal rank when `needed > 0`, otherwise lowest; `ENDGAME_EXACT_SEARCH`.
6. `needed === cardsRemaining`: `acquire`, choose highest legal rank, `ACQUIRE_REQUIRED_TRICK`.
7. Otherwise: `control`; choose highest legal rank when `needed * 2 >= cardsRemaining`, otherwise lowest; `CONTROL_EXACT_TARGET`.

Ties use canonical card ID ascending order after rank comparison so results remain deterministic.

Tests must prove exact observation keys, no hidden-hand/deal fields in serialized observation, mode/reason behavior, deterministic output, and a complete four-bot round with zero rejected card commands.

---

### Task 2: Hand-strength evaluator and exact-trick probability distribution

**Files:**
- Create: `src/gameplay/bot/HandStrengthEvaluator.ts`
- Test: `tests/standardBotHandStrength.test.ts`

**Interfaces:**

```ts
export interface TrickProbability {
  readonly tricks: number;
  readonly probability: number;
}

evaluate(hand: readonly Card[], contractSuit: ContractSuit): readonly TrickProbability[];
```

The evaluator calculates a deterministic expected-trick centre from honours, suit length, trump length/quality, voids, singletons, and No Trump stoppers. It converts the centre to a normalized distribution over integers 0–13 using fixed distance weights. Tests require 14 entries, total probability within `1e-9` of 1, no negative values, stronger hands shifting expected tricks upward, and deterministic output.

---

### Task 3: Legal bid expected-utility policy

**Files:**
- Create: `src/gameplay/bot/StandardBidPolicy.ts`
- Test: `tests/standardBotBidPolicy.test.ts`

**Interfaces:**

```ts
export interface BotBidObservation {
  readonly policyVersion: 'STANDARD_V1';
  readonly playerId: string;
  readonly hand: readonly Card[];
  readonly legalBids: readonly EstimationBid[];
  readonly priorBids: readonly EstimationBid[];
  readonly bidOwnerPlayerId: string;
  readonly isLastBidder: boolean;
  readonly currentScores: Readonly<Record<string, number>>;
}

export interface BotBidDecision {
  readonly policyVersion: 'STANDARD_V1';
  readonly bid: EstimationBid;
  readonly expectedUtility: number;
  readonly evaluatedLegalBids: number;
}
```

For each legal bid, use `HandStrengthEvaluator` and House Rules V1 round scoring over actual outcomes 0–13. Select maximum expected score; tie-break by higher exact-match probability, lower absolute estimate, then stable serialized bid order. Tests must prove the total-13-excluded action is never selected because it is absent from legal bids, and stronger hands select higher estimates than weak hands in fixed fixtures.

---

### Task 4: Time-bounded Standard bot orchestrator and fallback audit metadata

**Files:**
- Create: `src/gameplay/bot/StandardBotPolicy.ts`
- Test: `tests/standardBotPolicy.test.ts`

The orchestrator exposes card and bid decisions, measures elapsed milliseconds through an injected clock, supports an injected deadline signal, and uses Task 1 deterministic fallback if the primary evaluator exceeds the deadline or throws. Audit metadata records policy version, action source (`permanent-bot`, `disconnect-substitute`, `timeout-assistant`), reason code, legal actions, selected action, duration, and whether fallback was used.

Tests must force primary failure/deadline and prove a legal fallback is produced deterministically.

---

### Task 5: Bot simulation and baseline metrics

**Files:**
- Create: `src/gameplay/bot/BotSimulationService.ts`
- Test: `tests/standardBotSimulation.test.ts`

Run deterministic seeded bot-vs-bot rounds through `GameplayCommandProcessor`. Produce completed games, exact-match rate, mean absolute estimate error, average score, rejected-command count, and decision counts by reason. Tests require zero rejected card commands, deterministic metrics for fixed seeds, all 52 cards consumed, and replay verification of every simulated round.
