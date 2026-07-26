# Online Gameplay and Computer-Player MVP Progress

**Product approval:** 25 July 2026  
**Latest update:** 26 July 2026  
**Branch:** `feature/online-game-bot-mvp`  
**Draft PR:** #14  
**Merge authorization:** Not granted

## Approved baseline

- House Rules V1, real-time four-seat play, and one to four humans.
- Standard bots fill vacant seats at Start.
- One-turn bot assistance on timeout and temporary takeover after disconnect grace.
- Private/public tables, secure dealing, exact-estimate bots, audit, replay, and Realtime synchronization.
- The existing House Rules V1 scoring engine remains authoritative.

## Core decisions

- Web Crypto, SHA-256 commitments, deterministic Fisher-Yates, and rejection sampling.
- No `Math.random()`, random sort, modulo bias, Node-only crypto, or browser access to private deal material.
- Immutable state transitions with expected versions and idempotency IDs.
- Viewer-scoped hands and public state only.
- Bot observations and decisions remain server-side; directives contain public work identity only.
- Realtime changes invalidate client state; clients reload authoritative snapshots.
- Secure Start uses a dedicated authenticated Edge Function with deterministic retry identities.

## Completed milestones

| Milestone | Status | CI evidence |
| --- | --- | --- |
| Gameplay engine, scoring, commands, replay | Complete | #663–#695 |
| Standard bot and full-round simulation | Complete | #699–#720 |
| Table/lobby domain, joining, bots, Supabase definitions | Complete | #735–#755 |
| Timers, disconnect, takeover, reclaim, command replay | Complete | #760–#802 |
| React lobby, waiting room, controls, responsive layout | Complete | #795–#828 |
| Private active-round backend and bidding UI | Complete | Through #866 |
| Card play and authoritative submission | Complete | RED #872 / GREEN #876 |
| Server-side bot directive pipeline | Complete | RED #877–#891 / GREEN #894 |
| Round Realtime and scored results | Complete | RED #895/#900 / GREEN #899/#903 |
| Pure secure Start bootstrap | Complete | RED #906 / GREEN #912 |
| Authenticated retry-safe Start orchestration | Complete | RED #913 / GREEN #915 |
| Typed Start client and waiting-room routing | Complete | RED #917 / GREEN #922 |
| Opening bot kickoff and reconnect regression | Complete | GREEN #923 |

## Secure Start behavior

The configured Start action now:

1. starts and locks the table and fills vacant seats with permanent bots;
2. initializes active control and seat ownership;
3. generates a fresh secure seed, deal ID, nonce, deterministic dealer/caller, and public commitment on the server;
4. deals thirteen private cards to every seat and stores the verification record privately;
5. initializes the first House Rules V1 round and bidding timer;
6. returns only the authenticated player's hand and public state;
7. immediately processes a permanent-bot first bidder through the existing directive pipeline;
8. resumes safely after partial retries or reconnects.

The caller is the bid owner and first bidder. The next seat in table order has the first card lead after bidding.

## Current progress

| Area | Progress |
| --- | ---: |
| Engine and scoring | 100% |
| Standard bot | 100% |
| Lobby and table lifecycle | 100% |
| Active control and continuity | 100% |
| Active-round backend and UI | 100% |
| Secure Start bootstrap | 100% |
| Multi-round progression and final deal verification UI | 35% |
| Live Supabase/Edge verification | 0% |
| Multi-browser gameplay UAT | 0% |
| **Overall gameplay MVP implementation** | **96%** |

## Verification and release gates

CI **#923** passed repository typechecking, all engine and React tests, and the production build after the final Start production and regression changes. Later documentation-only commits remain subject to the normal branch CI check.

The migrations and Edge Function contracts are statically validated but have not yet been executed against a live Supabase project. Remaining release gates are:

- database migration compilation and transaction testing;
- RLS and workspace-isolation testing;
- Edge runtime and authentication testing;
- Realtime multi-client testing;
- one hosted Start-to-score complete-round smoke test;
- two-browser timeout, disconnect, takeover, reclaim, pause/resume, and termination UAT.

Detailed Start delivery: `docs/superpowers/reports/2026-07-26-start-game-bootstrap-delivery.md`.
