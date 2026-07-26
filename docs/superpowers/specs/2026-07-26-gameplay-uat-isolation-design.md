# Gameplay UAT Full-Isolation Design

**Date:** 26 July 2026  
**Status:** Pending user approval  
**Branch:** `feature/online-game-bot-mvp`

## Objective

Deploy and test the online gameplay MVP without changing, replacing, or risking the existing score-calculator UAT environment.

The score engine remains independently buildable and testable. The gameplay module consumes scoring through an explicit interface and adapter. Deployment infrastructure, database objects, authentication, environment links, and frontend artifacts are isolated between the score-calculator UAT and gameplay UAT.

## Non-negotiable architecture

### Standalone score engine

The score engine owns:

- bid validation;
- score formulas and scoring profiles;
- House Rules V1 and Federation rule-set selection;
- round score results, risk, WITH, Dash, and all-loser carry calculations;
- leaderboard calculations derived from scored rounds.

The score engine must not import or depend on:

- gameplay cards, tricks, dealing, tables, timers, bots, or reconnect logic;
- React or browser routing;
- Supabase, Vercel, Realtime, or Edge Functions;
- gameplay database records.

A dedicated command must prove that the score engine can typecheck and run its own tests without compiling or running gameplay tests.

### Standalone gameplay module

The gameplay module owns:

- table and seat lifecycle;
- fair dealing;
- bidding and legal card play;
- trick resolution;
- timers, pause/resume, disconnect, takeover, and reclaim;
- bot decisions and bot directives;
- authoritative round state, replay, and privacy projections;
- gameplay-specific React screens and online services.

Gameplay must not duplicate score formulas. At round completion it calls a scoring interface.

### Scoring dependency boundary

The required dependency direction is:

```text
Gameplay UI and online services
            |
            v
Gameplay domain engine
            |
            v
Gameplay scoring port
            |
            v
Score-engine adapter
            |
            v
Standalone score engine
```

Rules:

- the gameplay domain depends on a small `RoundScoringPort`-style interface, not directly on a concrete score-engine service;
- the production adapter delegates to the existing standalone score engine;
- gameplay tests may inject a fake scoring port;
- score-engine formulas and public behavior remain unchanged;
- the score engine never imports gameplay code.

## Current repository findings

The following gaps must be closed before deployment:

1. The current gameplay round engine directly imports the concrete `EstimationMvpService`. This is one-way, but it is not yet the explicit interface boundary required above.
2. The current `vite build` creates one application containing score-sheet and gameplay routes. A separate Vercel project would isolate hosting, but not the deployment artifact.
3. The current initial Supabase migration contains shared identity/workspace objects and score-sheet persistence objects in the same file. Applying that migration set to gameplay UAT would create unused score-sheet tables and RPCs.
4. `.vercel/` and `supabase/.temp/` are ignored local directories. Their project links are not isolated by Git branch, so one checkout can accidentally retain the wrong Vercel or Supabase target.
5. The current `test:engine` command runs both score-engine and gameplay tests. It does not independently prove that the score engine works standalone.

No deployment may begin until these gaps have corresponding implementation and verification gates.

## Required environment boundary

### Existing score-calculator UAT

The following must remain unchanged:

- Supabase project `estimation-score-calculator-uat`;
- Supabase project reference `lexewcehptnmikwfizhj`;
- existing Vercel project and UAT URL;
- existing score-sheet database objects and data;
- branch `feature/react-vite-frontend-prototype`;
- existing Auth users and workspace memberships;
- score-engine formulas and externally observable scoring behavior.

No gameplay migration, Edge Function, environment variable, Vercel link, Supabase link, branch reset, or rollback operation may target this environment.

### New gameplay UAT

Create a fully separate environment:

- Supabase project `estimation-gameplay-uat`;
- separate Vercel project `estimation-gameplay-uat`;
- separate deployment URL;
- separate Auth users and workspace membership;
- fixed workspace slug `estimation-gameplay-uat`;
- separate migration history;
- separate gameplay tables, active-control records, round state, Realtime channels, and Edge Functions;
- separate local checkout or Git worktree dedicated to gameplay deployment.

The gameplay UAT may use the same Git repository and score-engine source module, but it must not reuse the score-calculator UAT database, Vercel project, local project links, or deployment artifact.

## Local checkout isolation

Gameplay deployment must use a dedicated local directory, for example:

```text
C:\Users\rjamm\estimation-gameplay-uat
```

The existing score-calculator checkout remains linked to the score-calculator UAT environment.

Required safeguards:

1. create the gameplay checkout from `origin/feature/online-game-bot-mvp` using a separate clone or Git worktree;
2. never run `vercel link`, `supabase link`, database deployment, or Edge deployment from the score-calculator UAT checkout;
3. verify the gameplay checkout path, branch, and commit before every infrastructure write;
4. preserve the existing checkout and local UAT branch before repairing its branch pointer;
5. never copy `.vercel/` or `supabase/.temp/` from the score-calculator checkout into the gameplay checkout.

## Frontend artifact isolation

A gameplay-specific build must be added before deployment.

Required result:

- score-calculator UAT continues to use its existing score-calculator build and routes;
- gameplay UAT uses a gameplay-only entry point and build command;
- the gameplay artifact opens at the gameplay sign-in/home/lobby flow;
- score-sheet creation, score-sheet history, score-sheet editing, and score-sheet routes are not shipped or reachable in the gameplay artifact;
- the shared score engine is included only as a code dependency used by gameplay scoring;
- Vercel gameplay project configuration invokes the gameplay-specific build and output directory.

The implementation may use a separate Vite entry point or an explicit build mode, but it must produce a distinct artifact rather than relying only on runtime navigation hiding.

## Supabase schema isolation

Gameplay UAT must use a dedicated Supabase migration workspace or directory. It must not apply the score-calculator migration set unchanged.

The gameplay migration baseline may contain only:

- required shared primitives such as profiles, workspaces, workspace memberships, and common timestamp helpers;
- gameplay tables and seats;
- gameplay join requests and table commands;
- active-control and seat-control records;
- gameplay round state, command ledger, and public invalidations;
- gameplay-specific RLS policies and RPCs;
- Realtime publication entries required by gameplay.

The gameplay project must not create score-calculator persistence objects such as:

- `players` directory records used by score sheets;
- `games` and `game_players` score-sheet records;
- score-sheet `rounds`, `round_bids`, `round_actuals`, or `round_scores`;
- `score_overrides`;
- score-sheet edit locks;
- score-calculator RPCs.

Existing applied migrations in the score-calculator UAT must not be edited. Shared primitives must be introduced to gameplay through new, gameplay-specific migration files or a dedicated migration workspace.

## Supabase deployment safeguards

Before every database or Edge Function write:

1. verify the current filesystem path is the dedicated gameplay checkout;
2. verify the current Git branch is `feature/online-game-bot-mvp`;
3. verify the tested commit SHA;
4. verify `npx supabase projects list` identifies `estimation-gameplay-uat` as linked;
5. verify the linked project reference is present on an explicit allow-list;
6. verify the linked reference is not `lexewcehptnmikwfizhj`;
7. run a migration dry-run;
8. stop on any destructive action or any score-calculator persistence object;
9. deploy `gameplay-start` and `gameplay-round-command` only after migration verification;
10. keep public registration disabled and privileged credentials server-side.

A deployment script or verification command must fail closed when identity checks are missing or ambiguous.

## Vercel deployment safeguards

Before every Vercel write:

1. verify the dedicated gameplay checkout path, branch, and SHA;
2. verify the authenticated account and active team;
3. verify `.vercel/project.json` identifies the new gameplay project;
4. verify the project is not the existing score-calculator Vercel project;
5. configure only browser-safe gameplay environment variables;
6. run the gameplay-specific build locally;
7. deploy only the gameplay artifact;
8. record the gameplay URL and commit SHA;
9. recheck the existing score-calculator UAT URL after deployment.

Gameplay Vercel variables:

- `VITE_SUPABASE_URL` for `estimation-gameplay-uat`;
- `VITE_SUPABASE_ANON_KEY` for `estimation-gameplay-uat`;
- `VITE_UAT_WORKSPACE_SLUG=estimation-gameplay-uat`.

No database password, service-role key, private server key, or personal token may use a `VITE_` prefix or be committed to the repository.

## Existing UAT protection evidence

Before gameplay deployment, record a non-secret baseline for the score-calculator UAT:

- remote UAT branch SHA;
- Supabase project name and reference;
- Vercel project identity and current UAT URL;
- successful sign-in and score-sheet-open smoke check;
- non-sensitive counts for key score-sheet tables, where practical.

After gameplay deployment, repeat the same checks. Any difference not explicitly attributable to normal score-calculator UAT activity fails the isolation acceptance gate.

## Deployment flow

1. Preserve and repair the existing local UAT checkout without pushing.
2. Create a dedicated gameplay clone or Git worktree from `origin/feature/online-game-bot-mvp`.
3. Implement and verify the scoring port/adapter boundary.
4. Add independent score-engine typecheck and test commands.
5. Add and verify the gameplay-only frontend build artifact.
6. Create a dedicated gameplay Supabase migration workspace with no score-sheet persistence objects.
7. Run complete repository CI plus the independent score-engine and gameplay build gates.
8. Record the existing score-calculator UAT protection baseline.
9. Create and link the new Supabase project `estimation-gameplay-uat` from the dedicated gameplay checkout.
10. Verify project identity and run the migration dry-run.
11. Apply the gameplay-only migrations after review.
12. Deploy authenticated gameplay Edge Functions.
13. Create separate gameplay Auth users and the fixed gameplay workspace.
14. Create and link the separate Vercel project `estimation-gameplay-uat`.
15. Configure browser-safe gameplay variables and deploy the gameplay artifact.
16. Complete a solo-versus-three-bots Start-to-score round.
17. Complete two-browser privacy, Realtime, timer, takeover, reclaim, pause/resume, and termination UAT.
18. Repeat the score-calculator UAT protection checks.

## Failure and rollback handling

Deployment stops on:

- wrong checkout path, branch, or SHA;
- wrong Supabase project name or reference;
- the prohibited score-calculator UAT reference;
- destructive or score-calculator-specific migration output;
- wrong Vercel project identity;
- score-engine behavior changes;
- failed independent score-engine tests;
- failed gameplay build or repository CI;
- private credentials or hidden gameplay data in logs.

Rollback actions may target only the dedicated gameplay resources:

- disable or remove the gameplay Vercel deployment;
- roll back with a new forward migration in the gameplay project;
- restore or recreate the gameplay UAT project only when appropriate for non-production UAT data;
- never edit, reset, migrate, restore, or delete the score-calculator UAT project as part of gameplay rollback.

## Acceptance criteria

The design is satisfied only when:

- the existing score-calculator UAT branch, URL, Supabase project, data, users, local project links, and build artifact remain unchanged;
- the score engine passes its dedicated standalone typecheck and test command;
- gameplay calls scoring through the approved port and adapter without duplicating formulas;
- the gameplay Vercel artifact contains gameplay routes and excludes score-sheet application routes;
- the gameplay Supabase project contains shared identity/workspace primitives and gameplay objects, but no score-sheet persistence objects or score-calculator RPCs;
- gameplay runs from a separate URL, Vercel project, Supabase project, Auth tenant, workspace, and local deployment checkout;
- one hosted Start-to-score round succeeds using the standalone score engine;
- two-browser privacy, Realtime, timers, takeover, reclaim, pause/resume, and termination checks pass;
- the before/after score-calculator UAT protection evidence matches;
- project IDs, deployment URLs, commit SHAs, UTC times, and pass/fail evidence are recorded without credentials, private hands, seeds, nonces, or deck order.

## Out of scope

This isolation work does not:

- merge PR #14 into `main`;
- modify existing score formulas or scoring rules;
- migrate or copy score-calculator UAT data into gameplay UAT;
- combine the two UAT deployments after testing;
- make gameplay production-ready beyond the agreed MVP and UAT gates.
