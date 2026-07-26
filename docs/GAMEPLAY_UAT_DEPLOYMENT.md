# Online Gameplay MVP UAT Deployment Runbook

This runbook deploys `feature/online-game-bot-mvp` to an isolated Supabase-backed Vercel Preview for gameplay testing. It does not merge or deploy `main`. **Do not merge** PR #14 as part of this procedure.

## 1. Verify the source branch

Use Node.js 22 or later from the repository root.

```powershell
git fetch origin
git switch feature/online-game-bot-mvp
git pull --ff-only

git status --short --branch
npm ci
npm run ci
```

Record the tested commit SHA:

```powershell
git rev-parse HEAD
```

Stop if the branch is wrong, the working tree is not clean, or `npm run ci` fails.

## 2. Link a dedicated Supabase UAT project

Create or select a dedicated non-production Supabase project. Keep the database password in a password manager and enter it only through trusted interactive prompts.

```powershell
npx supabase login
npx supabase link --project-ref <SUPABASE_PROJECT_REF>
```

Do not place passwords, tokens, keys, project secrets, or database credentials in source control, command arguments, screenshots, issue comments, or chat.

## 3. Review and apply migrations

Run the migration preview first:

```powershell
npx supabase db push --dry-run
```

Confirm this exact one-way order:

1. `202607230001_online_uat_schema.sql`
2. `202607230002_online_uat_rls.sql`
3. `202607230003_online_uat_rpc.sql`
4. `202607230004_fix_rpc_column_ambiguity.sql`
5. `202607250004_gameplay_tables.sql`
6. `202607250005_gameplay_tables_rls.sql`
7. `202607250006_gameplay_table_rpc.sql`
8. `202607250007_active_game_control.sql`
9. `202607250008_active_game_control_rpc.sql`
10. `202607260009_gameplay_round_state.sql`
11. `202607260010_gameplay_round_rpc.sql`

Do not edit a migration already recorded by Supabase. Add a later timestamped migration for every correction.

Apply only after the dry-run is understood:

```powershell
npx supabase db push
```

Confirm the applied timestamps in `supabase_migrations.schema_migrations` before continuing.

## 4. Deploy the authenticated gameplay functions

Both functions are configured with JWT verification and must be deployed after the database objects exist.

```powershell
npx supabase functions deploy gameplay-start
npx supabase functions deploy gameplay-round-command
```

Do not use a no-JWT deployment option. The platform-provided server environment is used inside the functions; no privileged server credential belongs in a browser variable or Vercel setting.

Review function logs after the first invocation and confirm that logs do not contain authorization headers, private hands, seeds, nonces, deck order, passwords, or keys.

## 5. Create UAT accounts and workspace membership

Public registration remains disabled.

1. Create the host and second tester under **Supabase Authentication > Users**.
2. Use unique temporary passwords managed outside the repository.
3. Confirm each Auth user has a profile and membership in workspace `estimation-uat`.
4. Give the host `admin` or `tester` access and the second user `tester` access.
5. Create one additional Auth user without workspace membership for the negative-access check.

Use the idempotent profile/workspace/membership procedure in `docs/UAT_DEPLOYMENT.md`. Do not run an Auth administration operation from the browser.

## 6. Configure Vercel Preview variables

Link the Vercel project interactively:

```powershell
npx vercel login
npx vercel link
```

Add only the client-safe values through Vercel's hidden prompts:

```powershell
npx vercel env add VITE_SUPABASE_URL preview
npx vercel env add VITE_SUPABASE_ANON_KEY preview
npx vercel env add VITE_UAT_WORKSPACE_SLUG preview
```

Use `estimation-uat` for `VITE_UAT_WORKSPACE_SLUG`. Never create a `VITE_` variable for a database password, server secret, or privileged server key.

## 7. Deploy the gameplay branch preview

Confirm the branch and SHA again:

```powershell
git branch --show-current
git rev-parse HEAD
npx vercel deploy
```

The branch must be `feature/online-game-bot-mvp`. Record the HTTPS Preview URL returned by Vercel. Configure Preview access so the named testers can open it without exposing the deployment publicly beyond the intended UAT group.

Add the Preview origin under Supabase **Authentication > URL Configuration** as the Site URL or an allowed Redirect URL as appropriate. Keep public sign-up disabled.

## 8. Database and access smoke checks

Before playing:

1. Sign in as the host and confirm the gameplay lobby loads.
2. Sign in as the second assigned tester in a separate browser profile.
3. Confirm the unassigned Auth user is rejected because they have no workspace membership.
4. Create and reopen a private table.
5. Create and reopen a public table using open join.
6. Create and reopen a public table using approval-required joining.
7. Confirm a user from another workspace cannot read the table or active round.

Record pass/fail evidence without including private response payloads.

## 9. Required solo-versus-three-bots smoke test

Use the host account in one clean browser profile.

1. Create a private House Rules V1 table.
2. Leave three seats vacant.
3. Press **Start Game**.
4. Confirm three clearly labelled Standard bots fill the vacancies.
5. Confirm the host sees exactly thirteen cards and never sees another hand.
6. Record the public deal commitment; confirm no seed or nonce appears during play.
7. Complete all four estimates and confirm the total cannot equal 13.
8. Confirm a bot first bidder acts without waiting for a human timeout.
9. Play through all 52 card actions and confirm follow-suit enforcement.
10. Confirm thirteen completed tricks and a scored round are displayed.
11. Reload during bidding and card play; confirm the authoritative state and own hand recover.
12. Confirm duplicate clicks or a retried request do not create a second deal, estimate, card action, or turn.

A solo test passes only after one complete Start-to-score round succeeds on the hosted environment.

## 10. Required multi-browser gameplay UAT

Use the host account in one browser profile and the second tester in a second browser profile.

1. Join the same public table and verify seat updates synchronize.
2. Start with two humans and two permanent bots.
3. Submit an estimate in one browser and confirm the second browser updates without manual refresh.
4. Play a card and confirm the public trick updates in both browsers while each browser retains only its own hand.
5. Allow one connected human timer to expire; confirm exactly one bot action occurs and human control returns on the next turn.
6. Disconnect the second browser and confirm the grace countdown begins.
7. Wait through the configured grace period and confirm temporary bot takeover.
8. Reconnect and confirm reclaim occurs at the next safe action boundary without cancelling an already committed bot action.
9. As host, pause and confirm turn and grace timers freeze; resume and confirm the stored durations continue.
10. Disconnect the host and confirm host privileges transfer to the longest-connected human while seat takeover follows its separate rule.
11. Confirm the active host cannot edit bids, cards, hands, scores, or timers.
12. Confirmed termination must stop new actions, retain unfinished history, and mark the game terminated rather than completed.

Repeat one scenario with approval-required joining and confirm the host must accept the request before the seat is assigned.

## 11. Evidence and defect recording

For every run record:

- Preview URL;
- commit SHA;
- Supabase project ref or neutral environment label;
- browser names/profiles and account roles;
- UTC start and finish time;
- table ID and test scenario;
- pass/fail result;
- public error text and relevant server log timestamp;
- screenshots that contain no private hand except the tester's own hand.

**Do not record passwords, tokens, keys, or database credentials.** Do not copy authorization headers, private seeds, nonces, full deck order, or other players' hands into a defect.

## 12. Release decision

Do not share the gameplay UAT link as ready until:

- migrations apply cleanly;
- both functions deploy and authenticate correctly;
- the solo-versus-three-bots Start-to-score round passes;
- two-browser Realtime and privacy checks pass;
- no critical or high-severity security, state-corruption, duplicate-action, or hidden-information defect remains open.

The Preview remains a UAT environment. This runbook does not authorize merging PR #14 or deploying to production.
