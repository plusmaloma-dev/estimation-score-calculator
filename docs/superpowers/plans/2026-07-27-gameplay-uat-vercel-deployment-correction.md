# Gameplay UAT Vercel Deployment Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one fail-closed, test-covered deployment command that builds only the gameplay client with explicit browser-safe UAT values, stages only the Vercel Build Output API artifact, and intentionally deploys it to the canonical URL of the dedicated `estimation-gameplay-uat` project.

**Architecture:** A small pure helper module owns argument validation, artifact validation, allow-list checks, and command construction. A single CLI wrapper invokes the existing target guard, runs `npm run build:gameplay` with explicit `VITE_` values, stages `dist-gameplay` into ignored `vercel-gameplay-deploy/`, validates the staged artifact, re-runs the guard, and launches `vercel deploy --prebuilt --prod` from the staging directory. Gameplay Vite configuration disables `.env*` file loading so the wrapper-provided process environment is the only build input.

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
- Never include database passwords, service-role keys, secret keys, OIDC tokens, personal access tokens, private hands, seeds, nonces, or deck order in browser code, logs, staging, or evidence.
- No direct `vercel deploy` command may be run from the repository root after this correction.

---

## File Structure

- Create `scripts/isolation/gameplay-vercel-deployment-lib.mjs`: pure validation, staging, secret scanning, and command-construction functions.
- Create `scripts/isolation/deploy-gameplay-vercel.mjs`: the only supported gameplay Vercel deployment entry point.
- Create `tests/isolation/gameplayVercelDeployment.test.mjs`: direct Node tests for pure helper behavior and fail-closed orchestration contracts.
- Create `tests/gameplayVercelDeploymentWorkspace.test.ts`: compiled static regression tests that keep the wrapper, package scripts, Vite config, and ignore rules wired into `ci:isolation`.
- Modify `vite.gameplay.config.ts`: disable Vite `.env*` loading with `envDir: false`.
- Modify `.gitignore`: ignore `vercel-gameplay-deploy/`.
- Modify `package.json`: add wrapper/test scripts and include both new test suites in `ci:isolation`.
- Modify `docs/GAMEPLAY_UAT_DEPLOYMENT.md`: replace the failed Preview/prebuilt instructions with the guarded canonical-UAT flow.
- Modify `docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md`: record the corrected deployment control and current hosted-UAT status.

---

### Task 1: Add RED deployment-contract tests

**Files:**
- Create: `tests/gameplayVercelDeploymentWorkspace.test.ts`
- Create: `tests/isolation/gameplayVercelDeployment.test.mjs`

**Interfaces:**
- Consumes: existing `scripts/isolation/gameplay-target-guard.mjs`, `vite.gameplay.config.ts`, `package.json`, and `.gitignore`.
- Produces: failing regression tests that define the wrapper entry point, helper exports, staging allow-list, dry-run behavior, exact secret-value detection, and Windows-safe Vercel launch contract.

- [ ] **Step 1: Write the compiled static contract test**

Create `tests/gameplayVercelDeploymentWorkspace.test.ts` with these assertions:

```ts
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const deployScript = resolve('scripts/isolation/deploy-gameplay-vercel.mjs');
const libraryScript = resolve('scripts/isolation/gameplay-vercel-deployment-lib.mjs');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  readonly scripts?: Readonly<Record<string, string>>;
};

test('gameplay Vercel deployment entry point is guarded and production-UAT explicit', () => {
  assert.equal(existsSync(deployScript), true, 'Missing gameplay Vercel deployment wrapper.');
  const source = readFileSync(deployScript, 'utf8');
  assert.match(source, /gameplay-target-guard\.mjs/i);
  assert.match(source, /GAMEPLAY_UAT_PUBLISHABLE_KEY/);
  assert.match(source, /build:gameplay/);
  assert.match(source, /vercel-gameplay-deploy/);
  assert.match(source, /--prebuilt/);
  assert.match(source, /--prod/);
  assert.match(source, /plusmaloma-6068s-projects/);
  assert.doesNotMatch(source, /--target[=\s]+preview/i);
  assert.doesNotMatch(source, /vercel\s+env\s+run/i);
});

test('gameplay Vercel helper and ignored staging workspace exist', () => {
  assert.equal(existsSync(libraryScript), true, 'Missing gameplay Vercel deployment helper.');
  assert.match(readFileSync('.gitignore', 'utf8'), /^vercel-gameplay-deploy\/$/m);
  assert.match(packageJson.scripts?.['deploy:gameplay-vercel'] ?? '', /deploy-gameplay-vercel\.mjs/);
  assert.match(packageJson.scripts?.['test:gameplay-vercel-deploy'] ?? '', /gameplayVercelDeployment\.test\.mjs/);
});

test('gameplay Vite build refuses implicit env-file loading', () => {
  const source = readFileSync('vite.gameplay.config.ts', 'utf8');
  assert.match(source, /envDir\s*:\s*false/);
});
```

- [ ] **Step 2: Write direct helper tests**

Create `tests/isolation/gameplayVercelDeployment.test.mjs` with imports for the planned helper API:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAllowedWorkspaceEntries,
  collectProhibitedSecretValues,
  createBuildEnvironment,
  createDeploymentConfig,
  createVercelDeployCommand,
  validateBundle,
  validateInputs,
} from '../../scripts/isolation/gameplay-vercel-deployment-lib.mjs';

const validInput = {
  expectedSha: '0123456789abcdef0123456789abcdef01234567',
  supabaseUrl: 'https://stedjwppoanbmhxsfhcg.supabase.co',
  workspaceSlug: 'estimation-gameplay-uat',
  publishableKey: 'sb_publishable_test_value',
};

test('input validation rejects missing, malformed, or score-UAT values', () => {
  assert.throws(() => validateInputs({ ...validInput, expectedSha: 'bad' }), /sha/i);
  assert.throws(() => validateInputs({ ...validInput, supabaseUrl: 'https://lexewcehptnmikwfizhj.supabase.co' }), /prohibited/i);
  assert.throws(() => validateInputs({ ...validInput, workspaceSlug: 'wrong-workspace' }), /workspace/i);
  assert.throws(() => validateInputs({ ...validInput, publishableKey: '' }), /publishable/i);
});

test('build environment explicitly overwrites all three VITE values', () => {
  const env = createBuildEnvironment(
    { VITE_SUPABASE_URL: 'trap-url', VITE_UAT_WORKSPACE_SLUG: 'trap-slug' },
    validInput,
  );
  assert.equal(env.VITE_SUPABASE_URL, validInput.supabaseUrl);
  assert.equal(env.VITE_SUPABASE_ANON_KEY, validInput.publishableKey);
  assert.equal(env.VITE_UAT_WORKSPACE_SLUG, validInput.workspaceSlug);
});

test('bundle validation requires expected public values and rejects exact prohibited values', () => {
  const goodBundle = `${validInput.supabaseUrl}|${validInput.workspaceSlug}|${validInput.publishableKey}`;
  assert.doesNotThrow(() => validateBundle(goodBundle, validInput, []));
  assert.throws(() => validateBundle('missing', validInput, []), /Supabase URL/i);
  assert.throws(
    () => validateBundle(`${goodBundle}|exact-secret`, validInput, [{ name: 'VERCEL_OIDC_TOKEN', value: 'exact-secret' }]),
    /VERCEL_OIDC_TOKEN/,
  );
});

test('prohibited secret collection ignores empty values and the allowed publishable key', () => {
  const values = collectProhibitedSecretValues({
    GAMEPLAY_UAT_PUBLISHABLE_KEY: validInput.publishableKey,
    VERCEL_OIDC_TOKEN: 'oidc-secret',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DATABASE_URL: 'postgresql://secret',
  });
  assert.deepEqual(values.map(value => value.name), ['VERCEL_OIDC_TOKEN', 'DATABASE_URL']);
});

test('staging allow-list rejects source, env, score output, and root vercel config', () => {
  assert.doesNotThrow(() => assertAllowedWorkspaceEntries([
    '.vercel/project.json',
    '.vercel/output/config.json',
    '.vercel/output/static/index.html',
    '.vercel/output/static/assets/app.js',
  ]));
  for (const forbidden of ['vercel.json', 'dist-app/index.html', '.env.local', 'src/index.ts']) {
    assert.throws(() => assertAllowedWorkspaceEntries([forbidden]), /not allowed/i);
  }
});

test('deployment config and command are deterministic', () => {
  assert.deepEqual(createDeploymentConfig(), {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html' },
    ],
  });
  assert.deepEqual(createVercelDeployCommand(), [
    'vercel', 'deploy', '--prebuilt', '--prod', '--archive=tgz', '--scope', 'plusmaloma-6068s-projects', '--logs',
  ]);
});
```

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayVercelDeploymentWorkspace.test.js
node --test tests/isolation/gameplayVercelDeployment.test.mjs
```

Expected: both commands fail because the new wrapper/helper, package scripts, ignore rule, and `envDir: false` do not exist yet.

- [ ] **Step 4: Commit the RED tests**

```powershell
git add tests/gameplayVercelDeploymentWorkspace.test.ts tests/isolation/gameplayVercelDeployment.test.mjs
git commit -m "test: define guarded gameplay Vercel deployment"
git push origin feature/online-game-bot-mvp
```

Expected: GitHub Actions isolation check fails specifically on the new deployment-contract tests; package failures unrelated to the new tests must be investigated before proceeding.

---

### Task 2: Implement pure deployment validation and staging helpers

**Files:**
- Create: `scripts/isolation/gameplay-vercel-deployment-lib.mjs`

**Interfaces:**
- Consumes: plain input objects, environment maps, bundle text, and relative staged paths.
- Produces:
  - `validateInputs(input): Readonly<ValidatedInput>`
  - `createBuildEnvironment(baseEnv, input): NodeJS.ProcessEnv`
  - `collectProhibitedSecretValues(env): readonly { name: string; value: string }[]`
  - `validateBundle(bundleText, input, prohibitedSecrets): void`
  - `assertAllowedWorkspaceEntries(relativePaths): void`
  - `createDeploymentConfig(): VercelOutputConfig`
  - `createVercelDeployCommand(): readonly string[]`

- [ ] **Step 1: Implement constants and input validation**

Create `scripts/isolation/gameplay-vercel-deployment-lib.mjs` with exact allow-listed values:

```js
const EXPECTED_SUPABASE_URL = 'https://stedjwppoanbmhxsfhcg.supabase.co';
const EXPECTED_WORKSPACE_SLUG = 'estimation-gameplay-uat';
const PROHIBITED_SUPABASE_REF = 'lexewcehptnmikwfizhj';
const VERCEL_SCOPE = 'plusmaloma-6068s-projects';

export function validateInputs(input) {
  if (!/^[0-9a-f]{40}$/i.test(input.expectedSha ?? '')) throw new Error('A tested 40-hex SHA is required.');
  if (input.supabaseUrl !== EXPECTED_SUPABASE_URL) {
    if ((input.supabaseUrl ?? '').includes(PROHIBITED_SUPABASE_REF)) throw new Error('The score-UAT Supabase ref is prohibited.');
    throw new Error(`Supabase URL must target ${EXPECTED_SUPABASE_URL}.`);
  }
  if (input.workspaceSlug !== EXPECTED_WORKSPACE_SLUG) throw new Error(`Workspace slug must be ${EXPECTED_WORKSPACE_SLUG}.`);
  if (typeof input.publishableKey !== 'string' || input.publishableKey.trim().length === 0) {
    throw new Error('GAMEPLAY_UAT_PUBLISHABLE_KEY is required.');
  }
  if (/^(sb_secret_|service_role)/i.test(input.publishableKey.trim())) {
    throw new Error('The supplied key is not browser-safe.');
  }
  return Object.freeze({
    expectedSha: input.expectedSha.toLowerCase(),
    supabaseUrl: input.supabaseUrl,
    workspaceSlug: input.workspaceSlug,
    publishableKey: input.publishableKey.trim(),
  });
}
```

- [ ] **Step 2: Implement explicit build environment and exact secret collection**

```js
const PROHIBITED_SECRET_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
  'DATABASE_URL',
  'VERCEL_OIDC_TOKEN',
  'VERCEL_TOKEN',
  'GITHUB_TOKEN',
];

export function createBuildEnvironment(baseEnv, input) {
  return {
    ...baseEnv,
    VITE_SUPABASE_URL: input.supabaseUrl,
    VITE_SUPABASE_ANON_KEY: input.publishableKey,
    VITE_UAT_WORKSPACE_SLUG: input.workspaceSlug,
  };
}

export function collectProhibitedSecretValues(env) {
  return PROHIBITED_SECRET_NAMES.flatMap(name => {
    const value = env[name];
    return typeof value === 'string' && value.length > 0 ? [{ name, value }] : [];
  });
}
```

- [ ] **Step 3: Implement bundle and staging validation**

```js
export function validateBundle(bundleText, input, prohibitedSecrets) {
  if (!bundleText.includes(input.supabaseUrl)) throw new Error('Expected gameplay Supabase URL is missing from the bundle.');
  if (!bundleText.includes(input.workspaceSlug)) throw new Error('Expected gameplay workspace slug is missing from the bundle.');
  if (!bundleText.includes(input.publishableKey)) throw new Error('Expected browser-safe publishable key is missing from the bundle.');
  for (const secret of prohibitedSecrets) {
    if (bundleText.includes(secret.value)) throw new Error(`Bundle contains prohibited value from ${secret.name}.`);
  }
}

export function assertAllowedWorkspaceEntries(relativePaths) {
  const allowed = [
    /^\.vercel\/project\.json$/,
    /^\.vercel\/output\/config\.json$/,
    /^\.vercel\/output\/static\/.+/,
  ];
  for (const path of relativePaths.map(value => value.replaceAll('\\', '/'))) {
    if (!allowed.some(pattern => pattern.test(path))) throw new Error(`Staged path is not allowed: ${path}`);
  }
}
```

- [ ] **Step 4: Implement deterministic Build Output configuration and deploy command**

```js
export function createDeploymentConfig() {
  return {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html' },
    ],
  };
}

export function createVercelDeployCommand() {
  return [
    'vercel',
    'deploy',
    '--prebuilt',
    '--prod',
    '--archive=tgz',
    '--scope',
    VERCEL_SCOPE,
    '--logs',
  ];
}
```

- [ ] **Step 5: Run direct helper tests**

```powershell
node --test tests/isolation/gameplayVercelDeployment.test.mjs
```

Expected: helper tests pass; static workspace test still fails because the wrapper and wiring are not implemented.

- [ ] **Step 6: Commit the helper implementation**

```powershell
git add scripts/isolation/gameplay-vercel-deployment-lib.mjs
git commit -m "feat: validate gameplay Vercel deployment artifact"
git push origin feature/online-game-bot-mvp
```

---

### Task 3: Implement the single fail-closed deployment wrapper

**Files:**
- Create: `scripts/isolation/deploy-gameplay-vercel.mjs`
- Modify: `vite.gameplay.config.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes CLI arguments `--expected-sha`, `--supabase-url`, `--workspace-slug`, optional `--dry-run`, and environment variable `GAMEPLAY_UAT_PUBLISHABLE_KEY`.
- Produces ignored `vercel-gameplay-deploy/.vercel/project.json`, `.vercel/output/config.json`, and `.vercel/output/static/**`; on non-dry-run, deploys them to the linked canonical UAT project.

- [ ] **Step 1: Disable Vite env-file loading**

Modify `vite.gameplay.config.ts`:

```ts
export default defineConfig({
  root: resolve(process.cwd(), 'gameplay-app'),
  envDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(process.cwd(), 'dist-gameplay'),
    emptyOutDir: true,
  },
});
```

This makes `.env.local` and `.env.*` unavailable to the gameplay build; only process environment variables supplied by the wrapper remain available.

- [ ] **Step 2: Ignore the staging workspace**

Append exactly this line to `.gitignore`:

```gitignore
vercel-gameplay-deploy/
```

- [ ] **Step 3: Implement CLI parsing and safe subprocess helpers**

Create `scripts/isolation/deploy-gameplay-vercel.mjs` with:

```js
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  assertAllowedWorkspaceEntries,
  collectProhibitedSecretValues,
  createBuildEnvironment,
  createDeploymentConfig,
  createVercelDeployCommand,
  validateBundle,
  validateInputs,
} from './gameplay-vercel-deployment-lib.mjs';

const root = resolve(process.cwd());
const guard = resolve(root, 'scripts/isolation/gameplay-target-guard.mjs');
const distRoot = resolve(root, 'dist-gameplay');
const stagingRoot = resolve(root, 'vercel-gameplay-deploy');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? 1}.`);
}

function runNpx(args, cwd) {
  if (process.platform === 'win32') {
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx.cmd', ...args], { cwd });
  } else {
    run('npx', args, { cwd });
  }
}
```

- [ ] **Step 4: Implement guard, build, stage, and validation orchestration**

Continue the wrapper with these exact phases:

```js
function listFiles(directory) {
  const values = [];
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    if (statSync(absolute).isDirectory()) values.push(...listFiles(absolute));
    else values.push(absolute);
  }
  return values;
}

function runGuard(expectedSha) {
  run(process.execPath, [guard, 'vercel', '--expected-sha', expectedSha]);
}

function buildGameplay(input) {
  rmSync(distRoot, { recursive: true, force: true });
  run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', 'run', 'build:gameplay'], {
    env: createBuildEnvironment(process.env, input),
  });
}

function stageArtifact() {
  const projectJson = resolve(root, '.vercel/project.json');
  const indexHtml = resolve(distRoot, 'index.html');
  if (!existsSync(projectJson)) throw new Error('Verified Vercel project metadata is missing.');
  if (!existsSync(indexHtml)) throw new Error('dist-gameplay/index.html is missing.');

  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(resolve(stagingRoot, '.vercel/output/static'), { recursive: true });
  cpSync(projectJson, resolve(stagingRoot, '.vercel/project.json'));
  cpSync(distRoot, resolve(stagingRoot, '.vercel/output/static'), { recursive: true });
  writeFileSync(
    resolve(stagingRoot, '.vercel/output/config.json'),
    `${JSON.stringify(createDeploymentConfig(), null, 2)}\n`,
    'utf8',
  );
}

function validateStaging(input) {
  const stagedFiles = listFiles(stagingRoot);
  const relativeFiles = stagedFiles.map(path => relative(stagingRoot, path).replaceAll('\\', '/'));
  assertAllowedWorkspaceEntries(relativeFiles);

  const scripts = stagedFiles.filter(path => /\.js$/i.test(path));
  if (scripts.length === 0) throw new Error('No staged gameplay JavaScript asset exists.');
  const bundleText = scripts.map(path => readFileSync(path, 'utf8')).join('\n');
  validateBundle(bundleText, input, collectProhibitedSecretValues(process.env));

  const config = JSON.parse(readFileSync(resolve(stagingRoot, '.vercel/output/config.json'), 'utf8'));
  if (config.version !== 3) throw new Error('Vercel Build Output config version must equal 3.');

  console.log('Gameplay artifact verified: true');
  console.log(`Staged file count: ${relativeFiles.length}`);
  console.log('Expected Supabase URL embedded: true');
  console.log('Expected workspace slug embedded: true');
  console.log('Expected publishable key embedded: true');
  console.log('Prohibited exact secret values embedded: false');
}
```

Use `npm` directly on non-Windows:

```js
function buildGameplay(input) {
  rmSync(distRoot, { recursive: true, force: true });
  const env = createBuildEnvironment(process.env, input);
  if (process.platform === 'win32') {
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', 'run', 'build:gameplay'], { env });
  } else {
    run('npm', ['run', 'build:gameplay'], { env });
  }
}
```

- [ ] **Step 5: Implement fail-closed main and dry-run**

```js
try {
  const input = validateInputs({
    expectedSha: argument('--expected-sha'),
    supabaseUrl: argument('--supabase-url'),
    workspaceSlug: argument('--workspace-slug'),
    publishableKey: process.env.GAMEPLAY_UAT_PUBLISHABLE_KEY,
  });
  const dryRun = process.argv.includes('--dry-run');

  runGuard(input.expectedSha);
  buildGameplay(input);
  stageArtifact();
  validateStaging(input);
  runGuard(input.expectedSha);

  const command = createVercelDeployCommand();
  if (dryRun) {
    console.log(`Dry run command: npx ${command.join(' ')}`);
    console.log('Dry run complete; no Vercel deployment was contacted.');
  } else {
    runNpx(command, stagingRoot);
  }
} catch (reason) {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`Gameplay Vercel deployment failed: ${message}`);
  process.exit(1);
}
```

The wrapper must not print `process.env`, the publishable key, bundle text, `.env` contents, or Vercel link identifiers beyond the existing guard output.

- [ ] **Step 6: Run the focused tests**

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/gameplayVercelDeploymentWorkspace.test.js
node --test tests/isolation/gameplayVercelDeployment.test.mjs
```

Expected: both suites pass.

- [ ] **Step 7: Run an invalid-input fail-closed smoke test**

```powershell
Remove-Item Env:GAMEPLAY_UAT_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
node scripts/isolation/deploy-gameplay-vercel.mjs `
  --expected-sha 0000000000000000000000000000000000000000 `
  --supabase-url https://stedjwppoanbmhxsfhcg.supabase.co `
  --workspace-slug estimation-gameplay-uat `
  --dry-run
```

Expected: exits non-zero with `GAMEPLAY_UAT_PUBLISHABLE_KEY is required` before build, staging, or deployment.

- [ ] **Step 8: Commit the wrapper**

```powershell
git add scripts/isolation/deploy-gameplay-vercel.mjs vite.gameplay.config.ts .gitignore
git commit -m "feat: add guarded gameplay Vercel deployment"
git push origin feature/online-game-bot-mvp
```

---

### Task 4: Wire package scripts and CI isolation coverage

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: both new test files and the deployment wrapper.
- Produces:
  - `npm run deploy:gameplay-vercel`
  - `npm run test:gameplay-vercel-deploy`
  - `npm run test:isolation-static` coverage for the compiled static contract.

- [ ] **Step 1: Add package scripts**

Add:

```json
"deploy:gameplay-vercel": "node scripts/isolation/deploy-gameplay-vercel.mjs",
"test:gameplay-vercel-deploy": "node --test tests/isolation/gameplayVercelDeployment.test.mjs"
```

Update `test:isolation-static` so it includes `dist/tests/gameplayVercelDeploymentWorkspace.test.js`, then runs the direct helper suite:

```json
"test:isolation-static": "npm run clean && tsc -p tsconfig.engine.json --outDir dist && node --test dist/tests/gameplayIsolationSpecification.test.js dist/tests/gameplaySupabaseWorkspaceIsolation.test.js dist/tests/gameplayTargetGuard.test.js dist/tests/gameplayEdgeFunctionDeploymentWorkspace.test.js dist/tests/gameplayVercelDeploymentWorkspace.test.js dist/tests/scoreUatBaseline.test.js dist/tests/scoreEngineImportBoundary.test.js && npm run test:gameplay-vercel-deploy"
```

- [ ] **Step 2: Run the complete isolation gate**

```powershell
npm run ci:isolation
```

Expected: score-engine, gameplay boundary, existing isolation tests, compiled Vercel deployment contract, and direct helper tests all pass.

- [ ] **Step 3: Run the complete package gate**

```powershell
npm run ci
```

Expected: typecheck, engine tests, UI tests, score app build, and gameplay build all pass. The gameplay build is allowed to compile without UAT values during CI; the deployment wrapper later verifies the real values are embedded before deployment.

- [ ] **Step 4: Verify workspace isolation and cleanliness**

```powershell
git status --short
git check-ignore -v vercel-gameplay-deploy
git check-ignore -v .env.local
```

Expected: only intended tracked modifications appear before commit; both generated deployment workspace and `.env.local` are ignored.

- [ ] **Step 5: Commit the package wiring**

```powershell
git add package.json
git commit -m "build: enforce gameplay Vercel deployment tests"
git push origin feature/online-game-bot-mvp
```

---

### Task 5: Replace the failed runbook path with the guarded canonical-UAT flow

**Files:**
- Modify: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`
- Modify: `docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md`

**Interfaces:**
- Consumes: `npm run deploy:gameplay-vercel`, exact gameplay Supabase URL, tested SHA, and hidden publishable key environment variable.
- Produces: one operator-safe PowerShell sequence for dry-run, deployment, URL configuration, and hosted UAT.

- [ ] **Step 1: Replace the Preview variable instructions**

In `docs/GAMEPLAY_UAT_DEPLOYMENT.md`, replace the old Vercel Preview-variable section with:

```markdown
## 11. Prepare the browser-safe gameplay deployment inputs

The dedicated Vercel project `estimation-gameplay-uat` is UAT-only. Its canonical Vercel environment label may be Production, but it must never be confused with the separate score-calculator project.

Do not depend on `.env.local`, `.vercel/.env.*`, or Vercel Preview variables. Set only the browser-safe publishable/anon key in the current PowerShell process through a hidden prompt:

```powershell
$secureKey = Read-Host 'Gameplay Supabase publishable key' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:GAMEPLAY_UAT_PUBLISHABLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}
Remove-Variable secureKey, keyPointer
```

Never print `$env:GAMEPLAY_UAT_PUBLISHABLE_KEY`.
```

- [ ] **Step 2: Replace direct build/deploy commands**

Document the dry-run:

```powershell
$testedSha = git rev-parse HEAD

npm run deploy:gameplay-vercel -- `
  --expected-sha $testedSha `
  --supabase-url https://stedjwppoanbmhxsfhcg.supabase.co `
  --workspace-slug estimation-gameplay-uat `
  --dry-run
```

Expected final lines:

```text
Gameplay artifact verified: true
Expected Supabase URL embedded: true
Expected workspace slug embedded: true
Expected publishable key embedded: true
Prohibited exact secret values embedded: false
Dry run complete; no Vercel deployment was contacted.
```

Document the actual canonical UAT deployment only after exact-SHA CI passes:

```powershell
npm run deploy:gameplay-vercel -- `
  --expected-sha $testedSha `
  --supabase-url https://stedjwppoanbmhxsfhcg.supabase.co `
  --workspace-slug estimation-gameplay-uat
```

After completion:

```powershell
Remove-Item Env:GAMEPLAY_UAT_PUBLISHABLE_KEY
```

- [ ] **Step 3: Record the rollback and stop rules**

Add explicit rules:

```markdown
- Any failed guard, build, staging, bundle, secret, or allow-list check means no deployment occurred; stop and investigate.
- Never run `npx vercel deploy` directly from the repository root.
- If the deployed artifact is incorrect, remove only its exact deployment URL; never pass the project name to `vercel remove`.
- Do not merge PR #14 as part of UAT deployment.
```

- [ ] **Step 4: Update progress documentation**

Record:

```markdown
- Supabase gameplay environment, migrations, Functions, Auth users, and workspace: complete.
- Dedicated Vercel project and build settings: complete.
- Incorrect initial Vercel deployments: removed.
- Guarded canonical-UAT deployment wrapper: implemented and CI-gated.
- Hosted solo and two-browser UAT: pending successful guarded deployment.
```

- [ ] **Step 5: Commit documentation**

```powershell
git add docs/GAMEPLAY_UAT_DEPLOYMENT.md docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md
git commit -m "docs: correct gameplay UAT Vercel rollout"
git push origin feature/online-game-bot-mvp
```

---

### Task 6: Verify the exact correction SHA before operational deployment

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: the completed branch head and GitHub Actions results.
- Produces: one tested SHA authorized for the operator dry-run and deployment; does not merge the PR.

- [ ] **Step 1: Run local verification from a clean checkout**

```powershell
npm run ci
npm run ci:isolation
git status --short
```

Expected: both gates pass and `git status --short` is blank.

- [ ] **Step 2: Record and push the final correction SHA**

```powershell
$correctionSha = git rev-parse HEAD
Write-Host "Correction SHA:" $correctionSha
git push origin feature/online-game-bot-mvp
```

Expected: a 40-character SHA; no secrets are displayed.

- [ ] **Step 3: Verify GitHub Actions on that exact SHA**

Required checks:

```text
Validate package: success
Validate isolation boundaries: success
```

Do not deploy from a newer local commit, a dirty checkout, or a SHA whose two checks are pending or failed.

- [ ] **Step 4: Confirm PR isolation**

Verify PR #14 remains:

```text
state: open
draft: true
merged: false
base: main
head: feature/online-game-bot-mvp
```

- [ ] **Step 5: Hand off the single operator command**

Pull the exact tested SHA into `C:\Users\rjamm\estimation-gameplay-uat`, set the hidden publishable key, run the wrapper once with `--dry-run`, review only the non-secret boolean/file-count output, then run the same wrapper once without `--dry-run`.

No alternative Vercel command is authorized by this plan.

---

## Plan Self-Review

- Spec coverage: every approved design requirement is mapped to Tasks 1–6, including explicit input injection, `envDir: false`, guard-before/after, isolated staging, exact secret scanning, Windows-safe launch, dry-run, canonical UAT deployment, CI gates, and runbook correction.
- Placeholder scan: no TBD/TODO/“implement later” placeholders remain.
- Type/interface consistency: helper export names used by tests match the implementation interfaces in Task 2 and imports in Task 3.
- Scope: this plan changes only gameplay Vercel deployment controls and related documentation; it does not modify gameplay rules, Supabase schema, Edge Functions, score UAT, or PR merge state.
