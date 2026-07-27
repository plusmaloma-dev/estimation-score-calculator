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
- Gameplay UAT uses a dedicated checkout, Supabase project, Vercel project, Auth users, and workspace.
- The dedicated Vercel project’s canonical environment is UAT-only even though Vercel labels it Production.
- Gameplay UAT deployment is allowed only through the fail-closed `deploy:gameplay-vercel` wrapper.

## Completed product milestones

| Milestone | Status | Evidence |
|---|---|---|
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

## Completed isolation and hosted-provisioning milestones

- Standalone score-engine boundary and gameplay-owned scoring adapter.
- Gameplay-only React/Vite artifact under `dist-gameplay`.
- Dedicated Supabase project `estimation-gameplay-uat` with ref `stedjwppoanbmhxsfhcg`.
- Nine gameplay-only migrations applied and verified.
- Authenticated `gameplay-start` and `gameplay-round-command` Functions deployed with JWT verification enabled.
- Three isolated Auth users created: host, assigned tester, and non-member negative-access tester.
- Workspace `estimation-gameplay-uat` created with exactly two memberships: host/admin and tester/tester.
- Existing score-UAT before-state evidence recorded and protected.
- Dedicated Vercel project `estimation-gameplay-uat` created, linked, and guarded.
- Gameplay-specific Vercel project settings verified: `npm run build:gameplay`, `dist-gameplay`, and `npm ci`.
- Two incorrect initial Vercel deployments were removed by their exact deployment URLs.
- Corrective Vercel deployment design and detailed implementation plan approved.
- Guarded canonical-UAT deployment wrapper implemented and enforced by package and isolation tests.

## Corrected Vercel deployment control

The deployment wrapper now owns the complete browser rollout:

1. requires the exact tested SHA, gameplay Supabase URL, workspace slug, and a hidden browser-safe publishable key;
2. invokes the existing Vercel target guard before any build;
3. runs only `npm run build:gameplay`;
4. disables implicit Vite `.env*` loading with `envDir: false`;
5. injects only the three required `VITE_` values through the child-process environment;
6. stages only `.vercel/project.json` and `.vercel/output/**` under ignored `vercel-gameplay-deploy/`;
7. rejects source files, root `vercel.json`, `dist-app`, environment files, symlinks, and non-allow-listed paths;
8. confirms the expected public URL, workspace slug, and publishable key are embedded;
9. rejects exact prohibited secret values without printing their values;
10. reruns the target guard before deployment;
11. supports a no-contact dry-run;
12. deploys the prebuilt artifact from the isolated workspace with `--prod --archive=tgz` only because the entire project is UAT-only.

No direct `vercel deploy` command from the repository root is authorized.

## Secure Start behavior

The configured Start action:

1. starts and locks the table and fills vacant seats with permanent bots;
2. initializes active control and seat ownership;
3. generates a fresh secure seed, deal ID, nonce, deterministic dealer/caller, and public commitment on the server;
4. deals thirteen private cards to every seat and stores verification material privately;
5. initializes the first House Rules V1 round and bidding timer;
6. returns only the authenticated player’s hand and public state;
7. immediately processes a permanent-bot first bidder through the existing directive pipeline;
8. resumes safely after partial retries or reconnects.

The caller is the bid owner and first bidder. The next seat in table order has the first card lead after bidding.

## Current progress

| Area | Progress |
|---|---:|
| Engine and scoring | 100% |
| Standard bot | 100% |
| Lobby and table lifecycle | 100% |
| Active control and continuity | 100% |
| Active-round backend and UI | 100% |
| Secure Start bootstrap | 100% |
| Isolation engineering, Tasks 1–8 | 100% |
| Supabase hosted provisioning | 100% |
| Dedicated Vercel project provisioning | 100% |
| Guarded Vercel deployment correction | 100% |
| Task 9 hosted environment provisioning | 96% |
| Hosted solo and multi-browser UAT, Task 10 | 0% |
| Multi-round progression and final deal verification UI | 35% |
| **Overall gameplay MVP implementation** | **96%** |

## Remaining release gates

Task 9 remaining steps:

1. verify both GitHub Actions checks on the final correction SHA;
2. pull that exact SHA into `C:\Users\rjamm\estimation-gameplay-uat`;
3. enter the browser-safe publishable key through a hidden local prompt;
4. run the guarded wrapper once with `--dry-run`;
5. review only the non-secret boolean and file-count output;
6. run the same wrapper once without `--dry-run`;
7. add `https://estimation-gameplay-uat.vercel.app` only to the gameplay Supabase Auth URL configuration.

Task 10 acceptance gates:

- host and assigned tester can sign in;
- non-member user is rejected;
- private, public open-join, and public approval-required tables reopen correctly;
- one hosted solo-versus-three-bots Start-to-score round completes;
- two-browser Realtime, private-hand, timeout, disconnect, takeover, reclaim, pause/resume, and termination checks pass;
- score-UAT after-state matches the protected before-state with no unexplained change;
- repository validation passes again at the deployed SHA.

## Documentation

- Product design: `docs/superpowers/specs/2026-07-25-online-game-bot-mvp-design.md`
- Full isolation plan: `docs/superpowers/plans/2026-07-26-gameplay-uat-full-isolation.md`
- Vercel correction design: `docs/superpowers/specs/2026-07-27-gameplay-uat-vercel-deployment-correction-design.md`
- Vercel correction plan: `docs/superpowers/plans/2026-07-27-gameplay-uat-vercel-deployment-correction.md`
- Deployment runbook: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`
- Start delivery: `docs/superpowers/reports/2026-07-26-start-game-bootstrap-delivery.md`

PR #14 remains draft and must not be merged as part of deployment or UAT.
