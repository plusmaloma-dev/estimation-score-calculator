# Online Gameplay MVP — Fully Isolated UAT Deployment

This runbook deploys `feature/online-game-bot-mvp` as a gameplay-only application using a new Supabase project and a new Vercel project, both named `estimation-gameplay-uat`.

It must not change the existing score-calculator UAT branch, Supabase project, Vercel project, URL, users, data, or deployment artifact. **Do not merge** PR #14 as part of this procedure.

## Non-negotiable targets

| Resource | Existing score-calculator UAT | New gameplay UAT |
|---|---|---|
| Git branch | `feature/react-vite-frontend-prototype` | `feature/online-game-bot-mvp` |
| Local checkout | Existing repository directory | `C:\Users\rjamm\estimation-gameplay-uat` |
| Supabase project | `estimation-score-calculator-uat` | `estimation-gameplay-uat` |
| Supabase reference | `lexewcehptnmikwfizhj` — prohibited target | New explicitly allow-listed reference |
| Vercel project | Existing score-calculator project | `estimation-gameplay-uat` |
| Browser artifact | Existing score calculator | `dist-gameplay` only |
| Workspace slug | `estimation-uat` | `estimation-gameplay-uat` |

Never run `supabase link`, a database write, an Edge Function deployment, `vercel link`, or a Vercel deployment from the score-calculator checkout.

Do not record passwords, tokens, keys, or database credentials. Do not record private hands, seeds, nonces, or deck order.

---

## 1. Preserve and repair the original checkout

Run this only from the existing directory:

```powershell
Set-Location C:\Users\rjamm\estimation-score-calculator\estimation-score-calculator

# Preserve every local modification and untracked file. Do not pop this stash yet.
git stash push --include-untracked -m "safety-before-gameplay-isolation-2026-07-26"
git fetch origin

# Preserve the known UAT point from before the accidental gameplay pull.
git branch backup/local-uat-before-gameplay-isolation b84ecf322752d3a60d0f7124ad2cf07bdacd94c0

# The current local UAT branch was accidentally fast-forwarded. Detach first,
# restore its pointer to the untouched remote branch, then check it out again.
git switch --detach origin/feature/react-vite-frontend-prototype
git branch -f feature/react-vite-frontend-prototype origin/feature/react-vite-frontend-prototype
git switch feature/react-vite-frontend-prototype

git status --short --branch
git stash list
```

Expected:

- no push occurs;
- `feature/react-vite-frontend-prototype` matches its remote branch;
- the safety stash remains present;
- the existing `.vercel` and `supabase/.temp` links stay only in this original checkout.

Stop if the remote UAT branch has moved unexpectedly or if any command proposes a push.

## 2. Create the dedicated gameplay checkout

Still from the original repository directory:

```powershell
$gameplayPath = 'C:\Users\rjamm\estimation-gameplay-uat'
if (Test-Path $gameplayPath) {
    throw "Gameplay checkout already exists: $gameplayPath"
}

git fetch origin

git show-ref --verify --quiet refs/heads/feature/online-game-bot-mvp
if ($LASTEXITCODE -eq 0) {
    git branch -f feature/online-game-bot-mvp origin/feature/online-game-bot-mvp
    git worktree add $gameplayPath feature/online-game-bot-mvp
} else {
    git worktree add -b feature/online-game-bot-mvp $gameplayPath origin/feature/online-game-bot-mvp
}

Set-Location $gameplayPath
if ((git branch --show-current) -ne 'feature/online-game-bot-mvp') {
    throw 'Wrong gameplay branch.'
}
if ((git rev-parse HEAD) -ne (git rev-parse origin/feature/online-game-bot-mvp)) {
    throw 'Gameplay checkout is not at the remote head.'
}
if (Test-Path .vercel) {
    throw 'Gameplay checkout inherited a Vercel project link.'
}
if (Test-Path supabase-gameplay\.temp) {
    throw 'Gameplay checkout inherited a Supabase project link.'
}

git status --short --branch
```

Do not copy `.vercel`, `supabase/.temp`, `.env`, or credentials from the score-calculator checkout.

## 3. Validate the exact gameplay commit

From now on, every command in this runbook runs from:

```powershell
Set-Location C:\Users\rjamm\estimation-gameplay-uat
```

Install and run every repository boundary:

```powershell
npm ci
npm run ci
npm run ci:score-engine
npm run test:gameplay-boundary
```

Record the commit that passed those commands:

```powershell
$testedSha = git rev-parse HEAD
$testedSha
```

The value must be a full 40-character commit SHA. Do not continue after any failed command or with an uncommitted change.

## 4. Record the existing score-calculator UAT baseline

Before creating or deploying gameplay resources, verify the existing score UAT manually:

1. Record the remote SHA of `origin/feature/react-vite-frontend-prototype`.
2. Confirm Supabase project `estimation-score-calculator-uat` still has reference `lexewcehptnmikwfizhj`.
3. Record the existing Vercel project name and current UAT HTTPS URL.
4. Sign in to the existing score UAT.
5. Open a saved score sheet successfully.
6. Where practical, record non-sensitive counts for existing games, rounds, and users.

Write only non-secret evidence:

```powershell
node scripts/isolation/score-uat-baseline.mjs before `
  --uat-branch-sha (git rev-parse origin/feature/react-vite-frontend-prototype) `
  --vercel-project '<EXISTING_SCORE_UAT_VERCEL_PROJECT_NAME>' `
  --uat-url 'https://<EXISTING_SCORE_UAT_URL>' `
  --sign-in pass `
  --open-score-sheet pass `
  --counts-json '{"games":0,"rounds":0}'
```

Use actual non-sensitive counts or `{}`. The output stays under ignored `deployment-evidence/`.

## 5. Create the new Supabase project

In the authenticated Supabase account, create a new non-production project named exactly:

```text
estimation-gameplay-uat
```

Use a unique database password stored in a password manager. Do not paste the password into source code, command arguments, screenshots, issue comments, or chat.

Copy only the new project reference. It must not be:

```text
lexewcehptnmikwfizhj
```

Set it in the current PowerShell session:

```powershell
$newGameplayRef = '<NEW_GAMEPLAY_PROJECT_REF>'
if ($newGameplayRef -eq 'lexewcehptnmikwfizhj') {
    throw 'The score-calculator UAT project is prohibited.'
}
```

## 6. Link and verify the isolated Supabase workspace

Link the dedicated `supabase-gameplay` work directory, not the repository's original `supabase` directory:

```powershell
npx supabase --workdir supabase-gameplay link --project-ref $newGameplayRef
node scripts/isolation/gameplay-target-guard.mjs supabase $newGameplayRef --expected-sha $testedSha
```

The guard must report both the expected gameplay branch/SHA and the allow-listed reference. Stop if it reports a missing, mismatched, or prohibited target.

Confirm the migration history contains exactly these files:

1. `202607260001_gameplay_identity.sql`
2. `202607260002_gameplay_identity_rls.sql`
3. `202607260003_gameplay_tables.sql`
4. `202607260004_gameplay_tables_rls.sql`
5. `202607260005_gameplay_table_rpc.sql`
6. `202607260006_active_game_control.sql`
7. `202607260007_active_game_control_rpc.sql`
8. `202607260008_gameplay_round_state.sql`
9. `202607260009_gameplay_round_rpc.sql`

This workspace must not create score-sheet player directories, score-sheet games, score-sheet rounds, scores, overrides, edit locks, or score-calculator RPCs.

## 7. Dry-run and apply gameplay migrations

Run the guard and migration preview:

```powershell
node scripts/isolation/gameplay-target-guard.mjs supabase $newGameplayRef --expected-sha $testedSha
npx supabase --workdir supabase-gameplay db push --dry-run
```

Review the complete output. It must show only the nine gameplay-workspace migrations above. Stop on:

- any destructive operation;
- any previously applied migration mismatch;
- any score-calculator persistence object;
- any target other than `estimation-gameplay-uat`.

After review, verify the target again and apply:

```powershell
node scripts/isolation/gameplay-target-guard.mjs supabase $newGameplayRef --expected-sha $testedSha
npx supabase --workdir supabase-gameplay db push
```

Confirm all nine timestamps under `supabase_migrations.schema_migrations` before continuing.

## 8. Deploy the authenticated gameplay Functions

Both Functions require JWT verification. Never use `--no-verify-jwt`.

Run the target guard immediately before the Function writes:

```powershell
node scripts/isolation/gameplay-target-guard.mjs supabase $newGameplayRef --expected-sha $testedSha
npx supabase --workdir supabase-gameplay functions deploy gameplay-start
npx supabase --workdir supabase-gameplay functions deploy gameplay-round-command
```

After the first invocation, review Function logs and verify they contain no authorization headers, credentials, private hands, seeds, nonces, or deck order.

## 9. Create isolated gameplay users and workspace

In the new Supabase project only:

1. Keep public email signup and anonymous sign-in disabled.
2. Create a host user and a second tester under **Authentication → Users**.
3. Enable automatic email confirmation for these UAT users.
4. Copy their Auth user UUIDs without recording passwords.
5. Create one additional Auth user without membership for the negative-access test.

Run this transaction in the new project's SQL Editor, replacing UUID placeholders:

```sql
begin;

insert into public.workspaces (slug, name)
values ('estimation-gameplay-uat', 'Estimation Gameplay UAT')
on conflict (slug) do update
set name = excluded.name;

insert into public.profiles (user_id, display_name)
values
  ('<HOST_AUTH_USER_UUID>'::uuid, 'Gameplay Host'),
  ('<TESTER_AUTH_USER_UUID>'::uuid, 'Gameplay Tester')
on conflict (user_id) do update
set display_name = excluded.display_name;

insert into public.workspace_memberships (
  workspace_id,
  user_id,
  role,
  created_by,
  updated_by
)
select workspace.id, member.user_id, member.role, member.user_id, member.user_id
from public.workspaces workspace
cross join (
  values
    ('<HOST_AUTH_USER_UUID>'::uuid, 'admin'::text),
    ('<TESTER_AUTH_USER_UUID>'::uuid, 'tester'::text)
) as member(user_id, role)
where workspace.slug = 'estimation-gameplay-uat'
on conflict (workspace_id, user_id) do update
set role = excluded.role,
    updated_by = excluded.updated_by;

commit;
```

Confirm exactly two membership rows exist for `estimation-gameplay-uat`. Do not add the negative-access user.

## 10. Create and verify the separate Vercel project

From the dedicated gameplay checkout:

```powershell
npx vercel whoami
npx vercel link --project estimation-gameplay-uat
node scripts/isolation/gameplay-target-guard.mjs vercel --expected-sha $testedSha
```

If Vercel asks whether to create a project, create `estimation-gameplay-uat`. Never select or relink the existing score-calculator project.

Inspect `.vercel/project.json`; `projectName` must equal `estimation-gameplay-uat`.

## 11. Configure browser-safe Preview variables

Obtain the URL and browser-safe publishable/anon key from the new gameplay Supabase project.

Add only these Preview values through hidden prompts:

```powershell
npx vercel env add VITE_SUPABASE_URL preview
npx vercel env add VITE_SUPABASE_ANON_KEY preview
npx vercel env add VITE_UAT_WORKSPACE_SLUG preview
```

Use:

- the new gameplay Supabase URL for `VITE_SUPABASE_URL`;
- the new project's client-safe publishable/anon key for `VITE_SUPABASE_ANON_KEY`;
- `estimation-gameplay-uat` for `VITE_UAT_WORKSPACE_SLUG`.

Never create a `VITE_` variable for a database password, service-role credential, secret key, or personal access token.

## 12. Build and deploy only the gameplay artifact

Build locally first:

```powershell
npm run build:gameplay
```

The output directory must be `dist-gameplay`. It must not expose score-sheet creation, history, editing, or score-sheet routes.

Then build and deploy the linked gameplay Vercel project:

```powershell
node scripts/isolation/gameplay-target-guard.mjs vercel --expected-sha $testedSha
npx vercel build --local-config vercel.gameplay.json
node scripts/isolation/gameplay-target-guard.mjs vercel --expected-sha $testedSha
npx vercel deploy --prebuilt --local-config vercel.gameplay.json
```

Record the returned gameplay HTTPS URL, commit SHA, and UTC deployment time.

Add the gameplay URL under the new Supabase project's **Authentication → URL Configuration**. Do not change the existing score-calculator project's authentication URLs.

## 13. Database and access smoke checks

Before playing:

1. Sign in with the host account and confirm the gameplay lobby loads.
2. Sign in as the second assigned tester in a second browser profile.
3. Confirm the unassigned Auth user is rejected because it has no gameplay workspace membership.
4. Create and reopen a private table.
5. Create and reopen a public open-join table.
6. Create and reopen a public approval-required table.
7. Confirm another workspace cannot read gameplay tables or active rounds.

Record pass/fail evidence without private response payloads.

## 14. Required solo-versus-three-bots smoke test

Use the host account in one clean browser profile.

1. Create a private House Rules V1 table.
2. Leave three seats vacant.
3. Press **Start Game**.
4. Confirm three clearly labelled Standard bots fill the vacancies.
5. Confirm the host sees exactly thirteen cards and never sees another hand.
6. Record the public deal commitment; confirm no seed or nonce is displayed during play.
7. Complete all four estimates and confirm the total cannot equal 13.
8. Confirm a bot first bidder acts without waiting for a human timeout.
9. Complete all 52 card actions and confirm follow-suit enforcement.
10. Confirm thirteen completed tricks and a scored round are displayed.
11. Reload during bidding and card play; confirm the authoritative state and own hand recover.
12. Confirm duplicate clicks or retries do not create a second deal, estimate, card action, or turn.

A solo test passes only after one complete Start-to-score round succeeds on the hosted gameplay environment.

## 15. Required multi-browser gameplay UAT

Use the host account in one browser profile and the second tester in a second browser profile.

1. Join the same public table and verify seat updates synchronize.
2. Start with two humans and two permanent bots.
3. Submit an estimate in one browser and confirm the second browser updates without manual refresh.
4. Play a card and confirm the public trick updates in both browsers while each retains only its own hand.
5. Allow one connected human timer to expire; confirm exactly one assistant action and human control on the next turn.
6. Disconnect the second browser and confirm disconnect grace begins.
7. Let grace expire and confirm temporary bot takeover.
8. Reconnect and confirm reclaim occurs at the next safe uncommitted boundary.
9. Pause and confirm turn and disconnect timers freeze.
10. Resume and confirm exact remaining durations are reconstructed.
11. Open termination, cancel once, then confirm terminate.
12. Confirm the partial history is preserved as read-only and excluded from formal completion statistics.

Record the second browser profile, table ID, commit SHA, UTC timestamps, and pass/fail evidence without credentials or hidden game data.

## 16. Prove the score-calculator UAT was unaffected

After gameplay deployment and UAT, repeat the original score-calculator checks:

1. remote UAT branch SHA;
2. Supabase project name/reference;
3. Vercel project name and existing URL;
4. successful sign-in;
5. successful opening of a saved score sheet;
6. the same practical non-secret table counts.

Write the after evidence:

```powershell
node scripts/isolation/score-uat-baseline.mjs after `
  --uat-branch-sha (git rev-parse origin/feature/react-vite-frontend-prototype) `
  --vercel-project '<EXISTING_SCORE_UAT_VERCEL_PROJECT_NAME>' `
  --uat-url 'https://<EXISTING_SCORE_UAT_URL>' `
  --sign-in pass `
  --open-score-sheet pass `
  --counts-json '{"games":0,"rounds":0}'
```

Compare `deployment-evidence/score-uat-before.json` and `score-uat-after.json`. Any unexplained change fails the isolation gate.

## 17. Final repository verification

At the deployed commit SHA:

```powershell
npm ci
npm run ci
npm run ci:score-engine
npm run test:gameplay-boundary
```

Record:

- gameplay Supabase project name and non-secret reference;
- gameplay Vercel project name and URL;
- deployed commit SHA;
- deployment time in UTC;
- solo and multi-browser results;
- score-UAT before/after protection result;
- remaining product gaps.

PR #14 remains draft and unmerged until explicit merge approval is given.
