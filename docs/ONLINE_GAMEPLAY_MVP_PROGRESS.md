# Online Gameplay and Computer-Player MVP Progress

**Product approval:** 25 July 2026  
**Approval scope:** Design, implementation plan, and recommended subsequent implementation decisions approved without additional scope gates  
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

## Completed milestones

| Task | Result | CI evidence |
| --- | --- | --- |
| Task 1 RED — deck/deal tests before implementation | Expected failure | Run #663 failed because gameplay APIs were absent |
| Task 1 GREEN — canonical deck, secure shuffle, four hands, commitment, verification | Complete | Run #673 passed full `npm run ci` |
| Task 2 RED — legal play and trick-resolution tests before implementation | Expected failure | Run #675 failed because services were absent |
| Task 2 GREEN — follow-suit legal actions and trump/No Trump trick resolution | Complete | Run #679 passed full `npm run ci` |

## Delivered APIs

- `createCanonicalDeck()`
- `DeterministicRandomSource.nextInt(maxExclusive)`
- `FairDealService.deal(input)`
- `FairDealService.verify(record)`
- `LegalCardPlayService.legalCards(hand, trickEntries)`
- `LegalCardPlayService.validate(selectedCard, hand, trickEntries)`
- `TrickResolutionService.resolve(entries, contractSuit)`

## Next milestone

Task 3: House Rules V1 playable round state machine and scoring-engine handoff.

The next test-first slices cover:

1. Ordered estimate submission and the total-estimates-not-equal-thirteen constraint.
2. Legal turn progression and card removal.
3. Thirteen completed tricks and actual-trick accumulation.
4. Winner-led next trick.
5. Handoff to the existing House Rules V1 score engine without duplicating scoring formulas.
