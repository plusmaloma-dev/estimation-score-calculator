# Gameplay UAT Vercel Deployment Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one fail-closed, test-covered deployment command that builds only the gameplay client with explicit browser-safe UAT values, stages only the Vercel Build Output API artifact, and intentionally deploys it to the canonical URL of the dedicated `estimation-gameplay-uat` project.

**Architecture:** A small pure helper module owns argument validation, artifact validation, allow-list checks, and command construction. A single CLI wrapper invokes the existing target guard, runs `npm run build:gameplay` with explicit `VITE_` values, stages `dist-gameplay` into ignored `vercel-gameplay-deploy/`, validates the staged artifact, re-runs the guard, and launches `vercel deploy --prebuilt --prod` from the staging directory. Gameplay Vite configuration disables `.env*` loading so the wrapper-provided process environment is the only build input.

**Tech Stack:** Node.js 24 ESM, TypeScript 5.5 tests, Node test runner, Vite 7, Vercel CLI, Windows PowerShell, GitHub Actions.

## Global Constraints

- Work only in `C:\Users\rjamm\estimation-gameplay-uat` on `feature/online-game-bot-mvp`.
- Keep PR #14 draft, open, and unmerged.
- Never modify or relink the existing Vercel project `estimation-score-calculator`.
- Never target Supabase ref `lexewcehptnmikwfizhj`; gameplay ref is `stedjwppoanbmhxsfhcg`.
- Linked Vercel project must be `estimation-gameplay-uat` under scope `plusmaloma-6068s-projects`.
- The canonical URL `estimation-gameplay-uat.vercel.app` is UAT-only even though Vercel labels the deployment environment Production.
- Build command must be exactly `npm run build:gameplay`; deployable output must come only from `dist-gameplay`.
- The publishable/anon key is supplied only through `GAMEPLAY_UAT_PUBLISHABLE_KEY`; never print it, pass it as a CLI argument, commit it, or write it to evidence.
- No service-role key, database password, secret key, OIDC token, access token, private hand, seed, nonce, or deck order may enter the browser bundle or staged workspace.
- No direct `vercel deploy` command may run from the repository root.

---

## File Structure

- Create `scripts/isolation/gameplay-vercel-deployment-lib.mjs`: pure validation, staging, bundle inspection, and command-construction helpers.
- Create `scripts/isolation/deploy-gameplay-vercel.mjs`: fail-closed CLI orchestration only.
- Create `tests/gameplayVercelDeployment.test.ts`: regression tests for inputs, environment isolation, staged paths, content checks, Windows launch, and dry-run behavior.
- Modify `vite.gameplay.config.ts`: set `envFile: false` so `.env.local` cannot override wrapper-provided variables.
- Modify `package.json`: expose `deploy:gameplay-vercel`, add the focused test to `test:isolation-static`, and preserve existing CI commands.
- Modify `.gitignore`: ignore `vercel-gameplay-deploy/`.
- Modify `docs/GAMEPLAY_UAT_DEPLOYMENT.md`: replace the failed Preview procedure with the tested canonical-UAT wrapper procedure.

---

### Task 1: Add RED deployment-correction regressions

**Files:**
- Create: `tests/gameplayVercelDeployment.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: future exports from `scripts/isolation/gameplay-vercel-deployment-lib.mjs`.
- Produces: focused failing tests that define the wrapper contract.

- [ ] **Step 1: Write failing tests**

Add tests that dynamically import the helper module from `process.cwd()` and assert:

1. exact valid inputs are accepted;
2. missing key, wrong URL, wrong slug, malformed SHA, and score-project URL/ref markers are rejected;
3. build environment sets exactly `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_UAT_WORKSPACE_SLUG` from explicit inputs;
4. staged workspace contains only `.vercel/project.json`, `.vercel/output/config.json`, and `.vercel/output/static/**`;
5. root `vercel.json`, `dist-app`, source files, `.env.local`, and `.vercel/.env.*` are rejected;
6. bundle must contain the expected URL, slug, and publishable key;
7. a bundle containing an exact prohibited secret value is rejected without including that value in the thrown message;
8. Windows `npx.cmd` launch uses `cmd.exe /d /s /c`;
9. dry-run command is `vercel deploy --prebuilt --prod --scope plusmaloma-6068s-projects --logs` and does not execute a subprocess.

- [ ] **Step 2: Add the focused test to isolation CI**

Append `dist/tests/gameplayVercelDeployment.test.js` to `test:isolation-static` after TypeScript compilation.

- [ ] **Step 3: Commit RED**

Commit message:

```text
test: define guarded gameplay Vercel deployment
```

- [ ] **Step 4: Verify RED in CI**

Expected: isolation CI fails because `gameplay-vercel-deployment-lib.mjs` and the wrapper do not yet exist. Package CI may remain green.

---

### Task 2: Implement pure deployment helpers

**Files:**
- Create: `scripts/isolation/gameplay-vercel-deployment-lib.mjs`
- Modify: `tests/gameplayVercelDeployment.test.ts` only when a test needs a compile-safe import shape, not to weaken requirements.

**Interfaces:**
- Produces:
  - `parseDeploymentOptions(argv, env)`
  - `createGameplayBuildEnv(baseEnv, options)`
  - `createBuildOutputConfig()`
  - `stageGameplayDeployment({ checkoutRoot, stagingRoot })`
  - `validateStagedPaths(stagingRoot)`
  - `validateGameplayBundle({ stagingRoot, options, environment })`
  - `createNpxLaunch(platform, args, comspec)`
  - `createVercelDeployArgs()`

- [ ] **Step 1: Implement exact input validation**

Require:

```text
--expected-sha <40 hex>
--supabase-url https://stedjwppoanbmhxsfhcg.supabase.co
--workspace-slug estimation-gameplay-uat
GAMEPLAY_UAT_PUBLISHABLE_KEY=<non-empty browser-safe value>
```

Accept optional `--dry-run`. Reject unknown arguments and prohibited score-project markers.

- [ ] **Step 2: Implement explicit build environment creation**

Return the current environment plus exactly the three required `VITE_` assignments. Do not read files or print values.

- [ ] **Step 3: Implement deterministic staging**

Delete and recreate `vercel-gameplay-deploy/`. Copy only:

```text
.vercel/project.json
.vercel/output/static/** from dist-gameplay/**
.vercel/output/config.json
```

The config must be:

```json
{
  "version": 3,
  "routes": [
    { "handle": "filesystem" },
    { "src": "/.*", "dest": "/index.html" }
  ]
}
```

- [ ] **Step 4: Implement content and path validation**

Require `index.html` and at least one `.js` asset. Read JavaScript assets only in memory. Check expected URL, slug, and publishable key. Inspect exact values of prohibited secret environment names and fail without echoing names or values when a match occurs. Recursively reject every path outside the allow-list.

- [ ] **Step 5: Implement cross-platform launch construction**

Windows result must launch `process.env.ComSpec ?? 'cmd.exe'` with `['/d','/s','/c','npx.cmd', ...args]`; other platforms launch `npx` directly.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayVercelDeployment.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit helpers**

Commit message:

```text
feat: add gameplay Vercel deployment guards
```

---

### Task 3: Add the fail-closed deployment wrapper

**Files:**
- Create: `scripts/isolation/deploy-gameplay-vercel.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes all Task 2 helper exports and existing `scripts/isolation/gameplay-target-guard.mjs`.
- Produces package command `npm run deploy:gameplay-vercel -- ...`.

- [ ] **Step 1: Implement orchestration in this exact order**

1. parse and validate options;
2. run target guard from repository root;
3. run `npm run build:gameplay` with explicit child environment;
4. stage the isolated workspace;
5. validate paths, config, bundle content, and linked project metadata;
6. run target guard again from repository root;
7. in dry-run mode, print only project name, branch/SHA confirmation, file counts, boolean checks, and the redacted final command;
8. otherwise run Vercel from `vercel-gameplay-deploy/` with `deploy --prebuilt --prod --scope plusmaloma-6068s-projects --logs`.

Every non-zero subprocess status or thrown validation error must exit before the next step.

- [ ] **Step 2: Add package and ignore entries**

Add:

```json
"deploy:gameplay-vercel": "node scripts/isolation/deploy-gameplay-vercel.mjs"
```

Add exactly:

```text
vercel-gameplay-deploy/
```

to `.gitignore`.

- [ ] **Step 3: Verify dry-run testability**

The wrapper must support dependency-free dry-run without contacting Vercel after build and validation. No key or bundle contents may be printed.

- [ ] **Step 4: Commit wrapper**

Commit message:

```text
feat: deploy gameplay UAT through isolated Vercel output
```

---

### Task 4: Disable Vite env-file loading and strengthen regression coverage

**Files:**
- Modify: `vite.gameplay.config.ts`
- Modify: `tests/gameplayVercelDeployment.test.ts`

**Interfaces:**
- Produces a gameplay build that accepts only process-environment variables supplied by the wrapper.

- [ ] **Step 1: Add the regression assertion**

Assert the gameplay Vite configuration includes `envFile: false`.

- [ ] **Step 2: Implement the configuration change**

Add `envFile: false` at the top level of `defineConfig` without changing root, plugins, or `dist-gameplay` output.

- [ ] **Step 3: Run focused and gameplay boundary tests**

```powershell
npm run test:gameplay-boundary
npm run test:isolation-static
```

Expected: PASS.

- [ ] **Step 4: Commit env isolation**

Commit message:

```text
fix: isolate gameplay build environment
```

---

### Task 5: Update deployment runbook

**Files:**
- Modify: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`

**Interfaces:**
- Produces the operator sequence used after exact-SHA CI passes.

- [ ] **Step 1: Remove the failed Preview deployment instructions**

Remove reliance on `vercel env run`, direct root deployment, `vercel build --local-config`, and Preview-first behavior.

- [ ] **Step 2: Document canonical UAT deployment**

Document that the dedicated project’s Production label is intentionally UAT-only. Add hidden PowerShell key capture:

```powershell
$secureKey = Read-Host 'Gameplay publishable key' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:GAMEPLAY_UAT_PUBLISHABLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
```

Document dry-run and live commands using the exact tested SHA, URL, and slug. Document clearing the process variable immediately afterward.

- [ ] **Step 3: Preserve hosted smoke tests**

Keep host, tester, non-member, solo-versus-bots, and multi-browser UAT steps unchanged except for the corrected URL terminology.

- [ ] **Step 4: Commit documentation**

Commit message:

```text
docs: correct gameplay UAT Vercel rollout
```

---

### Task 6: Full verification and release gate

**Files:**
- No new production files unless verification finds a defect.

- [ ] **Step 1: Run full local validation**

```powershell
npm run ci
npm run ci:isolation
```

Expected: all typechecks, engine tests, UI tests, score-engine tests, gameplay-boundary tests, deployment tests, and both builds pass.

- [ ] **Step 2: Verify forbidden content and clean checkout**

```powershell
git status --short
git grep -n "GAMEPLAY_UAT_PUBLISHABLE_KEY=" -- . ':!docs/superpowers/plans/*'
git grep -n "--no-verify-jwt" -- .
```

Expected: clean checkout after commits; no committed key value; no JWT bypass.

- [ ] **Step 3: Push and wait for exact-SHA CI**

Both `Validate package` and `Validate isolation boundaries` must pass on the exact head SHA. PR #14 must remain draft and unmerged.

- [ ] **Step 4: Pull exact tested SHA into the gameplay checkout**

Run the target guard before any deployment activity.

- [ ] **Step 5: Execute one dry-run**

Set the hidden key locally and run:

```powershell
npm run deploy:gameplay-vercel -- `
  --expected-sha <TESTED_SHA> `
  --supabase-url https://stedjwppoanbmhxsfhcg.supabase.co `
  --workspace-slug estimation-gameplay-uat `
  --dry-run
```

Expected: successful build, staging, and validation; no Vercel deployment.

- [ ] **Step 6: Execute one live canonical-UAT deployment**

Run the same command without `--dry-run`, then clear `GAMEPLAY_UAT_PUBLISHABLE_KEY` from the process.

- [ ] **Step 7: Perform hosted UAT and isolation proof**

Verify host/tester/non-member access, complete one solo Start-to-score round, execute the required two-browser checks, capture non-secret evidence, and record the score-UAT after-state with no unexplained change.
