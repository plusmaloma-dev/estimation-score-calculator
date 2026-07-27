# Gameplay UAT Vercel Deployment Correction Design

## Decision

The dedicated Vercel project `estimation-gameplay-uat` will be treated as an UAT-only hosting boundary even when Vercel labels its canonical deployment environment as `Production`. This does not change the product environment classification: the project, domain, Supabase backend, Auth users, and workspace remain dedicated to UAT and separate from `estimation-score-calculator`.

## Problem

Two deployment attempts exposed three unsafe assumptions:

1. The repository root `vercel.json` overrode the intended gameplay build and caused `npm run build` / `dist-app` to be used.
2. `vercel env run --environment preview` loaded `.env.local`, so the gameplay bundle did not receive the required UAT browser variables.
3. Vercel assigned the first deployment in the empty project to its canonical environment despite `--target=preview`.

The previous deployments were removed. No further direct `vercel deploy` command may be used from the repository root.

## Corrected Architecture

A single guarded Node wrapper will own the complete gameplay Vercel deployment flow.

### Inputs

The wrapper accepts:

- `--expected-sha <40-hex-sha>`
- `--supabase-url https://stedjwppoanbmhxsfhcg.supabase.co`
- `--workspace-slug estimation-gameplay-uat`
- the browser-safe publishable/anon key through a hidden local environment variable named `GAMEPLAY_UAT_PUBLISHABLE_KEY`

The publishable key must never be written to logs, committed files, CLI arguments, or evidence artifacts.

### Guarding

Before any build or deployment, the wrapper must:

- invoke `gameplay-target-guard.mjs vercel --expected-sha ...`;
- require checkout directory `estimation-gameplay-uat`;
- require branch `feature/online-game-bot-mvp`;
- require exact tested SHA and clean checkout;
- require linked Vercel project name `estimation-gameplay-uat`;
- reject the score-calculator Supabase ref `lexewcehptnmikwfizhj`;
- reject missing, empty, or unexpected deployment inputs.

### Build

The wrapper spawns `npm run build:gameplay` with an explicit child-process environment containing only the current process environment plus:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_UAT_WORKSPACE_SLUG`

It must not depend on `.env.local`, `.vercel/.env.*`, or Vercel environment injection.

### Isolated Deployment Workspace

The wrapper creates an ignored `vercel-gameplay-deploy/` directory containing only:

- `.vercel/project.json`, copied from the verified gameplay checkout link metadata;
- `.vercel/output/static/`, copied from `dist-gameplay`;
- `.vercel/output/config.json`, using Build Output API version 3 and SPA fallback routing.

The workspace must not contain:

- repository source files;
- root `vercel.json`;
- `dist-app`;
- `.env.local` or `.vercel/.env.*`;
- database passwords, service-role keys, secret keys, OIDC tokens, access tokens, private hands, seeds, nonces, or deck order.

### Validation

Before deployment, the wrapper must verify:

- `dist-gameplay/index.html` and at least one JavaScript asset exist;
- the bundle contains the expected Supabase URL and workspace slug;
- the bundle does not contain the exact value of any prohibited secret supplied through the environment;
- the staged workspace contains only the allow-listed paths;
- `config.json` has `version: 3` and filesystem-first SPA routing;
- the original checkout is still clean and still passes the target guard.

Validation output may print only booleans, file counts, project names, branch, and SHA. It must not print environment-variable values or bundle contents.

### Deployment

The wrapper deploys from `vercel-gameplay-deploy/` with:

- `vercel deploy --prebuilt --prod`
- explicit Vercel scope `plusmaloma-6068s-projects`
- Windows-safe `cmd.exe /d /s /c npx.cmd ...` launching and direct `npx` on non-Windows platforms.

Using `--prod` is intentional because the entire Vercel project is UAT-only. The canonical URL `estimation-gameplay-uat.vercel.app` is therefore the UAT URL, not the score-calculator production environment.

## Error Handling

The wrapper is fail-closed. Every subprocess error, non-zero exit, invalid input, missing artifact, forbidden staged path, failed content check, or guard failure stops the process before deployment. No later command may run after a failed condition.

## Tests

TDD coverage must prove:

1. wrong project, branch, SHA, or dirty checkout aborts;
2. missing or invalid public inputs abort;
3. missing hidden publishable key aborts;
4. build receives the three required `VITE_` values without reading `.env.local`;
5. staging excludes root `vercel.json`, `dist-app`, source files, and env files;
6. missing expected URL or workspace slug aborts;
7. exact prohibited secret values abort without logging the value;
8. Windows launches `npx.cmd` through `cmd.exe`;
9. dry-run mode shows the final command without contacting Vercel;
10. the existing package and isolation CI suites remain green.

## Operational Sequence

1. Implement and test the guarded wrapper.
2. Commit and push the correction.
3. Wait for both package and isolation CI checks to pass on the exact SHA.
4. Pull the exact tested SHA into `C:\Users\rjamm\estimation-gameplay-uat`.
5. Set `GAMEPLAY_UAT_PUBLISHABLE_KEY` locally through a hidden prompt.
6. Run the wrapper once in dry-run mode.
7. Run the wrapper once for the canonical UAT deployment.
8. Perform hosted host/tester/non-member UAT.
9. Capture non-secret deployment evidence and verify score-UAT remains unchanged.

## Non-Goals

- No change to the existing score-calculator Vercel project or URL.
- No merge of draft PR #14.
- No use of service-role credentials in browser code.
- No reliance on Vercel Preview variables for the local gameplay build.
- No direct deployment from the repository root.
