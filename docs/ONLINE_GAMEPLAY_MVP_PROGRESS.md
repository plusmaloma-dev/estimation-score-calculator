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

The initial Task 1 implementation used Node-only `node:crypto` and `Buffer`. Repository validation exposed that this violated the shared browser/Supabase Edge Function compilation boundary because `tsconfig.app.json` includes all `src/**/*.ts` files.

The production implementation therefore uses the standards-based Web Crypto API:

- HMAC-SHA-256 counter stream for deterministic random bytes.
- Rejection sampling for unbiased bounded integers.
- SHA-256 commitment generation through `crypto.subtle.digest`.
- Async `FairDealService.deal` and `FairDealService.verify` APIs.
- No `Math.random()`, random sorting, modulo-biased sampling, Node-only crypto import, or `Buffer` dependency.

This decision preserves deterministic replay while supporting Node, browser typechecking, and Supabase Edge Functions.

### Explicit seat orders

The gameplay engine does not hard-code clockwise or counter-clockwise assumptions. Every round receives explicit four-seat bidding and play-order permutations plus the first lead seat. This lets the online table layer apply the accepted House Rules V1 dealer and rotation rules without duplicating card legality or scoring logic.

### Immutable state transitions

`HouseRulesRoundEngine` never mutates a supplied state. Accepted bids/cards produce a new state; invalid actions return the original state reference. This enables safe expected-version checks, deterministic replay, database transactions, and React state projection.

### Command idempotency and rejected outcomes

Each processed command records its command ID, expected version, payload, accepted/rejected outcome, resulting version, errors, and transition. Accepted actions increment the version by exactly one. Rejected domain or stale-version commands do not increment it, but their outcome is retained so retrying the same command ID returns the original result. Reusing an ID with a different payload is rejected as an integrity conflict.

### CI diagnostics

Failed validation runs now upload `ci-output.log` as a failure-only artifact. This was added because connector-rendered job logs can truncate before the actual compiler or test error. Successful runs skip the artifact.

## Completed milestones

| Task | Result | CI evidence |
| --- | --- | --- |
| Task 1 RED — deck/deal tests before implementation | Expected failure | Run #663 |
| Task 1 GREEN — canonical deck, secure shuffle, four hands, commitment, verification | Complete | Run #673 passed full `npm run ci` |
| Task 2 RED — legal play and trick-resolution tests before implementation | Expected failure | Run #675 |
| Task 2 GREEN — follow-suit legal actions and trump/No Trump trick resolution | Complete | Run #679 passed full `npm run ci` |
| Task 3 RED — round state-machine tests before implementation | Expected failure | Run #682 |
| Task 3 GREEN — ordered bidding, total-13 prevention, 52-card play, 13 tricks, Risk metadata, scoring handoff | Complete | Run #687 passed full `npm run ci` |
| Task 4 RED — version/idempotency tests before implementation | Expected failure | Run #688 |
| Task 4 GREEN — command processing, stale-version rejection, retry identity, payload conflict detection | Complete | Run #691 passed full `npm run ci` |
| Task 5 RED — replay/tamper tests before implementation | Expected failure | Run #692 |
| Task 5 GREEN — deterministic replay, transition verification, version-gap and duplicate-version detection | Complete | Run #695 passed full `npm run ci` |

## Delivered APIs

- `createCanonicalDeck()`
- `DeterministicRandomSource.nextInt(maxExclusive)`
- `FairDealService.deal(input)`
- `FairDealService.verify(record)`
- `LegalCardPlayService.legalCards(hand, trickEntries)`
- `LegalCardPlayService.validate(selectedCard, hand, trickEntries)`
- `TrickResolutionService.resolve(entries, contractSuit)`
- `HouseRulesRoundEngine.create(input)`
- `HouseRulesRoundEngine.submitBid(state, seat, bid)`
- `HouseRulesRoundEngine.legalCards(state, seat)`
- `HouseRulesRoundEngine.playCard(state, seat, card)`
- `GameplayCommandProcessor.process(state, version, records, envelope)`
- `GameplayReplayService.replay(initialState, records)`

## Current progress

| Area | Progress |
| --- | ---: |
| Research and approved design | 100% |
| Engine-core implementation plan | 100% |
| Secure deal and verification | 100% |
| Legal card play and trick resolution | 100% |
| Complete House Rules V1 round engine | 100% |
| Versioned commands and deterministic replay | 100% |
| Standard bot policy | 0% |
| Online lobby, persistence, Realtime, and private-hand projection | 0% |
| React gameplay screens | 0% |
| End-to-end gameplay UAT | 0% |
| **Overall gameplay MVP implementation** | **30%** |

## Next milestone

Standard bot foundation:

1. Allow-listed `BotObservation` that cannot contain opponent hands or future deck state.
2. Deterministic legal fallback policy with zero illegal actions.
3. Exact-target mode selection: Acquire, Control, Dump, Recovery, and Endgame.
4. Hand-strength and bid probability evaluation.
5. Versioned bot reason codes and decision timing metadata.
