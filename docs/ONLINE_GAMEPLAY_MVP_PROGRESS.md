# Online Gameplay and Computer-Player MVP Progress

**Product approval:** 25 July 2026  
**Latest update:** 27 July 2026  
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
- Gameplay UAT is deployed only from a dedicated checkout to dedicated Supabase and Vercel projects.
- Deployment guards fail closed on the wrong directory, branch, SHA, Supabase reference, Vercel project, or dirty checkout.

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
| Deployment-readiness runbook and checks | Complete | RED #929 / GREEN #931 |
| Standalone score-engine boundary and gameplay scoring port | Complete | Verified in isolation CI |
| Gameplay-only React/Vite artifact | Complete | Verified in isolation CI |
| Dedicated gameplay-only Supabase workspace | Complete | Task 6 GREEN by #969 |
| Fail-closed target guards and non-secret evidence handling | Complete | Verified in isolation CI |
| Aggregate isolation gates in GitHub Actions | Complete | CI #984 |

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

## Isolation delivery checkpoint

Isolation-plan Tasks 1–8 are complete.

Delivered protections include:

- an independently buildable and testable score engine;
- an explicit gameplay-owned scoring port and production adapter;
- a gameplay-only browser artifact written to `dist-gameplay`;
- a dedicated `supabase-gameplay` workspace with nine ordered migrations;
- authenticated `gameplay-start` and `gameplay-round-command` functions only;
- no score-sheet persistence tables, score override tables, score locks, or score-calculator RPCs in the gameplay workspace;
- fail-closed Supabase and Vercel target verification;
- explicit rejection of the existing score-calculator Supabase reference `lexewcehptnmikwfizhj`;
- tested-SHA, clean-checkout, correct-branch, and correct-project enforcement;
- ignored, non-secret before/after deployment evidence;
- `ci:isolation` execution in GitHub Actions.

CI #984 completed successfully on commit `56228297f8cac2aaf1670d3c2766eecfc46e7189`. The normal package validation and the independent isolation-boundary validation both passed.

## Current progress

| Area | Progress |
| --- | ---: |
| Engine and scoring | 100% |
| Standard bot | 100% |
| Lobby and table lifecycle | 100% |
| Active control and continuity | 100% |
| Active-round backend and UI | 100% |
| Secure Start bootstrap | 100% |
| Isolation engineering, Tasks 1–8 | 100% |
| Full isolation/deployment plan | 80% |
| Multi-round progression and final deal verification UI | 35% |
| Dedicated Supabase/Vercel provisioning, Task 9 | 0% |
| Hosted solo and multi-browser UAT, Task 10 | 0% |
| **Overall gameplay MVP implementation** | **96%** |

## Verification and release gates

CI **#984** passed:

- repository typechecking;
- engine and React tests;
- score-engine-only typecheck and tests;
- gameplay-only build and import-boundary verification;
- gameplay Supabase workspace isolation checks;
- fail-closed target-guard tests;
- production score-calculator and gameplay builds.

The migrations and Edge Function contracts are statically validated but have not yet been executed against a live gameplay-only Supabase project.

Remaining Task 9 operational gates require authenticated, interactive Supabase and Vercel access:

1. record the existing score-calculator UAT baseline without secrets;
2. create `estimation-gameplay-uat` in Supabase;
3. link the dedicated checkout and verify the new reference with the target guard;
4. dry-run and review all nine migrations;
5. apply migrations and deploy both authenticated Edge Functions;
6. create isolated Auth users, profiles, memberships, and the `estimation-gameplay-uat` workspace;
7. create and link the dedicated `estimation-gameplay-uat` Vercel project;
8. configure preview-safe environment variables and deploy only `dist-gameplay`.

Remaining Task 10 acceptance gates are:

- a hosted solo-versus-three-bots Start-to-score complete-round smoke test;
- two-browser Realtime, private-hand, timeout, disconnect, takeover, reclaim, pause/resume, and termination UAT;
- a score-calculator UAT before/after comparison proving no unexplained branch, project, URL, access, or data change;
- final repository verification at the deployed SHA.

Detailed plans and runbooks:

- `docs/superpowers/plans/2026-07-26-gameplay-uat-full-isolation.md`
- `docs/GAMEPLAY_UAT_DEPLOYMENT.md`
- `docs/superpowers/reports/2026-07-26-start-game-bootstrap-delivery.md`

PR #14 remains draft and must not be merged as part of deployment or UAT.
