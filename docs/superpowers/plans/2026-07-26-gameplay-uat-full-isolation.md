# Gameplay UAT Full-Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an independently testable score engine, a gameplay module that consumes scoring through an explicit port, and a gameplay-only UAT deployment that cannot target or alter the existing score-calculator UAT.

**Architecture:** The gameplay domain receives a `RoundScoringPort` and uses a production adapter backed by the existing score engine. A gameplay-only React entry point and service graph create a separate Vite artifact. A dedicated `supabase-gameplay/` workspace contains only identity primitives and gameplay persistence. Deployment runs from a separate local checkout and fails closed unless the Supabase and Vercel targets are explicitly allow-listed.

**Tech Stack:** TypeScript 5.5+, Node.js 22+, React 19, Vite 7, Vitest 3, Node test runner, Supabase CLI 2.x, PostgreSQL 17, Supabase Edge Functions/Deno 2, Vercel CLI 57+.

## Global Constraints

- Existing Supabase project `estimation-score-calculator-uat` and reference `lexewcehptnmikwfizhj` must never receive gameplay writes.
- Existing Vercel score-calculator project, UAT URL, deployment artifact, users, workspace, database objects, and data remain unchanged.
- Existing remote branch `feature/react-vite-frontend-prototype` remains unchanged.
- Gameplay implementation stays on `feature/online-game-bot-mvp`; PR #14 remains draft and unmerged.
- Dedicated gameplay checkout path is `C:\Users\rjamm\estimation-gameplay-uat`.
- Dedicated gameplay Supabase and Vercel project name is `estimation-gameplay-uat`.
- Gameplay workspace slug is exactly `estimation-gameplay-uat`.
- Score formulas and externally observable scoring behavior do not change.
- Score engine must pass a dedicated typecheck and test command without compiling gameplay, online, React, Supabase, or Vercel code.
- Gameplay artifact must not import or ship score-sheet screens, score-sheet repositories, player-directory score-sheet services, or score-sheet routes.
- Gameplay Supabase workspace must not create `players`, score-sheet `games`, `game_players`, score-sheet `rounds`, `round_bids`, `round_actuals`, `round_scores`, `score_overrides`, `game_edit_locks`, or score-calculator RPCs.
- Every database or Edge Function write must be preceded by a checkout, branch, SHA, project-name, and project-reference verification.
- No private key, service-role key, database password, access token, private hand, seed, nonce, or deck order may be committed or written to deployment evidence.

---

## File Structure

### Score engine isolation

- Create `tsconfig.score-engine.json`: compiles only score-engine source plus focused score-engine tests.
- Create `tests/score-engine/standaloneScoreEngine.test.ts`: proves representative House Rules V1 scoring without gameplay imports.
- Create `tests/scoreEngineImportBoundary.test.ts`: rejects imports from score engine into gameplay, online, React, Supabase, or Vercel code.
- Modify `package.json`: add `typecheck:score-engine`, `test:score-engine`, and `ci:score-engine`.

### Gameplay scoring boundary

- Create `src/gameplay/scoring/RoundScoringPort.ts`: gameplay-owned scoring request/result contracts.
- Create `src/gameplay/scoring/ScoreEngineRoundScoringAdapter.ts`: delegates to `EstimationMvpService`.
- Modify `src/gameplay/HouseRulesRoundEngine.ts`: depend on the port instead of the concrete service.
- Modify `src/gameplay/types.ts`: use the gameplay-owned result contract.
- Create `tests/gameplayRoundScoringPort.test.ts`: proves fake-port injection and unchanged production scoring.

### Gameplay-only frontend

- Create `src/app/gameplay/GameplayContext.tsx`: gameplay-only service and navigation context.
- Create `src/app/gameplay/GameplayApp.tsx`: authentication plus lobby/table/active-game routing only.
- Create `src/app/gameplay/main.tsx`: gameplay-only browser entry.
- Create `src/app/services/createGameplayBrowserServices.ts`: imports only Auth, Supabase, and gameplay online services.
- Create `gameplay-app/index.html`: gameplay build HTML root.
- Create `vite.gameplay.config.ts`: builds `gameplay-app/index.html` to `dist-gameplay`.
- Create `vercel.gameplay.json`: Vercel build/output configuration for gameplay only.
- Modify `src/app/AppContext.tsx`, `src/app/App.tsx`, and the three gameplay screens to use the extracted gameplay context while preserving the score-calculator app.
- Modify `src/app/services/createBrowserServices.ts`: compose score-calculator services with the gameplay service factory without making the gameplay artifact import score-sheet services.
- Create `tests/gameplayFrontendImportBoundary.test.ts`: recursively verifies the gameplay entry import graph.
- Create `tests/gameplayOnlyApp.test.tsx`: verifies authentication and gameplay routes without score-sheet actions.

### Gameplay-only Supabase workspace

- Create `supabase-gameplay/config.toml`.
- Create `supabase-gameplay/migrations/202607260001_gameplay_identity.sql`.
- Create `supabase-gameplay/migrations/202607260002_gameplay_identity_rls.sql`.
- Copy and renumber the existing gameplay-only migrations into `supabase-gameplay/migrations/202607260003_...` through `202607260009_...`.
- Copy `supabase/functions/deno.json`, `gameplay-start`, and `gameplay-round-command` into `supabase-gameplay/functions/`.
- Create `tests/gameplaySupabaseWorkspaceIsolation.test.ts`.

### Deployment protection

- Create `scripts/isolation/gameplay-target-guard.mjs`: validates checkout, branch, SHA, Supabase ref, Vercel project identity, and prohibited targets.
- Create `tests/gameplayTargetGuard.test.ts`.
- Create `scripts/isolation/score-uat-baseline.mjs`: writes a non-secret before/after evidence template.
- Modify `.gitignore`: ignore local deployment evidence.
- Rewrite `docs/GAMEPLAY_UAT_DEPLOYMENT.md` for the separate checkout, separate projects, gameplay-specific build, and fail-closed commands.
- Modify `.github/workflows/ci.yml`: add independent score-engine and isolation gates.
- Modify `docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md` and PR #14 body after verified delivery.

---

### Task 1: Create and verify the dedicated gameplay checkout

**Files:**
- Create during Task 7: `scripts/isolation/gameplay-target-guard.mjs`
- No repository source files are changed in this task.

**Interfaces:**
- Consumes: remote branches `origin/feature/react-vite-frontend-prototype` and `origin/feature/online-game-bot-mvp`.
- Produces: clean gameplay checkout at `C:\Users\rjamm\estimation-gameplay-uat`, preserving the original checkout and stash.

- [ ] **Step 1: Preserve the current local UAT checkout**

Run from `C:\Users\rjamm\estimation-score-calculator\estimation-score-calculator`:

```powershell
git stash push --include-untracked -m "safety-before-gameplay-isolation-2026-07-26"
git fetch origin
git branch backup/local-uat-before-gameplay-isolation b84ecf322752d3a60d0f7124ad2cf07bdacd94c0
git branch -f feature/react-vite-frontend-prototype origin/feature/react-vite-frontend-prototype
git status --short --branch
git stash list
```

Expected: no push occurs; the remote UAT branch remains unchanged; the safety stash remains present.

- [ ] **Step 2: Create a dedicated worktree**

```powershell
$gameplayPath = 'C:\Users\rjamm\estimation-gameplay-uat'
if (Test-Path $gameplayPath) { throw "Gameplay path already exists: $gameplayPath" }

git show-ref --verify --quiet refs/heads/feature/online-game-bot-mvp
if ($LASTEXITCODE -eq 0) {
  git worktree add $gameplayPath feature/online-game-bot-mvp
} else {
  git worktree add -b feature/online-game-bot-mvp $gameplayPath origin/feature/online-game-bot-mvp
}
```

- [ ] **Step 3: Verify checkout identity**

```powershell
Set-Location C:\Users\rjamm\estimation-gameplay-uat
if ((git branch --show-current) -ne 'feature/online-game-bot-mvp') { throw 'Wrong gameplay branch.' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/feature/online-game-bot-mvp)) { throw 'Gameplay checkout is not at the remote head.' }
if (Test-Path .vercel) { throw 'Gameplay worktree inherited a Vercel link.' }
if (Test-Path supabase\.temp) { throw 'Gameplay worktree inherited a Supabase link.' }
git status --short --branch
```

Expected: clean branch, no `.vercel/`, no `supabase/.temp/`.

- [ ] **Step 4: Install and run the existing full gate**

```powershell
npm ci
npm run ci
```

Expected: PASS before isolation refactoring begins.

---

### Task 2: Add an independently buildable and testable score engine

**Files:**
- Create: `tsconfig.score-engine.json`
- Create: `tests/score-engine/standaloneScoreEngine.test.ts`
- Create: `tests/scoreEngineImportBoundary.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `EstimationMvpService`, `houseRulesV1ScoringProfile`, `HOUSE_RULES_V1`, and core domain/scoring types.
- Produces: scripts `npm run typecheck:score-engine`, `npm run test:score-engine`, `npm run ci:score-engine`.

- [ ] **Step 1: Write the failing standalone score-engine test**

Create `tests/score-engine/standaloneScoreEngine.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { houseRulesV1ScoringProfile } from '../../src/scoring/houseRulesV1Profile.js';
import { HOUSE_RULES_V1 } from '../../src/scoring/ruleSets.js';
import { EstimationMvpService } from '../../src/services/EstimationMvpService.js';

const service = new EstimationMvpService();

test('standalone score engine calculates a House Rules V1 round', () => {
  const result = service.calculateRound({
    roundNumber: 1,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'p2', bidType: 'normal', tricks: 3 },
      { playerId: 'p3', bidType: 'normal', tricks: 2 },
      { playerId: 'p4', bidType: 'normal', tricks: 1 },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 4 },
      { playerId: 'p2', actualTricks: 3 },
      { playerId: 'p3', actualTricks: 2 },
      { playerId: 'p4', actualTricks: 4 },
    ],
    profile: houseRulesV1ScoringProfile,
    ruleSet: HOUSE_RULES_V1,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'p1',
    riskPlayerId: 'p4',
  });

  assert.equal(result.valid, true);
  assert.ok(result.scoreResult);
  assert.equal(result.scoreResult.playerScores.length, 4);
});
```

- [ ] **Step 2: Write the failing import-boundary test**

Create `tests/scoreEngineImportBoundary.test.ts` that walks `src/domain`, `src/scoring`, and the allow-listed score services, parses imports with TypeScript, and fails on paths containing `/gameplay/`, `/online/`, `/app/`, `@supabase/`, `react`, or `vercel`.

Core assertion:

```ts
const forbidden = ['/gameplay/', '/online/', '/app/', '@supabase/', 'react', 'vercel'];
for (const imported of discoveredImports) {
  assert.equal(forbidden.some((token) => imported.includes(token)), false, `Forbidden score-engine import: ${imported}`);
}
```

- [ ] **Step 3: Run RED**

```powershell
npm run test:score-engine
```

Expected: FAIL because the script and dedicated TypeScript configuration do not exist.

- [ ] **Step 4: Add `tsconfig.score-engine.json`**

```json
{
  "extends": "./tsconfig.engine.json",
  "compilerOptions": {
    "composite": false,
    "rootDir": ".",
    "outDir": "dist-score-engine"
  },
  "include": [
    "src/domain/**/*.ts",
    "src/scoring/**/*.ts",
    "src/services/BidValidationService.ts",
    "src/services/LeaderboardService.ts",
    "src/services/EstimationMvpService.ts",
    "tests/score-engine/**/*.test.ts"
  ],
  "exclude": [
    "src/gameplay/**/*",
    "src/online/**/*",
    "src/app/**/*"
  ]
}
```

- [ ] **Step 5: Add package scripts**

Add to `package.json`:

```json
"clean:score-engine": "node -e \"fs.rmSync('dist-score-engine', { recursive: true, force: true })\"",
"typecheck:score-engine": "tsc -p tsconfig.score-engine.json --noEmit",
"test:score-engine": "npm run clean:score-engine && tsc -p tsconfig.score-engine.json && node --test dist-score-engine/tests/score-engine/*.test.js",
"ci:score-engine": "npm run typecheck:score-engine && npm run test:score-engine"
```

- [ ] **Step 6: Run GREEN and the boundary test**

```powershell
npm run ci:score-engine
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/scoreEngineImportBoundary.test.js
```

Expected: PASS; no gameplay source is compiled by the dedicated score command.

- [ ] **Step 7: Commit**

```powershell
git add package.json tsconfig.score-engine.json tests/score-engine/standaloneScoreEngine.test.ts tests/scoreEngineImportBoundary.test.ts
git commit -m "test: prove standalone score engine boundary"
```

---

### Task 3: Introduce the gameplay scoring port and adapter

**Files:**
- Create: `src/gameplay/scoring/RoundScoringPort.ts`
- Create: `src/gameplay/scoring/ScoreEngineRoundScoringAdapter.ts`
- Modify: `src/gameplay/HouseRulesRoundEngine.ts`
- Modify: `src/gameplay/types.ts`
- Create: `tests/gameplayRoundScoringPort.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RoundScoringPort {
  validateBids(
    bids: readonly EstimationBid[],
    options: { readonly mode: 'round-estimates'; readonly bidOwnerPlayerId: string },
  ): RoundBidValidationResult;
  scoreRound(input: GameplayRoundScoringInput): GameplayRoundScoringResult;
}
```

- `ScoreEngineRoundScoringAdapter` delegates to the unchanged `EstimationMvpService`.
- `HouseRulesRoundEngine` defaults to the adapter but accepts a fake port in tests.

- [ ] **Step 1: Write the failing injection test**

Create `tests/gameplayRoundScoringPort.test.ts` with a fake port that records `validateBids` and `scoreRound` calls. Complete a deterministic round fixture and assert the final call contains round number, four bids, four actual results summing to 13, bid owner, risk player, and multipliers.

Key fake:

```ts
const fakePort: RoundScoringPort = {
  validateBids: () => ({ valid: true, errors: [], totalEstimatedTricks: 10, roundType: 'under' }),
  scoreRound: (input) => {
    received = input;
    return {
      roundNumber: input.roundNumber,
      valid: true,
      errors: [],
      bidValidation: { valid: true, errors: [], totalEstimatedTricks: 10, roundType: 'under' },
      scoreResult: fakeRoundScore,
      isAllLoserRound: false,
      consecutiveAllLoserCountBeforeRound: 0,
      carriedAllLoserMultiplier: 1,
      carryConsumed: false,
    };
  },
};
```

- [ ] **Step 2: Run RED**

```powershell
npm run test:engine -- --test-name-pattern="scoring port"
```

Expected: FAIL because `RoundScoringPort` and adapter are absent.

- [ ] **Step 3: Create `RoundScoringPort.ts`**

```ts
import type { BidValidationMode, EstimationBid, RoundBidValidationResult } from '../../domain/bid.js';
import type { PlayerRoundActualResult, RoundScoreResult, AllLoserCarryMetadata } from '../../scoring/types.js';

export interface GameplayRoundScoringInput {
  readonly roundNumber: number;
  readonly bids: readonly EstimationBid[];
  readonly actualResults: readonly PlayerRoundActualResult[];
  readonly bidOwnerPlayerId: string;
  readonly riskPlayerId: string;
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
}

export interface GameplayRoundScoringResult extends AllLoserCarryMetadata {
  readonly roundNumber: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly bidValidation: RoundBidValidationResult;
  readonly scoreResult?: RoundScoreResult;
}

export interface RoundScoringPort {
  validateBids(
    bids: readonly EstimationBid[],
    options: { readonly mode: BidValidationMode; readonly bidOwnerPlayerId: string },
  ): RoundBidValidationResult;
  scoreRound(input: GameplayRoundScoringInput): GameplayRoundScoringResult;
}
```

- [ ] **Step 4: Create the production adapter**

```ts
import { houseRulesV1ScoringProfile } from '../../scoring/houseRulesV1Profile.js';
import { HOUSE_RULES_V1 } from '../../scoring/ruleSets.js';
import { EstimationMvpService } from '../../services/EstimationMvpService.js';
import type { RoundScoringPort, GameplayRoundScoringInput, GameplayRoundScoringResult } from './RoundScoringPort.js';

export class ScoreEngineRoundScoringAdapter implements RoundScoringPort {
  constructor(private readonly scoreEngine = new EstimationMvpService()) {}

  validateBids(bids, options) {
    return this.scoreEngine.validateBids(bids, options);
  }

  scoreRound(input: GameplayRoundScoringInput): GameplayRoundScoringResult {
    return this.scoreEngine.calculateRound({
      ...input,
      profile: houseRulesV1ScoringProfile,
      ruleSet: HOUSE_RULES_V1,
      bidValidationMode: 'round-estimates',
    });
  }
}
```

- [ ] **Step 5: Refactor `HouseRulesRoundEngine` and state type**

Replace the concrete service field with:

```ts
private readonly scoringPort: RoundScoringPort = new ScoreEngineRoundScoringAdapter()
```

Use `this.scoringPort.validateBids(...)` and `this.scoringPort.scoreRound(...)`. Change `HouseRulesRoundState.scoreResult` from `MvpRoundResult` to `GameplayRoundScoringResult`. Do not alter scoring inputs or formulas.

- [ ] **Step 6: Run GREEN and regression suites**

```powershell
npm run ci:score-engine
npm run test:engine
```

Expected: fake-port test passes and every existing scoring/gameplay test remains green.

- [ ] **Step 7: Commit**

```powershell
git add src/gameplay/scoring src/gameplay/HouseRulesRoundEngine.ts src/gameplay/types.ts tests/gameplayRoundScoringPort.test.ts
git commit -m "refactor: isolate gameplay scoring port"
```

---

### Task 4: Extract a gameplay-only service and navigation context

**Files:**
- Create: `src/app/gameplay/GameplayContext.tsx`
- Create: `src/app/services/createGameplayBrowserServices.ts`
- Modify: `src/app/AppContext.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/screens/GameplayLobbyScreen.tsx`
- Modify: `src/app/screens/GameplayTableScreen.tsx`
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Modify: `src/app/services/createBrowserServices.ts`
- Create: `src/app/gameplay/GameplayContext.test.tsx`

**Interfaces:**
- Produces `GameplayApplicationServices`, `GameplaySessionServices`, `GameplayRoute`, `GameplayContextProvider`, and `useGameplayApp()`.
- Combined score-calculator app adapts its existing services/navigation into this provider.
- Gameplay-only app imports no `BrowserShellPort`, score-sheet repository, score-sheet online service, or player-directory service.

- [ ] **Step 1: Write RED context tests**

Test that gameplay screens render with a provider containing only:

```ts
{
  auth,
  onlineSessionFactory: () => ({
    gameplayTables,
    activeGameControl,
    activeGameRealtime,
    gameplayRound,
    gameplayRoundRealtime,
  }),
}
```

Assert no `shell` or `playerDirectory` is required.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/app/gameplay/GameplayContext.test.tsx
```

Expected: FAIL because the gameplay-only context does not exist.

- [ ] **Step 3: Implement `GameplayContext.tsx`**

Define routes exactly as:

```ts
export type GameplayRoute = 'gameplay-home' | 'gameplay-lobby' | 'gameplay-table' | 'active-game';
```

Move the gameplay port type aliases from `AppContext.tsx` into this file. The context value exposes `route`, `activeGameplayTableId`, `services`, `navigate`, `openGameplayTable`, and `openActiveGame` only.

- [ ] **Step 4: Implement `createGameplayBrowserServices.ts`**

Move only the Auth/Supabase/gameplay construction from `createBrowserServices.ts`. Its import list must not contain:

```text
LifecycleBrowserUiShellService
LocalStorageScoreSheetRepository
OnlineBrowserShellService
PlayerDirectoryService
LocalPlayerDirectoryService
```

- [ ] **Step 5: Adapt the combined app**

Keep `AppContext` and score-sheet routes intact. Wrap gameplay screens with `GameplayContextProvider` using adapters from the combined app. Change the three gameplay screens from `useApp()` to `useGameplayApp()`.

- [ ] **Step 6: Compose factories without reversing dependencies**

`createBrowserServices.ts` may import `createGameplayBrowserServices.ts`; `createGameplayBrowserServices.ts` must never import `createBrowserServices.ts` or score-sheet modules.

- [ ] **Step 7: Run GREEN and all UI tests**

```powershell
npx vitest run src/app/gameplay/GameplayContext.test.tsx
npm run test:ui
```

- [ ] **Step 8: Commit**

```powershell
git add src/app/gameplay/GameplayContext.tsx src/app/gameplay/GameplayContext.test.tsx src/app/services/createGameplayBrowserServices.ts src/app/AppContext.tsx src/app/App.tsx src/app/screens/GameplayLobbyScreen.tsx src/app/screens/GameplayTableScreen.tsx src/app/screens/ActiveGameplayScreen.tsx src/app/services/createBrowserServices.ts
git commit -m "refactor: extract gameplay application context"
```

---

### Task 5: Build a gameplay-only frontend artifact

**Files:**
- Create: `src/app/gameplay/GameplayApp.tsx`
- Create: `src/app/gameplay/main.tsx`
- Create: `gameplay-app/index.html`
- Create: `vite.gameplay.config.ts`
- Create: `vercel.gameplay.json`
- Create: `src/app/gameplay/GameplayApp.test.tsx`
- Create: `tests/gameplayFrontendImportBoundary.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run build:gameplay` with output `dist-gameplay/`.
- Vercel configuration builds only the gameplay entry.

- [ ] **Step 1: Write RED route and import-boundary tests**

`GameplayApp.test.tsx` must assert sign-in, lobby, table, and active-game routing. It must assert the rendered UI has no “New score sheet”, “History”, score-sheet editor, or score-sheet route action.

`gameplayFrontendImportBoundary.test.ts` recursively parses relative imports starting at `src/app/gameplay/main.tsx` and fails when the graph reaches:

```text
src/app/screens/NewGameScreen.tsx
src/app/screens/ScoreSheetScreen.tsx
src/app/services/LocalPlayerDirectoryService.ts
src/online/games/
src/online/players/
src/repositories/
```

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/app/gameplay/GameplayApp.test.tsx
npm run build:gameplay
```

Expected: FAIL because the entry and build script are absent.

- [ ] **Step 3: Create the gameplay app**

`GameplayApp.tsx` imports only gameplay context, authentication UI, `GameplayLobbyScreen`, `GameplayTableScreen`, and `ActiveGameplayScreen`. Initial authenticated route is `gameplay-lobby`; unauthenticated users see `SignInScreen`.

- [ ] **Step 4: Create the gameplay browser entry**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameplayApp } from './GameplayApp.js';
import '../styles/app.css';
import '../styles/gameplay.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Root element not found.');
createRoot(root).render(<StrictMode><GameplayApp /></StrictMode>);
```

- [ ] **Step 5: Add Vite and Vercel configs**

`vite.gameplay.config.ts`:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: resolve(process.cwd(), 'gameplay-app'),
  plugins: [react()],
  build: {
    outDir: resolve(process.cwd(), 'dist-gameplay'),
    emptyOutDir: true,
  },
});
```

`vercel.gameplay.json`:

```json
{
  "buildCommand": "npm run build:gameplay",
  "outputDirectory": "dist-gameplay",
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

- [ ] **Step 6: Add package scripts**

```json
"build:gameplay": "vite build --config vite.gameplay.config.ts",
"test:gameplay-boundary": "npm run build:gameplay && npm run clean && tsc -p tsconfig.engine.json --outDir dist && node --test dist/tests/gameplayFrontendImportBoundary.test.js"
```

- [ ] **Step 7: Run GREEN**

```powershell
npx vitest run src/app/gameplay/GameplayApp.test.tsx
npm run test:gameplay-boundary
```

Verify `dist-gameplay/index.html` exists and `dist-gameplay` contains no source map or asset with score-sheet screen identifiers.

- [ ] **Step 8: Commit**

```powershell
git add src/app/gameplay gameplay-app vite.gameplay.config.ts vercel.gameplay.json tests/gameplayFrontendImportBoundary.test.ts package.json
git commit -m "feat: add gameplay-only web artifact"
```

---

### Task 6: Create the gameplay-only Supabase workspace

**Files:**
- Create: `supabase-gameplay/config.toml`
- Create: `supabase-gameplay/migrations/202607260001_gameplay_identity.sql`
- Create: `supabase-gameplay/migrations/202607260002_gameplay_identity_rls.sql`
- Create: `supabase-gameplay/migrations/202607260003_gameplay_tables.sql`
- Create: `supabase-gameplay/migrations/202607260004_gameplay_tables_rls.sql`
- Create: `supabase-gameplay/migrations/202607260005_gameplay_table_rpc.sql`
- Create: `supabase-gameplay/migrations/202607260006_active_game_control.sql`
- Create: `supabase-gameplay/migrations/202607260007_active_game_control_rpc.sql`
- Create: `supabase-gameplay/migrations/202607260008_gameplay_round_state.sql`
- Create: `supabase-gameplay/migrations/202607260009_gameplay_round_rpc.sql`
- Create: `supabase-gameplay/functions/deno.json`
- Create: `supabase-gameplay/functions/gameplay-start/index.ts`
- Create: `supabase-gameplay/functions/gameplay-round-command/index.ts`
- Create: `tests/gameplaySupabaseWorkspaceIsolation.test.ts`

**Interfaces:**
- Supabase CLI uses `--workdir supabase-gameplay`.
- Produces only shared identity primitives plus gameplay objects.

- [ ] **Step 1: Write RED workspace-isolation test**

The test reads every gameplay migration and asserts:

```ts
const forbiddenObjects = [
  'create table public.players',
  'create table public.games',
  'create table public.game_players',
  'create table public.rounds',
  'create table public.round_bids',
  'create table public.round_actuals',
  'create table public.round_scores',
  'create table public.score_overrides',
  'create table public.game_edit_locks',
  'create or replace function public.create_game',
  'create or replace function public.save_round',
];
```

It also asserts required gameplay objects, nine ordered migrations, `project_id = "estimation-gameplay-uat"`, signup disabled, and JWT verification enabled for both functions.

- [ ] **Step 2: Run RED**

```powershell
npm run test:engine -- --test-name-pattern="gameplay Supabase workspace"
```

Expected: FAIL because `supabase-gameplay/` is absent.

- [ ] **Step 3: Create the identity baseline**

`202607260001_gameplay_identity.sql` contains only:

```sql
create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'tester')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (workspace_id, user_id)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at before update on public.workspace_memberships
for each row execute function public.set_updated_at();
```

- [ ] **Step 4: Create identity RLS**

Use only `is_workspace_member`, `has_workspace_role`, RLS/policies for `workspaces`, `profiles`, and `workspace_memberships`, and grants for those objects. Do not copy `game_workspace_id`, `round_workspace_id`, score-sheet policies, or score-sheet grants.

- [ ] **Step 5: Copy gameplay migrations byte-for-byte and renumber**

Copy these exact sources:

```text
supabase/migrations/202607250004_gameplay_tables.sql      -> supabase-gameplay/migrations/202607260003_gameplay_tables.sql
supabase/migrations/202607250005_gameplay_tables_rls.sql  -> supabase-gameplay/migrations/202607260004_gameplay_tables_rls.sql
supabase/migrations/202607250006_gameplay_table_rpc.sql   -> supabase-gameplay/migrations/202607260005_gameplay_table_rpc.sql
supabase/migrations/202607250007_active_game_control.sql  -> supabase-gameplay/migrations/202607260006_active_game_control.sql
supabase/migrations/202607250008_active_game_control_rpc.sql -> supabase-gameplay/migrations/202607260007_active_game_control_rpc.sql
supabase/migrations/202607260009_gameplay_round_state.sql -> supabase-gameplay/migrations/202607260008_gameplay_round_state.sql
supabase/migrations/202607260010_gameplay_round_rpc.sql   -> supabase-gameplay/migrations/202607260009_gameplay_round_rpc.sql
```

Update comments that mention old migration filenames; do not change SQL behavior.

- [ ] **Step 6: Copy gameplay Edge Functions**

Copy `supabase/functions/deno.json` and both gameplay Function directories into `supabase-gameplay/functions/`. Confirm relative imports to `../../src` still resolve from the new directory depth.

- [ ] **Step 7: Create `supabase-gameplay/config.toml`**

Set:

```toml
project_id = "estimation-gameplay-uat"

[db]
major_version = 17

[auth]
enabled = true
enable_signup = false
enable_anonymous_sign_ins = false

[auth.email]
enable_signup = false

[realtime]
enabled = true

[edge_runtime]
enabled = true
deno_version = 2

[functions.gameplay-start]
verify_jwt = true

[functions.gameplay-round-command]
verify_jwt = true
```

- [ ] **Step 8: Run GREEN and local migration parse checks**

```powershell
npm run test:engine -- --test-name-pattern="gameplay Supabase workspace"
npx supabase --workdir supabase-gameplay db lint --local
```

If local Supabase is not running, the static test remains mandatory and the database lint is repeated after `npx supabase --workdir supabase-gameplay start` in the dedicated checkout.

- [ ] **Step 9: Commit**

```powershell
git add supabase-gameplay tests/gameplaySupabaseWorkspaceIsolation.test.ts
git commit -m "feat: isolate gameplay Supabase workspace"
```

---

### Task 7: Add fail-closed deployment guards and evidence handling

**Files:**
- Create: `scripts/isolation/gameplay-target-guard.mjs`
- Create: `scripts/isolation/score-uat-baseline.mjs`
- Create: `tests/gameplayTargetGuard.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`
- Rewrite: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`

**Interfaces:**
- `node scripts/isolation/gameplay-target-guard.mjs supabase <allowed-ref>` exits non-zero on any ambiguity.
- `node scripts/isolation/gameplay-target-guard.mjs vercel` reads `.vercel/project.json` and requires project name `estimation-gameplay-uat`.
- Evidence is written under ignored `deployment-evidence/`.

- [ ] **Step 1: Write RED guard tests**

Cover these cases using temporary directories:

1. wrong directory name;
2. wrong branch;
3. dirty checkout;
4. missing Supabase ref;
5. prohibited ref `lexewcehptnmikwfizhj`;
6. allowed gameplay ref;
7. missing `.vercel/project.json`;
8. wrong Vercel project name;
9. correct gameplay Vercel project.

- [ ] **Step 2: Run RED**

```powershell
npm run test:engine -- --test-name-pattern="gameplay target guard"
```

- [ ] **Step 3: Implement the guard**

The guard must:

```js
const EXPECTED_DIR = 'estimation-gameplay-uat';
const EXPECTED_BRANCH = 'feature/online-game-bot-mvp';
const EXPECTED_VERCEL_PROJECT = 'estimation-gameplay-uat';
const PROHIBITED_SUPABASE_REFS = new Set(['lexewcehptnmikwfizhj']);
```

It calls `git branch --show-current`, `git rev-parse HEAD`, and `git status --porcelain`; reads `supabase-gameplay/.temp/project-ref` for Supabase; reads `.vercel/project.json` for Vercel; and exits with code 1 on missing, wrong, prohibited, dirty, or ambiguous state.

- [ ] **Step 4: Implement non-secret baseline evidence**

`score-uat-baseline.mjs` accepts `before` or `after`, prompts only for non-secret values, and writes:

```json
{
  "phase": "before",
  "recordedAtUtc": "2026-07-26T00:00:00.000Z",
  "uatBranchSha": "...",
  "supabaseProjectName": "estimation-score-calculator-uat",
  "supabaseProjectRef": "lexewcehptnmikwfizhj",
  "vercelProjectName": "...",
  "uatUrl": "https://...",
  "signInSmoke": "pass",
  "openScoreSheetSmoke": "pass",
  "nonSecretCounts": {}
}
```

It rejects keys containing `password`, `token`, `secret`, `key`, `hand`, `seed`, `nonce`, or `deck`.

- [ ] **Step 5: Update `.gitignore` and scripts**

Add:

```text
deployment-evidence/
supabase-gameplay/.temp/
```

Add package script:

```json
"verify:gameplay-target": "node scripts/isolation/gameplay-target-guard.mjs"
```

- [ ] **Step 6: Rewrite deployment runbook**

The runbook must use the dedicated checkout and exact guarded sequence:

```powershell
Set-Location C:\Users\rjamm\estimation-gameplay-uat
npm ci
npm run ci
npm run ci:score-engine
npm run test:gameplay-boundary

npx supabase --workdir supabase-gameplay link --project-ref <NEW_GAMEPLAY_PROJECT_REF>
node scripts/isolation/gameplay-target-guard.mjs supabase <NEW_GAMEPLAY_PROJECT_REF>
npx supabase --workdir supabase-gameplay db push --dry-run
# Review before apply.
node scripts/isolation/gameplay-target-guard.mjs supabase <NEW_GAMEPLAY_PROJECT_REF>
npx supabase --workdir supabase-gameplay db push
npx supabase --workdir supabase-gameplay functions deploy gameplay-start
npx supabase --workdir supabase-gameplay functions deploy gameplay-round-command

npx vercel link --project estimation-gameplay-uat
node scripts/isolation/gameplay-target-guard.mjs vercel
npm run build:gameplay
npx vercel build --local-config vercel.gameplay.json
node scripts/isolation/gameplay-target-guard.mjs vercel
npx vercel deploy --prebuilt --local-config vercel.gameplay.json
```

The runbook must explicitly prohibit running these commands from the score-calculator checkout.

- [ ] **Step 7: Run GREEN**

```powershell
npm run test:engine -- --test-name-pattern="gameplay target guard"
node scripts/isolation/gameplay-target-guard.mjs supabase lexewcehptnmikwfizhj
```

Expected: tests PASS; the direct prohibited-ref command exits non-zero.

- [ ] **Step 8: Commit**

```powershell
git add scripts/isolation tests/gameplayTargetGuard.test.ts .gitignore package.json docs/GAMEPLAY_UAT_DEPLOYMENT.md
git commit -m "build: guard isolated gameplay deployment"
```

---

### Task 8: Integrate isolation gates into CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Create: `tests/gameplayIsolationSpecification.test.ts`

**Interfaces:**
- Produces `npm run ci:isolation` and a CI job that proves score-engine, gameplay artifact, Supabase workspace, and target guard boundaries.

- [ ] **Step 1: Write RED specification test**

Assert package scripts exist, `vercel.gameplay.json` points to `dist-gameplay`, `supabase-gameplay/config.toml` has the right project/function settings, and the deployment runbook contains both the expected gameplay project and prohibited score UAT ref.

- [ ] **Step 2: Run RED**

```powershell
npm run ci:isolation
```

Expected: FAIL because the aggregate script is absent.

- [ ] **Step 3: Add aggregate script**

```json
"ci:isolation": "npm run ci:score-engine && npm run test:gameplay-boundary && npm run test:engine -- --test-name-pattern=\"workspace|target guard|isolation specification|scoring port\""
```

- [ ] **Step 4: Update GitHub Actions**

After `npm ci`, run:

```yaml
- name: Validate package
  run: npm run ci

- name: Validate isolation boundaries
  run: npm run ci:isolation
```

Do not add Supabase or Vercel deployment secrets to this PR or workflow.

- [ ] **Step 5: Run full GREEN verification**

```powershell
npm ci
npm run ci
npm run ci:isolation
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add .github/workflows/ci.yml package.json tests/gameplayIsolationSpecification.test.ts
git commit -m "ci: enforce gameplay isolation boundaries"
```

---

### Task 9: Record baseline and provision the dedicated hosted environments

**Files:**
- Local ignored evidence under `deployment-evidence/` only.
- No source changes unless deployment reveals a tested defect.

**Interfaces:**
- Consumes: verified commit from Task 8.
- Produces: new Supabase and Vercel gameplay projects, gameplay URL, and before/after isolation evidence.

- [ ] **Step 1: Record score-calculator UAT baseline**

From the original score-calculator checkout, record branch SHA, existing project identities, current URL, sign-in smoke result, score-sheet-open smoke result, and practical non-secret table counts. Store under `deployment-evidence/score-uat-before.json`.

- [ ] **Step 2: Create the Supabase project manually**

In the authenticated Supabase dashboard create `estimation-gameplay-uat`. Use a unique database password stored only in a password manager. Do not pass the password in CLI arguments or chat.

- [ ] **Step 3: Link and verify from the dedicated checkout**

```powershell
Set-Location C:\Users\rjamm\estimation-gameplay-uat
npx supabase --workdir supabase-gameplay link --project-ref <NEW_GAMEPLAY_PROJECT_REF>
node scripts/isolation/gameplay-target-guard.mjs supabase <NEW_GAMEPLAY_PROJECT_REF>
```

Expected: guard confirms the new ref and rejects `lexewcehptnmikwfizhj`.

- [ ] **Step 4: Dry-run and review migrations**

```powershell
npx supabase --workdir supabase-gameplay db push --dry-run
```

Expected: only nine gameplay-workspace migrations; no DROP/ALTER of existing objects; no score-sheet persistence objects.

- [ ] **Step 5: Apply migrations and deploy Functions**

Run the guard immediately before each write, then:

```powershell
npx supabase --workdir supabase-gameplay db push
npx supabase --workdir supabase-gameplay functions deploy gameplay-start
npx supabase --workdir supabase-gameplay functions deploy gameplay-round-command
```

- [ ] **Step 6: Create isolated Auth users and workspace**

Create host/tester users in the new Supabase Auth tenant. Insert exactly one workspace with slug `estimation-gameplay-uat`, profiles for those users, and memberships. Public signup stays disabled.

- [ ] **Step 7: Create and link the new Vercel project**

```powershell
npx vercel link --project estimation-gameplay-uat
node scripts/isolation/gameplay-target-guard.mjs vercel
npx vercel env add VITE_SUPABASE_URL preview
npx vercel env add VITE_SUPABASE_ANON_KEY preview
npx vercel env add VITE_UAT_WORKSPACE_SLUG preview
```

Set the workspace slug value to `estimation-gameplay-uat`.

- [ ] **Step 8: Build and deploy only the gameplay artifact**

```powershell
npm run build:gameplay
npx vercel build --local-config vercel.gameplay.json
node scripts/isolation/gameplay-target-guard.mjs vercel
npx vercel deploy --prebuilt --local-config vercel.gameplay.json
```

Record the returned preview URL and exact commit SHA.

---

### Task 10: Execute gameplay UAT and prove the score UAT was unaffected

**Files:**
- Local ignored evidence under `deployment-evidence/` only.
- Update after verification: `docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md`
- Update after verification: PR #14 body

**Interfaces:**
- Produces: hosted gameplay acceptance evidence and score-UAT before/after comparison.

- [ ] **Step 1: Solo-versus-three-bots smoke test**

Verify Start Game, three bot fills, thirteen private cards, public commitment, four estimates with total not 13, 52 legal card actions, thirteen tricks, scored result, reload recovery, and idempotent retry behavior.

- [ ] **Step 2: Two-browser UAT**

Verify seat updates, bid/card Realtime, private hands, connected timeout assistance, disconnect grace, temporary bot takeover, reclaim at safe boundary, pause/resume timer freezing, and confirmed termination.

- [ ] **Step 3: Repeat score-calculator UAT protection checks**

Record `deployment-evidence/score-uat-after.json` with the same fields as before. Compare branch SHA, Supabase identity, Vercel identity, URL, sign-in, score-sheet-open smoke, and non-secret counts.

Expected: no unexplained difference.

- [ ] **Step 4: Run final repository verification**

```powershell
npm ci
npm run ci
npm run ci:isolation
```

Expected: all commands exit 0 at the deployed SHA.

- [ ] **Step 5: Update delivery records**

Update progress and PR #14 with:

- deployed commit SHA;
- gameplay Supabase project name and non-secret ref;
- gameplay Vercel project and URL;
- UTC deployment time;
- solo and two-browser pass/fail results;
- score-UAT before/after protection result;
- remaining product gaps;
- explicit statement that PR #14 remains draft and unmerged.

- [ ] **Step 6: Commit documentation only**

```powershell
git add docs/ONLINE_GAMEPLAY_MVP_PROGRESS.md
git commit -m "docs: record isolated gameplay UAT result"
```

---

## Plan Self-Review

- Spec coverage: standalone score engine, explicit scoring port, gameplay-only frontend, gameplay-only database, separate checkout, fail-closed Supabase/Vercel targeting, UAT baseline comparison, rollback limits, and hosted acceptance are each mapped to a task.
- Placeholder scan: runtime-specific values that cannot exist before provisioning are represented only as explicit operator inputs such as `<NEW_GAMEPLAY_PROJECT_REF>`; no implementation behavior is left unspecified.
- Type consistency: `RoundScoringPort`, `GameplayRoundScoringInput`, and `GameplayRoundScoringResult` are defined once in Task 3 and used consistently by the adapter, engine, and tests.
- Scope: tasks are ordered so each reviewer can accept or reject the score boundary, frontend artifact, database workspace, deployment guard, or hosted rollout independently.
