# Online Gameplay MVP — Fully Isolated UAT Deployment

This runbook deploys `feature/online-game-bot-mvp` as a gameplay-only UAT application using dedicated Supabase and Vercel projects named `estimation-gameplay-uat`.

It must not change the existing score-calculator UAT branch, Supabase project, Vercel project, URL, users, data, or deployment artifact. PR #14 remains draft and unmerged throughout deployment and UAT.

## Non-negotiable targets

| Resource | Existing score-calculator UAT | Gameplay UAT |
|---|---|---|
| Git branch | `feature/react-vite-frontend-prototype` | `feature/online-game-bot-mvp` |
| Local checkout | Existing score checkout | `C:\Users\rjamm\estimation-gameplay-uat` |
| Supabase project | `estimation-score-calculator-uat` | `estimation-gameplay-uat` |
| Supabase reference | `lexewcehptnmikwfizhj` — prohibited | `stedjwppoanbmhxsfhcg` |
| Vercel project | `estimation-score-calculator` | `estimation-gameplay-uat` |
| Browser artifact | Existing score calculator | `dist-gameplay` only |
| Workspace slug | Existing score workspace | `estimation-gameplay-uat` |
| UAT URL | Existing score UAT URL | `https://estimation-gameplay-uat.vercel.app` |

Never run a gameplay Supabase or Vercel write from the score checkout. Never record passwords, tokens, private keys, service-role credentials, database credentials, private hands, seeds, nonces, or deck order.

---

## 1. Verify the dedicated gameplay checkout

Run only from:

```powershell
Set-Location C:\Users\rjamm\estimation-gameplay-uat
```

Verify the branch and remote state:

```powershell
git fetch origin

git branch --show-current
git rev-parse HEAD
git rev-parse origin/feature/online-game-bot-mvp
git status --short
```

Required:

- branch is `feature/online-game-bot-mvp`;
- local HEAD equals the intended remote commit;
- checkout is clean;
- `.vercel/project.json` belongs to `estimation-gameplay-uat`;
- `supabase-gameplay/supabase/.temp/project-ref` contains `stedjwppoanbmhxsfhcg`.

Do not copy `.vercel`, `.env*`, Supabase metadata, or credentials from the score checkout.

## 2. Validate and record the exact deployment commit

```powershell
npm ci
npm run ci
npm run ci:isolation

if ($LASTEXITCODE -ne 0) {
  throw 'Repository validation failed. Stop.'
}

$testedSha = git rev-parse HEAD
Write-Host "Tested SHA:" $testedSha
```

Both GitHub Actions steps must also pass on that exact SHA:

```text
Validate package: success
Validate isolation boundaries: success
```

Do not deploy a newer commit, a dirty checkout, or a SHA with pending or failed checks.

## 3. Preserve the existing score-UAT baseline

The before-state evidence must already confirm:

- score-UAT branch SHA;
- Supabase project/reference `estimation-score-calculator-uat` / `lexewcehptnmikwfizhj`;
- existing score Vercel project and URL;
- successful sign-in;
- successful opening of a saved score sheet;
- practical non-sensitive counts where available.

Write only non-secret evidence under ignored `deployment-evidence/`:

```powershell
node scripts/isolation/score-uat-baseline.mjs before `
  --uat-branch-sha (git rev-parse origin/feature/react-vite-frontend-prototype) `
  --vercel-project 'estimation-score-calculator' `
  --uat-url 'https://estimation-score-calculator-uat.vercel.app/' `
  --sign-in pass `
  --open-score-sheet pass `
  --counts-json '{}'
```

Do not rerun this if the verified before-state evidence already exists and matches the protected score-UAT state.

## 4. Verify the isolated Supabase target

```powershell
$newGameplayRef = 'stedjwppoanbmhxsfhcg'

node scripts/isolation/gameplay-target-guard.mjs `
  supabase $newGameplayRef `
  --expected-sha $testedSha

if ($LASTEXITCODE -ne 0) {
  throw 'Gameplay Supabase target guard failed. Stop.'
}
```

The guard must reject `lexewcehptnmikwfizhj` and any checkout other than the dedicated gameplay checkout.

## 5. Guarded gameplay database migration deployment

The reviewed gameplay migration inventory contains exactly these thirteen migrations:

1. `202607260001_gameplay_identity.sql`
2. `202607260002_gameplay_identity_rls.sql`
3. `202607260003_gameplay_tables.sql`
4. `202607260004_gameplay_tables_rls.sql`
5. `202607260005_gameplay_table_rpc.sql`
6. `202607260006_active_game_control.sql`
7. `202607260007_active_game_control_rpc.sql`
8. `202607260008_gameplay_round_state.sql`
9. `202607260009_gameplay_round_rpc.sql`
10. `202607280010_fix_gameplay_start_seat_number_ambiguity.sql`
11. `202607290011_active_round_next_round.sql`
12. `202608080012_fix_gameplay_round_table_id_ambiguity.sql`
13. `202608100013_contract_auction.sql`

For the hosted UAT state already containing migrations 011 and 012, the reviewed pending set is exactly migration 013. The wrapper also recognizes the explicitly reviewed historical 010 state (then pending 011, 012, and 013) and the fully applied 013 state (a no-op); every other remote migration sequence is a stop condition. The only authorized database mutation path is the guarded wrapper:

```powershell
npm run deploy:gameplay-migrations -- `
  stedjwppoanbmhxsfhcg `
  --expected-sha $testedSha
```

Do not run a direct operator database push. The wrapper runs the gameplay target guard before linked migration-state inspection and again immediately before the mutation boundary, requires the exact thirteen-file local inventory and one of the reviewed remote sequences above, uses only `supabase-gameplay`, and re-reads linked state afterward. Read-only migration-list commands are allowed for investigation; ambiguous, remote-only, out-of-order, score-sheet, or unexpected migration state is a stop condition.

For read-only inspection only, use:

```powershell
npx supabase --workdir supabase-gameplay migration list --linked
```

Migration SQL is forward-only. If an application failure occurs after a migration deployment, stop and preserve the migration state. Redeploy previously verified Function or frontend artifacts only through their guarded wrappers if needed; design any database remediation separately. Do not describe or attempt destructive automatic SQL rollback.

## 6. Verify the authenticated gameplay Functions

The dedicated project must list:

- `gameplay-start`
- `gameplay-round-command`

Both must keep JWT verification enabled. Never use `--no-verify-jwt`.

For future Function updates, use only the guarded wrapper:

```powershell
node scripts/isolation/deploy-gameplay-function.mjs `
  gameplay-start $newGameplayRef `
  --expected-sha $testedSha

node scripts/isolation/deploy-gameplay-function.mjs `
  gameplay-round-command $newGameplayRef `
  --expected-sha $testedSha
```

Do not use direct Function deployment commands from the repository root.

### Required later hosted deployment order

The later hosted deployment must proceed in this order:

1. guarded gameplay migrations;
2. guarded `gameplay-round-command` Function deployment;
3. verify that the authoritative round snapshot includes `legalAuctionActions` during auction and `legalBidOptions` during estimate;
4. guarded gameplay frontend deployment;
5. create a fresh UAT table;
6. perform authenticated UAT.

The frontend intentionally does not reconstruct auction or estimate legality when the corresponding authoritative projection is absent, so it must not precede the compatible backend projection. Preserve all previous evidence tables: do not repair, reuse, terminate, delete, or mutate failed Start evidence tables, split-state human-boundary tables, or other preserved defect evidence.

## 7. Verify the isolated Auth users and workspace

The gameplay Supabase project must contain:

- one confirmed host user;
- one confirmed assigned tester;
- one confirmed negative-access user with no membership.

The workspace `estimation-gameplay-uat` must have exactly two membership rows:

- host role `admin`;
- tester role `tester`.

The negative-access user must not appear in `workspace_memberships`.

Do not record passwords or access tokens in the repository, evidence, screenshots, or chat.

## 8. Verify the dedicated Vercel project

```powershell
npx vercel whoami

node scripts/isolation/gameplay-target-guard.mjs `
  vercel `
  --expected-sha $testedSha

if ($LASTEXITCODE -ne 0) {
  throw 'Gameplay Vercel target guard failed. Stop.'
}

npx vercel project inspect estimation-gameplay-uat `
  --scope plusmaloma-6068s-projects
```

Expected project settings:

```text
Name              estimation-gameplay-uat
Root Directory    .
Framework Preset  Vite
Build Command     npm run build:gameplay
Output Directory  dist-gameplay
Install Command   npm ci
```

The guarded deployment wrapper does not depend on the dashboard build command, but the project settings must remain gameplay-specific for clarity and future safety.

## 9. Canonical UAT environment decision

The dedicated Vercel project `estimation-gameplay-uat` is UAT-only. Vercel labels its canonical environment as Production because it owns the canonical project URL, but this does not make it the score-calculator production environment.

The only authorized gameplay UAT deployment target is:

```text
https://estimation-gameplay-uat.vercel.app
```

Do not use Vercel Preview-variable injection, `vercel env run`, direct root deployment, or the repository root `vercel.json` for gameplay UAT.

## 10. Run one guarded dry-run

The wrapper reads the browser-safe publishable/anon key only from `GAMEPLAY_UAT_PUBLISHABLE_KEY`. Set it through a hidden prompt and never print it:

```powershell
$secureKey = Read-Host 'Gameplay Supabase publishable key' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:GAMEPLAY_UAT_PUBLISHABLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  Remove-Variable secureKey, keyPointer -ErrorAction SilentlyContinue
}

try {
  npm run deploy:gameplay-vercel -- `
    --expected-sha $testedSha `
    --supabase-url https://stedjwppoanbmhxsfhcg.supabase.co `
    --workspace-slug estimation-gameplay-uat `
    --dry-run

  if ($LASTEXITCODE -ne 0) {
    throw 'Gameplay Vercel dry-run failed. Stop.'
  }
} finally {
  Remove-Item Env:GAMEPLAY_UAT_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
}
```

Expected non-secret output includes:

```text
Gameplay Vercel target verified: estimation-gameplay-uat
Expected Supabase URL embedded: true
Expected workspace slug embedded: true
Expected publishable key embedded: true
Prohibited secret values detected: false
Dry run complete. No Vercel deployment was started.
```

The dry-run must:

- run the target guard before and after staging;
- build only `npm run build:gameplay`;
- disable `.env*` loading through Vite `envDir: false`;
- stage only `.vercel/project.json` and `.vercel/output/**` under ignored `vercel-gameplay-deploy/`;
- reject root `vercel.json`, `dist-app`, source files, env files, and exact prohibited secret values;
- contact no Vercel deployment endpoint.

Any failed guard, build, staging, bundle, secret, or allow-list check means no deployment occurred. Stop and investigate.

## 11. Run one guarded canonical-UAT deployment

Only after the exact dry-run passes and both GitHub Actions checks are green on `$testedSha`, enter the browser-safe key again:

```powershell
$secureKey = Read-Host 'Gameplay Supabase publishable key' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:GAMEPLAY_UAT_PUBLISHABLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  Remove-Variable secureKey, keyPointer -ErrorAction SilentlyContinue
}

try {
  npm run deploy:gameplay-vercel -- `
    --expected-sha $testedSha `
    --supabase-url https://stedjwppoanbmhxsfhcg.supabase.co `
    --workspace-slug estimation-gameplay-uat

  if ($LASTEXITCODE -ne 0) {
    throw 'Gameplay Vercel deployment failed. Stop.'
  }
} finally {
  Remove-Item Env:GAMEPLAY_UAT_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
}
```

The wrapper deploys from `vercel-gameplay-deploy/` using the prebuilt Build Output API artifact and the dedicated project link. It intentionally uses `--prod` because this entire Vercel project is UAT-only.

Never run `npx vercel deploy` directly from the repository root.

## 12. Configure Supabase Auth URLs

After a successful deployment, update only the gameplay Supabase project:

**Authentication → URL Configuration**

Set or add:

```text
Site URL: https://estimation-gameplay-uat.vercel.app
Redirect URL: https://estimation-gameplay-uat.vercel.app/**
```

Do not change the score-calculator Supabase project’s Auth URLs.

## 13. Database and access smoke checks

Before playing:

1. Sign in with the host account and confirm the gameplay lobby loads.
2. Sign in as the assigned tester in a separate browser profile.
3. Confirm the negative-access user is rejected because it has no gameplay workspace membership.
4. Create and reopen a private table.
5. Create and reopen a public open-join table.
6. Create and reopen a public approval-required table.
7. Confirm another workspace cannot read gameplay tables or active rounds.

Record pass/fail evidence without credentials, private response payloads, or hidden game data.

## 14. Required solo-versus-three-bots smoke test

Use the host account in one clean browser profile.

### Preserve the failed Start table

`Solo UAT Start Retest 1` is retained as partial-commit evidence. Its table
Start and active-control initialization committed, while round-state
initialization and the first turn did not. Do not mutate, manually repair,
terminate, delete, or reuse this table for hosted retesting.

After a separately authorized deployment of the corrected `gameplay-start`
Function, create a new table for the hosted Start retest. The browser does not
retain the original Start command identity after this partial failure, and the
committed active lifecycle removes the table from the normal Start path. The
Function remains safe when the exact original request is replayed: it loads and
returns a persisted round before generating any new private deal material. This
does not authorize an arbitrary active-table repair command.

### Preserve the split-state human-boundary table

Solo UAT Bot Retest 4 is preserved as split-state evidence. Do not refresh,
repair, pause, terminate, delete, or reuse it. Human-boundary retesting must
use a new table because its round and active-control ledgers have diverged.
1. Create a private House Rules V1 table.
2. Leave three seats vacant.
3. Press **Start Game**.
4. Confirm three clearly labelled Standard bots fill the vacancies.
5. Confirm the host sees exactly thirteen cards and never sees another hand.
6. Record only the public deal commitment; confirm no seed or nonce is displayed during play.
7. Complete the contract auction: the second seat from the dealer opens; each eligible seat can Pass, raise strictly, or use a legal auction WITH; three consecutive post-contract passes resolve it. Confirm four opening passes resolve to No Trump and return the estimate turn to the dealer without a redeal.
8. Confirm the resolved caller’s contract count is their fixed estimate, only the remaining three seats estimate in a normal auction, WITH is absent from estimate options, and the total cannot equal 13.
9. Confirm a bot first auction actor acts without waiting for a human timeout.
10. Complete all 52 card actions and confirm follow-suit enforcement.
11. Confirm thirteen completed tricks and a scored round are displayed, then use Start Next Round once and confirm exactly one rotated new auction starts.
12. Reload during auction, estimate, and card play; confirm authoritative state and own hand recover without a viewport jump on routine Realtime updates.
13. Confirm duplicate clicks or retries do not create a second deal, auction action, estimate, card action, or turn.

The solo test passes only after one complete Start-to-score round succeeds on the hosted gameplay environment.

## 15. Required multi-browser gameplay UAT

Use the host account in one browser profile and the assigned tester in another.

1. Join the same public table and verify seat updates synchronize.
2. Start with two humans and two permanent bots.
3. Submit an estimate in one browser and confirm the other updates without manual refresh.
4. Play a card and confirm the public trick updates in both browsers while each retains only its own hand.
5. Allow one connected human timer to expire; confirm exactly one assistant action and human control on the next turn.
6. Disconnect the second browser and confirm disconnect grace begins.
7. Let grace expire and confirm temporary bot takeover.
8. Reconnect and confirm reclaim occurs at the next safe uncommitted boundary.
9. Pause and confirm turn and disconnect timers freeze.
10. Resume and confirm exact remaining durations are reconstructed.
11. Open termination, cancel once, then confirm terminate.
12. Confirm the partial history is preserved as read-only and excluded from formal completion statistics.

Record browser profiles, table ID, commit SHA, UTC timestamps, and pass/fail evidence without credentials or hidden game data.

## 16. Prove score-UAT remained unchanged

Repeat the protected score-UAT checks after gameplay UAT:

- branch SHA;
- Supabase project name/reference;
- Vercel project name and URL;
- successful sign-in;
- successful opening of a saved score sheet;
- the same practical non-secret counts.

Write the after-state evidence:

```powershell
node scripts/isolation/score-uat-baseline.mjs after `
  --uat-branch-sha (git rev-parse origin/feature/react-vite-frontend-prototype) `
  --vercel-project 'estimation-score-calculator' `
  --uat-url 'https://estimation-score-calculator-uat.vercel.app/' `
  --sign-in pass `
  --open-score-sheet pass `
  --counts-json '{}'
```

Compare `deployment-evidence/score-uat-before.json` and `score-uat-after.json`. Any unexplained difference fails the isolation gate.

## 17. Rollback and stop rules

- A wrapper failure before the Vercel command means no deployment occurred; do not retry blindly.
- If an incorrect artifact is ever deployed, remove only its exact unique deployment URL. Never pass the project name to `vercel remove`.
- Do not relink either Vercel project.
- Do not edit the protected score-UAT Supabase project.
- Do not bypass JWT verification.
- Do not merge PR #14 as part of deployment or UAT.

## 18. Final evidence

Record only:

- gameplay Supabase project name and non-secret reference;
- gameplay Vercel project name and canonical UAT URL;
- deployed commit SHA;
- deployment time in UTC;
- host/tester/non-member access results;
- solo and multi-browser UAT results;
- score-UAT before/after protection result;
- remaining product gaps.

At the deployed SHA, rerun:

```powershell
npm ci
npm run ci
npm run ci:isolation
git status --short
```

PR #14 must remain open, draft, and unmerged until explicit merge approval is given.
