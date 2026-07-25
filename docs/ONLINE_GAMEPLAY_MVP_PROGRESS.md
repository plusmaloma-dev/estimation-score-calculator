# Online Gameplay and Computer-Player MVP Progress

**Product approval:** 25 July 2026  
**Approval scope:** Design, implementation plans, and recommended subsequent implementation decisions approved without additional routine scope gates  
**Implementation branch:** `feature/online-game-bot-mvp`  
**Draft implementation PR:** #14  
**Merge authorization:** Not granted for `main`

## Approved baseline

- House Rules V1 only.
- Real-time four-seat online play.
- One to four human players.
- Standard bots fill vacant seats when the host starts.
- Connected-player timeout produces one bot action only.
- Disconnected-player grace expiry produces temporary bot takeover.
- Returning human reclaims at the next safe uncommitted action boundary.
- Private and public tables.
- Public tables support open join or host approval.
- Secure, deterministic, verifiable thirteen-card dealing.
- Exact-estimate bot objective.
- Existing House Rules V1 scoring engine remains authoritative.

## Implementation decisions

### Portable cryptography

The initial fair-deal implementation used Node-only `node:crypto` and `Buffer`. Repository validation exposed that this violated the shared browser/Supabase Edge Function compilation boundary because `tsconfig.app.json` includes all `src/**/*.ts` files.

The production implementation therefore uses the standards-based Web Crypto API:

- HMAC-SHA-256 counter stream for deterministic random bytes.
- Rejection sampling for unbiased bounded integers.
- SHA-256 commitment generation through `crypto.subtle.digest`.
- Async `FairDealService.deal` and `FairDealService.verify` APIs.
- No `Math.random()`, random sorting, modulo-biased sampling, Node-only crypto import, or `Buffer` dependency.

### Explicit seat orders

The gameplay engine does not hard-code clockwise or counter-clockwise assumptions. Every round receives explicit four-seat bidding and play-order permutations plus the first lead seat. This lets the online table layer apply the accepted House Rules V1 dealer and rotation rules without duplicating card legality or scoring logic.

### Immutable state transitions

`HouseRulesRoundEngine` never mutates a supplied state. Accepted bids/cards produce a new state; invalid actions return the original state reference. This enables safe expected-version checks, deterministic replay, database transactions, and React state projection.

### Command idempotency and rejected outcomes

Each processed command records its command ID, expected version, payload, accepted/rejected outcome, resulting version, errors, and transition. Accepted actions increment the version by exactly one. Rejected domain or stale-version commands do not increment it, but their outcome is retained so retrying the same command ID returns the original result. Reusing an ID with a different payload is rejected as an integrity conflict.

### Privacy-safe bot boundary

The Standard bot receives an allow-listed observation containing its own hand, legal actions, public bids, public trick history, estimate, and tricks won. It never receives other hands, the shuffled deck, the seed, or private reconnect data. The bot has no database access.

### Exact-target bot behavior

The Standard bot uses deterministic Acquire, Control, Dump, Recovery, and Endgame modes. It deliberately selects low legal cards after reaching its estimate. Bidding evaluates only externally supplied legal bids and uses a normalized 0–13 trick probability distribution plus the existing House Rules V1 scoring strategy for expected utility.

### Bot time limits and fallback

The orchestrator records policy version, action source, reason code, legal actions, selected action, duration, and fallback usage. Policy errors or decisions exceeding the hard limit are replaced with deterministic legal fallback actions.

### CI diagnostics

Failed validation runs upload `ci-output.log` as a failure-only artifact. This was added because connector-rendered job logs can truncate before the actual compiler or test error. Successful runs skip the artifact.

## Completed milestones

| Task | Result | CI evidence |
| --- | --- | --- |
| Engine Task 1 RED — deck/deal tests | Expected failure | Run #663 |
| Engine Task 1 GREEN — secure deterministic deal and verification | Complete | Run #673 |
| Engine Task 2 RED — legal play/trick tests | Expected failure | Run #675 |
| Engine Task 2 GREEN — follow suit and trick resolution | Complete | Run #679 |
| Engine Task 3 RED — round state-machine tests | Expected failure | Run #682 |
| Engine Task 3 GREEN — full playable and scored House Rules round | Complete | Run #687 |
| Engine Task 4 RED — version/idempotency tests | Expected failure | Run #688 |
| Engine Task 4 GREEN — authoritative command processing | Complete | Run #691 |
| Engine Task 5 RED — replay/tamper tests | Expected failure | Run #692 |
| Engine Task 5 GREEN — deterministic verified replay | Complete | Run #695 |
| Bot Task 1 RED — observation/card-policy tests | Expected failure | Run #699 |
| Bot Task 1 GREEN — private observation and zero-illegal-action card policy | Complete | Run #703 |
| Bot Task 2 RED — hand-probability tests | Expected failure | Run #704 |
| Bot Task 2 GREEN — normalized exact-trick probability model | Complete | Run #708 |
| Bot Task 3 RED — legal-bid utility tests | Expected failure | Run #709 |
| Bot Task 3 GREEN — House Rules expected-utility bid selection | Complete | Run #712 |
| Bot Task 4 RED — timeout/fallback audit tests | Expected failure | Run #713 |
| Bot Task 4 GREEN — audited time-bounded orchestrator | Complete | Run #716 |
| Bot Task 5 RED — four-bot simulation tests | Expected failure | Run #717 |
| Bot Task 5 GREEN — deterministic bidding, 52-card play, scoring, metrics, replay | Complete | Run #720 |

## Delivered gameplay and bot APIs

- `FairDealService.deal(input)` / `verify(record)`
- `LegalCardPlayService.legalCards(...)` / `validate(...)`
- `TrickResolutionService.resolve(...)`
- `HouseRulesRoundEngine.create(...)` / `submitBid(...)` / `playCard(...)`
- `GameplayCommandProcessor.process(...)`
- `GameplayReplayService.replay(...)`
- `BotObservationService.createCardObservation(...)`
- `StandardCardPolicy.decide(...)`
- `HandStrengthEvaluator.evaluate(...)`
- `StandardBidPolicy.decide(...)`
- `StandardBotPolicy.decideBid(...)` / `decideCard(...)`
- `BotSimulationService.simulateRound(...)`

## Current progress

| Area | Progress |
| --- | ---: |
| Research and approved design | 100% |
| Gameplay engine core | 100% |
| Secure deal and verification | 100% |
| Versioned commands and deterministic replay | 100% |
| Standard bot policy and simulation | 100% |
| Online table/lobby domain | 0% |
| Supabase persistence, RLS, Edge Functions, and Realtime | 0% |
| React gameplay screens | 0% |
| Timers, disconnect takeover, and reclaim | 0% |
| End-to-end gameplay UAT | 0% |
| **Overall gameplay MVP implementation** | **45%** |

## Next milestone

Online table and lobby foundation:

1. Public/private table lifecycle and host-configurable settings.
2. Four-seat human membership and join requests.
3. Open-join and approval-required policies.
4. Host succession before play.
5. Start command that fills vacant seats with permanent Standard bots and locks settings.
6. Persistence schema and transactional boundaries prepared for Supabase Realtime integration.
