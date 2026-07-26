# Gameplay UAT Full-Isolation Design

**Date:** 26 July 2026  
**Status:** Approved  
**Branch:** `feature/online-game-bot-mvp`

## Objective

Deploy the online gameplay MVP for testing without changing or risking the existing score-calculator UAT environment.

The score engine remains a standalone module. The gameplay module depends on that score engine through its TypeScript service boundary, while the score engine has no dependency on gameplay, React, Supabase, Vercel, timers, cards, or bots.

## Required deployment boundary

### Existing score-calculator UAT

The following environment must remain unchanged:

- existing Supabase project `estimation-score-calculator-uat`;
- existing Vercel project and UAT URL;
- existing score-sheet database objects and data;
- existing score-calculator UAT branch `feature/react-vite-frontend-prototype`;
- existing authentication users and workspace memberships;
- standalone score-engine source and scoring behavior.

No gameplay migration, Edge Function, environment variable, preview deployment, or branch reset may target this environment.

### New gameplay UAT

Create a fully separate environment:

- Supabase project: `estimation-gameplay-uat`;
- separate Vercel project;
- separate Preview or UAT URL;
- separate Supabase migration history;
- separate Auth users and workspace membership;
- separate gameplay tables, active-control records, round state, Realtime channels, and Edge Functions;
- workspace slug `estimation-gameplay-uat` unless an environment-specific slug is required.

The gameplay UAT may use the same repository and shared score-engine source, but it must not reuse the existing score-calculator UAT database or Vercel project.

## Module dependency rule

```text
Gameplay UI and online services
            |
            v
Gameplay domain engine
            |
            v
Standalone score engine
```

The dependency is one-way:

- gameplay may call the score engine;
- the score engine may not import gameplay, online, React, Supabase, or Vercel code;
- gameplay must not duplicate score formulas;
- score-engine tests must continue to run independently from gameplay tests.

## Repository and branch safety

- `feature/react-vite-frontend-prototype` remains the score-calculator UAT branch.
- `feature/online-game-bot-mvp` remains the gameplay implementation branch.
- PR #14 remains draft and must not be merged into `main` without explicit approval.
- Local branch repair must preserve the remote UAT branch and create a separate local tracking branch for gameplay.
- Untracked or modified local files must be stashed before branch-pointer repair.

## Supabase isolation

The gameplay deployment must verify the linked project reference before every write.

Required safeguards:

1. `npx supabase projects list` must show `estimation-gameplay-uat` as linked.
2. The project reference must not equal the existing score-calculator UAT reference `lexewcehptnmikwfizhj`.
3. `npx supabase db push --dry-run` must run before any migration apply.
4. Gameplay migrations and both gameplay Edge Functions must deploy only after the project identity check passes.
5. Public registration remains disabled.
6. Service-role credentials remain server-side and never enter Vite or Vercel variables.

## Vercel isolation

The gameplay branch must be linked to a new Vercel project rather than the existing score-calculator project.

Required safeguards:

1. verify the Vercel account and active team;
2. create or link a new project named `estimation-gameplay-uat`;
3. configure only browser-safe variables for that project;
4. deploy from `feature/online-game-bot-mvp`;
5. record the resulting gameplay URL and tested commit SHA;
6. verify that the existing score-calculator UAT URL still serves the unchanged score-calculator deployment.

## Environment variables

Gameplay Vercel variables:

- `VITE_SUPABASE_URL` for the new gameplay Supabase project;
- `VITE_SUPABASE_ANON_KEY` for the new gameplay Supabase project;
- `VITE_UAT_WORKSPACE_SLUG=estimation-gameplay-uat`.

No database password, service-role key, private server key, or personal token may use a `VITE_` prefix or be stored in the repository.

## Deployment flow

1. Repair local branch pointers without pushing.
2. Check out a clean local `feature/online-game-bot-mvp` tracking branch.
3. Run `npm ci` and `npm run ci`.
4. Create the separate Supabase project manually in the authenticated Supabase account.
5. Link the local checkout to the new gameplay project.
6. verify project name and reference.
7. Run migration dry-run, review it, then apply.
8. Deploy `gameplay-start` and `gameplay-round-command` with JWT verification.
9. Create separate gameplay UAT users and workspace memberships.
10. Create or link the separate Vercel project and configure its variables.
11. Deploy the gameplay branch.
12. Run solo-versus-three-bots and two-browser UAT.
13. Recheck the original score-calculator UAT URL and database access.

## Failure handling

- Any project-name or project-reference mismatch stops deployment.
- Any migration dry-run that includes destructive changes stops deployment.
- Any CI failure stops deployment.
- Any Vercel project mismatch stops deployment.
- No rollback may target the score-calculator UAT project.
- Gameplay rollback consists of removing or recreating the dedicated gameplay UAT project and deployment only.

## Acceptance criteria

The design is satisfied when:

- the score-calculator UAT branch, URL, Supabase project, data, and users are unchanged;
- gameplay runs from a separate URL and separate Supabase project;
- gameplay completes one hosted Start-to-score round using the shared standalone score engine;
- two-browser privacy, Realtime, timers, takeover, reclaim, pause/resume, and termination checks pass;
- no score-engine source change is required for deployment;
- project IDs, deployment URLs, commit SHAs, UTC times, and pass/fail evidence are recorded without credentials or private hands.
