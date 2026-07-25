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
- Private and public tables with open or host-approved public joining.
- Secure, deterministic, verifiable thirteen-card dealing.
- Exact-estimate bot objective.
- Existing House Rules V1 scoring engine remains authoritative.

## Core implementation decisions

- Web Crypto HMAC/SHA-256 with rejection sampling; no `Math.random()`, random sorting, modulo bias, Node-only crypto, or `Buffer`.
- Explicit bidding/play seat orders and immutable transitions.
- Versioned, idempotent commands with recorded accepted/rejected outcomes.
- Privacy-safe bot observations containing only own hand, legal actions, and public state.
- Deterministic Acquire, Control, Dump, Recovery, and Endgame card modes.
- Normalized 0–13 trick probabilities and House Rules V1 bid expected utility.
- Audited hard-deadline/error fallback for all bot decisions.
- Failed CI runs retain a downloadable `ci-output.log` artifact.

## Completed milestones

| Task | Result | CI evidence |
| --- | --- | --- |
| Engine Task 1 RED/GREEN — secure deal | Complete | #663 / #673 |
| Engine Task 2 RED/GREEN — legal play and trick resolution | Complete | #675 / #679 |
| Engine Task 3 RED/GREEN — complete scored House Rules round | Complete | #682 / #687 |
| Engine Task 4 RED/GREEN — authoritative versioned commands | Complete | #688 / #691 |
| Engine Task 5 RED/GREEN — deterministic verified replay | Complete | #692 / #695 |
| Bot Task 1 RED/GREEN — private observation and legal card policy | Complete | #699 / #703 |
| Bot Task 2 RED/GREEN — exact-trick probability model | Complete | #704 / #708 |
| Bot Task 3 RED/GREEN — House Rules bid expected utility | Complete | #709 / #712 |
| Bot Task 4 RED/GREEN — audited timeout/error fallback | Complete | #713 / #716 |
| Bot Task 5 RED/GREEN — seeded four-bot full-round simulation | Complete | #717 / #720 |

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
| Standard bot policy and simulation | 100% |
| Online table/lobby implementation plan | 100% |
| Online table/lobby domain | 0% |
| Supabase persistence, RLS, RPCs, and Realtime | 0% |
| React gameplay screens | 0% |
| Timers, disconnect takeover, and reclaim | 0% |
| End-to-end gameplay UAT | 0% |
| **Overall gameplay MVP implementation** | **45%** |

## Active next milestone

Implementation follows `docs/superpowers/plans/2026-07-25-online-table-lobby.md`:

1. Immutable public/private table lifecycle and settings.
2. Open join and approval-required requests.
3. Host succession and Start filling vacant seats with permanent bots.
4. Versioned table commands.
5. Supabase schema, RLS, transactional RPCs, and typed service adapter.
6. Realtime-safe lobby/member/host projections.
