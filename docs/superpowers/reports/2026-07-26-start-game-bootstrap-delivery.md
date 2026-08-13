# Secure Start Game Bootstrap Delivery Report

**Date:** 26 July 2026  
**Branch:** `feature/online-game-bot-mvp`  
**Draft PR:** #14  
**Status:** Repository implementation complete and verified; live Supabase/Vercel execution remains a release gate  
**Merge authorization:** Not granted

## Objective

Replace the former table-only Start transition with a secure, authenticated, retry-safe bootstrap that creates the first authoritative House Rules V1 round and routes the host into a scoped active-game snapshot.

## Delivered behavior

### Secure pure bootstrap

`GameplaySessionBootstrapService` now:

- validates a started four-seat table;
- maps each human or permanent bot seat to one unique gameplay player;
- consumes an injected 256-bit seed, deal ID, and nonce;
- selects the dealer/caller without modulo bias through `DeterministicRandomSource.nextInt(4)`;
- creates a deterministic cryptographic Fisher-Yates deal through `FairDealService`;
- gives every seat exactly thirteen unique cards;
- creates the initial immutable House Rules V1 round;
- retains the seed, nonce, shuffled deck, hands, and verification record only in the private aggregate;
- exposes only the SHA-256 deal commitment through the player snapshot.

### Dealer, caller, bidding, and lead baseline

For round 1:

- the securely selected dealer/caller is the bid owner;
- the caller submits the first estimate;
- bidding continues in table seat order;
- the next seat in table order has the first card lead after bidding completes;
- the initial active-control turn is a bid turn for the caller.

This baseline uses the approved House Rules V1 direction and introduces no alternative gameplay rule.

### Authenticated Start Function

The dedicated `gameplay-start` Edge Function:

1. resolves the authenticated user from the bearer token;
2. accepts only `tableId`, `expectedVersion`, and `commandId` from the browser;
3. runs the table Start transition with `table-start:<commandId>`;
4. initializes active and seat control with `control-init:<commandId>`;
5. checks for an existing private round before generating a new seed;
6. generates secure deal material only on the server;
7. initializes the private round aggregate;
8. starts the first bidding turn with `turn-start:<commandId>`;
9. returns only the authenticated player's scoped snapshot.

Retries recover previously completed steps rather than creating another deal. Private deal material and service-role credentials are never serialized to the browser.

### Browser Start integration

`OnlineGameplayRoundService.startGame(...)` now:

- invokes only the authenticated `gameplay-start` function;
- sends no actor identity, seed, hand, deck, or privileged credential;
- validates the public response with the existing strict snapshot parser;
- requires a valid 64-character SHA-256 deal commitment for a successful Start response;
- rejects malformed or privacy-unsafe snapshots completely.

`GameplayTableScreen` now prefers secure bootstrap when configured. It navigates to the active game only after receiving a valid initial round. An authoritative failure keeps the host in the waiting room and displays the returned error. Direct table Start remains only as a backward-compatible fallback for local or older test adapters.

### Opening bot kickoff and recovery

The existing active-game orchestration is now protected by a Start-specific regression contract:

- a permanent-bot first bidder is evaluated immediately with zero client delay;
- the resulting public directive is processed through the server-side Standard bot boundary;
- `assistant-pending` or `bot-processing` opening turns are reconstructed after navigation or reconnect;
- a human first bidder retains the configured turn deadline;
- hidden bot observations remain server-side.

## TDD and CI evidence

| Slice | RED / intermediate evidence | GREEN evidence |
| --- | --- | --- |
| Pure secure bootstrap | #906 | #912 |
| Authenticated Edge orchestration | #913 / #914 static assertion correction | #915 |
| Typed Start service and waiting-room routing | #917 / #920 compatibility correction | #922 |
| Opening bot kickoff and reconnect regression | Existing directive RED/GREEN #891/#894; Start-specific gate added | #923 |

Fresh CI run **#923** passed repository typechecking, the complete engine and React test suites, and the production build.

## Principal files

- `src/gameplay/session/types.ts`
- `src/gameplay/session/GameplaySessionBootstrapService.ts`
- `src/gameplay/types.ts`
- `src/gameplay/HouseRulesRoundEngine.ts`
- `src/gameplay/GameplayRoundSnapshotProjector.ts`
- `src/online/gameplay/roundTypes.ts`
- `src/online/gameplay/OnlineGameplayRoundService.ts`
- `src/app/AppContext.tsx`
- `src/app/screens/GameplayTableScreen.tsx`
- `supabase/functions/gameplay-start/index.ts`
- `tests/gameplaySessionBootstrapService.test.ts`
- `tests/gameplayStartEdgeFunction.test.ts`
- `tests/onlineGameplayStartService.test.ts`
- `src/app/screens/GameplayTableStartBootstrap.test.tsx`
- `tests/gameplayStartBotKickoff.test.ts`

## Security review

- No browser-provided seed or deck input.
- No `Math.random()`, random sorting, modulo-biased selection, Node-only crypto, or `Buffer`.
- Authentication is resolved server-side.
- Service-role access remains inside the Edge Function runtime.
- Public requests contain only table/version/idempotency identity.
- Player snapshots expose own hand and public state only.
- Deal commitment is public; seed and nonce remain private during play.
- Deterministic sub-command IDs support retry without duplicate deals or turns.

## Remaining release gates

The repository implementation is not equivalent to a hosted playable environment. The following remain unverified:

1. PostgreSQL compilation of all gameplay migrations on a real Supabase project.
2. RLS behavior for host, seated human, non-member, and cross-workspace sessions.
3. Edge Function module loading, JWT validation, service-role RPC access, and runtime Web Crypto.
4. Realtime publication and multi-client invalidation behavior.
5. A complete hosted Start → four bids → 52 cards → scored round smoke test.
6. Multi-browser timeout, disconnect, takeover, reclaim, pause/resume, and termination UAT.
7. Multi-round progression and final seed reveal/verification UI.

No merge or production deployment is authorized by this report.
