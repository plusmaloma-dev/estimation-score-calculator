# React/Vite Frontend Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working mobile-first React/Vite Estimation score calculator that uses the existing framework-neutral engine, preserves previous rounds in a player-column score sheet, supports English/Arabic, and provides controlled past-round score overrides with cumulative recalculation.

**Architecture:** Keep the existing domain, scoring, persistence, statistics, and `BrowserUiShellService` modules framework-neutral. Add a React application under `src/app/`, a dedicated UI test project using Vitest and jsdom, and a small override service in the engine layer so React never implements scoring formulas. Persist only completed rounds and override metadata; keep current-round drafts in React state.

**Tech Stack:** Node.js 22, TypeScript, React 19, React DOM 19, Vite, Vitest, jsdom, React Testing Library, CSS modules/plain CSS, existing `node:test` engine tests.

## Global Constraints

- Preserve all existing House Rules V1 and Federation 2026 scoring behavior.
- Total estimates must never equal 13.
- Actual tricks must total 13 before saving a completed round.
- Players remain columns and rounds remain rows.
- The bid winner alone displays the trump marker beside the estimate.
- O/U equals total estimates minus 13.
- English is the default; Arabic uses document-level RTL.
- Same dealer and same round number are retained after Federation all-pass.
- Cumulative totals are derived and cannot be edited directly.
- A manual applied score differing from the calculated score requires a reason.
- Original calculated scores and override audit metadata remain recoverable.
- Every task follows red-green-refactor and ends with a commit.

---

## File Map

### Toolchain and entry point

- Modify: `package.json` — add React/Vite/Vitest scripts and dependencies while preserving engine scripts.
- Modify: `tsconfig.json` — convert to project references.
- Create: `tsconfig.engine.json` — existing framework-neutral engine and `node:test` compilation.
- Create: `tsconfig.app.json` — browser/React TSX compilation.
- Create: `tsconfig.node.json` — Vite/Vitest configuration typing.
- Create: `vite.config.ts` — Vite React build configuration.
- Create: `vitest.config.ts` — jsdom component-test configuration.
- Create: `index.html` — browser root.
- Create: `src/app/main.tsx` — React root bootstrap.
- Create: `src/app/test/setup.ts` — jest-dom and cleanup setup.

### Application composition

- Create: `src/app/App.tsx` — route-level application composition.
- Create: `src/app/AppContext.tsx` — reducer-based UI state and service injection.
- Create: `src/app/appTypes.ts` — UI route, draft, language, and ranking types.
- Create: `src/app/i18n/translations.ts` — English and Arabic dictionaries.
- Create: `src/app/i18n/I18nContext.tsx` — language switch and `dir` synchronization.
- Create: `src/app/services/createBrowserServices.ts` — local-storage repository and browser-shell construction.
- Create: `src/app/styles/app.css` — responsive app shell and reusable tokens.

### Screens and score sheet

- Create: `src/app/screens/HomeScreen.tsx` — recent sessions and new-game navigation.
- Create: `src/app/screens/NewGameScreen.tsx` — four-player and rule-set setup.
- Create: `src/app/screens/ScoreSheetScreen.tsx` — game header, score table, and current-round actions.
- Create: `src/app/components/RankingBadge.tsx` — KING/Sub-King/Sub-Kooz/Kooz approved icon treatment.
- Create: `src/app/components/ScoreSheetTable.tsx` — player-column/round-row table.
- Create: `src/app/components/CurrentRoundRow.tsx` — estimates, actuals, O/U, validation, and save.
- Create: `src/app/components/FederationAuctionPanel.tsx` — pass/bid actions and all-pass redeal state.
- Create: `src/app/scoreSheet/scoreSheetViewModel.ts` — dealer, O/U, ranking, suit, and row derivation.
- Create: `src/app/scoreSheet/currentRoundReducer.ts` — editable current-round draft state.

### Override engine and UI

- Modify: `src/persistence/types.ts` — persist override audit metadata.
- Create: `src/services/RoundScoreOverrideService.ts` — validate and apply selected-player overrides.
- Modify: `src/ui/BrowserUiShellService.ts` — expose edit-round and restore-calculated-score operations.
- Modify: `src/index.ts` — export override types/service.
- Create: `src/app/components/RoundEditDialog.tsx` — selected-player manual applied-score editing.
- Modify: `src/importExport/types.ts` — preserve override metadata in backup documents.
- Modify: `src/importExport/ScoreSheetBackupService.ts` — import/export override metadata.
- Modify: `src/richExport/ScoreSheetCsvExportService.ts` — identify overridden values and reasons.

### Tests

- Create: `tests/roundScoreOverride.test.ts` — engine override and downstream cumulative recalculation.
- Create: `tests/browserUiRoundEdit.test.ts` — browser-shell integration and persistence.
- Create: `src/app/**/*.test.tsx` — component/integration tests colocated with React files.

---

### Task 1: React/Vite and Dual Test Harness

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tsconfig.engine.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/app/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/test/setup.ts`
- Create: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: existing exported engine APIs from `src/index.ts`.
- Produces: `App`, a browser entry point, `npm run dev`, `npm run test:ui`, and a unified `npm run ci`.

- [ ] **Step 1: Write the failing React smoke test**

```tsx
// src/app/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App', () => {
  it('renders the Estimation application heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Estimation' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the UI test and verify the red state**

Run:

```bash
npm run test:ui -- src/app/App.test.tsx
```

Expected: command or module resolution failure because the React/Vitest harness and `App` do not exist.

- [ ] **Step 3: Install the browser dependencies**

Run:

```bash
npm install react@19 react-dom@19
npm install --save-dev vite@latest @vitejs/plugin-react@latest vitest@latest jsdom@latest @testing-library/react@latest @testing-library/dom@latest @testing-library/user-event@latest @testing-library/jest-dom@latest @types/react@latest @types/react-dom@latest
```

Expected: `package.json` and `package-lock.json` updated without audit-blocking installation errors.

- [ ] **Step 4: Split TypeScript configuration**

```json
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.engine.json" },
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

```json
// tsconfig.engine.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "composite": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["src/app/**/*"]
}
```

```json
// tsconfig.app.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "composite": true
  },
  "include": ["src/app/**/*.ts", "src/app/**/*.tsx", "src/**/*.ts"]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "composite": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: Add Vite and Vitest configuration**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-app' },
});
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/app/test/setup.ts'],
    include: ['src/app/**/*.test.ts', 'src/app/**/*.test.tsx'],
  },
});
```

```ts
// src/app/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

- [ ] **Step 6: Add the minimal application entry**

```tsx
// src/app/App.tsx
export function App() {
  return <h1>Estimation</h1>;
}
```

```tsx
// src/app/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/app.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Root element not found.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Estimation Score Calculator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Update package scripts without removing engine coverage**

```json
{
  "scripts": {
    "clean": "node -e \"fs.rmSync('dist', { recursive: true, force: true }); fs.rmSync('dist-app', { recursive: true, force: true })\"",
    "dev": "vite",
    "typecheck:engine": "tsc -p tsconfig.engine.json --noEmit",
    "typecheck:app": "tsc -p tsconfig.app.json --noEmit",
    "typecheck": "npm run typecheck:engine && npm run typecheck:app",
    "test:engine": "npm run clean && tsc -p tsconfig.engine.json --outDir dist && node --test dist/tests/*.test.js",
    "test:ui": "vitest run",
    "test": "npm run test:engine && npm run test:ui",
    "build": "vite build",
    "ci": "npm run typecheck && npm test && npm run build"
  }
}
```

- [ ] **Step 8: Verify green and commit**

Run:

```bash
npm run ci
```

Expected: all existing engine tests pass, the React smoke test passes, and `dist-app/` is built.

Commit:

```bash
git add package.json package-lock.json tsconfig*.json vite.config.ts vitest.config.ts index.html src/app
git commit -m "feat: add React Vite application foundation"
```

---

### Task 2: Bilingual Session Home and New Game Setup

**Files:**
- Create: `src/app/appTypes.ts`
- Create: `src/app/AppContext.tsx`
- Create: `src/app/i18n/translations.ts`
- Create: `src/app/i18n/I18nContext.tsx`
- Create: `src/app/services/createBrowserServices.ts`
- Create: `src/app/screens/HomeScreen.tsx`
- Create: `src/app/screens/NewGameScreen.tsx`
- Modify: `src/app/App.tsx`
- Create: `src/app/screens/HomeScreen.test.tsx`
- Create: `src/app/screens/NewGameScreen.test.tsx`
- Create: `src/app/i18n/I18nContext.test.tsx`

**Interfaces:**
- Consumes: `LocalStorageScoreSheetRepository`, `BrowserUiShellService`, `HOUSE_RULES_V1`, and `FEDERATION_2026` from `src/index.ts`.
- Produces: service-injected app context, `home | new-game | score-sheet` routes, language persistence, and score-sheet creation.

- [ ] **Step 1: Write failing user-facing tests**

```tsx
it('defaults to English and switches the document to Arabic RTL', async () => {
  const user = userEvent.setup();
  render(<TestI18n><LanguageProbe /></TestI18n>);
  expect(document.documentElement.lang).toBe('en');
  await user.click(screen.getByRole('button', { name: 'العربية' }));
  expect(document.documentElement.lang).toBe('ar');
  expect(document.documentElement.dir).toBe('rtl');
});
```

```tsx
it('lists all four players when creating a game', async () => {
  const user = userEvent.setup();
  render(<NewGameScreen />);
  await user.type(screen.getByLabelText('Player 1'), 'Ahmed');
  await user.type(screen.getByLabelText('Player 2'), 'Mona');
  await user.type(screen.getByLabelText('Player 3'), 'Rami');
  await user.type(screen.getByLabelText('Player 4'), 'Dina');
  await user.click(screen.getByRole('button', { name: 'Create game' }));
  expect(mockCreateScoreSheet).toHaveBeenCalledWith(expect.objectContaining({
    players: [
      { id: 'player-1', name: 'Ahmed' },
      { id: 'player-2', name: 'Mona' },
      { id: 'player-3', name: 'Rami' },
      { id: 'player-4', name: 'Dina' },
    ],
  }));
});
```

- [ ] **Step 2: Run tests and verify missing contexts/screens**

Run:

```bash
npm run test:ui -- src/app/i18n/I18nContext.test.tsx src/app/screens/HomeScreen.test.tsx src/app/screens/NewGameScreen.test.tsx
```

Expected: FAIL because the contexts and screens do not exist.

- [ ] **Step 3: Implement translations and document direction**

```ts
// src/app/i18n/translations.ts
export const translations = {
  en: {
    appName: 'Estimation', newGame: 'Start a new game', recentGames: 'Recent games',
    createGame: 'Create game', houseRules: 'House Rules V1', federation: 'Federation 2026',
    player: 'Player', gameName: 'Game name', continueGame: 'Continue game',
  },
  ar: {
    appName: 'إستيميشن', newGame: 'ابدأ لعبة جديدة', recentGames: 'الألعاب الأخيرة',
    createGame: 'إنشاء اللعبة', houseRules: 'قواعد المنزل V1', federation: 'اتحاد 2026',
    player: 'اللاعب', gameName: 'اسم اللعبة', continueGame: 'متابعة اللعبة',
  },
} as const;

export type Language = keyof typeof translations;
```

```tsx
// core of I18nContext.tsx
useEffect(() => {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  localStorage.setItem('estimation-language', language);
}, [language]);
```

- [ ] **Step 4: Construct browser services once**

```ts
// src/app/services/createBrowserServices.ts
import { BrowserUiShellService, LocalStorageScoreSheetRepository } from '../../index.js';

export function createBrowserServices(storage: Storage = window.localStorage) {
  const repository = new LocalStorageScoreSheetRepository(storage);
  return { repository, shell: new BrowserUiShellService(repository) };
}
```

- [ ] **Step 5: Implement route context, home, and setup**

Use a reducer with these actions:

```ts
type AppAction =
  | { type: 'navigate'; route: 'home' | 'new-game' | 'score-sheet' }
  | { type: 'open-score-sheet'; scoreSheetId: string };
```

On game creation, call:

```ts
const result = shell.createScoreSheet({
  name: gameName,
  ruleSet,
  players: names.map((name, index) => ({ id: `player-${index + 1}`, name })),
});
if (result.valid && result.scoreSheet) openScoreSheet(result.scoreSheet.id);
else setErrors(result.errors);
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run test:ui
npm run typecheck
```

Expected: language, home, and setup tests pass; engine typecheck remains green.

Commit:

```bash
git add src/app
 git commit -m "feat: add bilingual session and game setup flow"
```

---

### Task 3: Score-Sheet View Model and Responsive History Table

**Files:**
- Create: `src/app/scoreSheet/scoreSheetViewModel.ts`
- Create: `src/app/components/RankingBadge.tsx`
- Create: `src/app/components/ScoreSheetTable.tsx`
- Create: `src/app/screens/ScoreSheetScreen.tsx`
- Modify: `src/app/styles/app.css`
- Create: `src/app/scoreSheet/scoreSheetViewModel.test.ts`
- Create: `src/app/components/ScoreSheetTable.test.tsx`

**Interfaces:**
- Consumes: `UiOpenSessionResult`, `UiRoundHistoryEntry`, leaderboard entries, and persisted player order.
- Produces: `ScoreSheetViewModel`, dealer calculation, O/U text, ranking titles, suit/annotation labels, and semantic table rendering.

- [ ] **Step 1: Write failing view-model tests**

```ts
it('derives the dealer from round number and player order', () => {
  expect(resolveDealer(['Ahmed', 'Mona', 'Rami', 'Dina'], 11)).toBe('Rami');
});

it('calculates O/U and rejects zero', () => {
  expect(calculateOverUnder([3, 2, 4, 5])).toEqual({ valid: true, value: 1, label: '+1' });
  expect(calculateOverUnder([3, 3, 3, 4])).toEqual({
    valid: false,
    value: 0,
    label: '0',
    error: 'Total estimates cannot equal 13.',
  });
});

it('renders combined bid annotations', () => {
  expect(formatEstimate({ tricks: 4, trump: 'hearts', riskMultiplier: 2, withCall: true }))
    .toBe('4♥ 2R W');
});
```

- [ ] **Step 2: Run and verify red**

Run:

```bash
npm run test:ui -- src/app/scoreSheet/scoreSheetViewModel.test.ts
```

Expected: FAIL because the helper functions do not exist.

- [ ] **Step 3: Implement pure view-model helpers**

```ts
export function resolveDealer(playerOrder: readonly string[], roundNumber: number): string {
  if (playerOrder.length === 0) throw new Error('Player order is required.');
  if (!Number.isInteger(roundNumber) || roundNumber < 1) throw new Error('Round number must be positive.');
  return playerOrder[(roundNumber - 1) % playerOrder.length];
}

export function calculateOverUnder(estimates: readonly number[]) {
  const value = estimates.reduce((sum, estimate) => sum + estimate, 0) - 13;
  return value === 0
    ? { valid: false as const, value, label: '0', error: 'Total estimates cannot equal 13.' }
    : { valid: true as const, value, label: value > 0 ? `+${value}` : String(value) };
}
```

Suit mapping:

```ts
const suitSymbols = { noTrump: 'NT', spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' } as const;
```

- [ ] **Step 4: Implement ranking badges**

Render the approved icon treatments with accessible names:

```tsx
<RankingBadge rank="king" label="KING" />
<RankingBadge rank="sub-king" label="Sub-King" />
<RankingBadge rank="sub-kooz" label="Sub-Kooz" />
<RankingBadge rank="kooz" label="Kooz" />
```

The Sub-Kooz and Kooz badge marks use CSS-drawn horizontal cup/jug symbols inside beige and charcoal circles respectively; do not substitute trophy icons.

- [ ] **Step 5: Implement the semantic score table**

Required column structure:

```tsx
<table>
  <thead>
    <tr>
      <th rowSpan={2}>Round</th>
      {players.map((player) => <th key={player.id} colSpan={4}>{/* badge, name, total */}</th>)}
      <th rowSpan={2}>O/U</th>
    </tr>
    <tr>{players.flatMap((player) => ['Estimate', 'Actual', 'Round score', 'Total'].map(...))}</tr>
  </thead>
  <tbody>{completedRows}{currentRow}</tbody>
</table>
```

Use a sticky first column and sticky two-row header. Wrap the table in an overflow container for mobile horizontal scrolling.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run test:ui -- src/app/scoreSheet/scoreSheetViewModel.test.ts src/app/components/ScoreSheetTable.test.tsx
npm run typecheck
```

Expected: view-model and semantic table tests pass.

Commit:

```bash
git add src/app
 git commit -m "feat: add responsive live score sheet history"
```

---

### Task 4: Current Round Entry, Validation, and Federation Redeal

**Files:**
- Create: `src/app/scoreSheet/currentRoundReducer.ts`
- Create: `src/app/components/CurrentRoundRow.tsx`
- Create: `src/app/components/FederationAuctionPanel.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.tsx`
- Create: `src/app/scoreSheet/currentRoundReducer.test.ts`
- Create: `src/app/components/CurrentRoundRow.test.tsx`
- Create: `src/app/components/FederationAuctionPanel.test.tsx`

**Interfaces:**
- Consumes: `BrowserUiShellService.previewRound`, `saveRound`, and `resolveFederationAuction`.
- Produces: draft estimates/actuals, trump/Risk/With annotations, validation summary, calculated preview, saved round, and redeal state.

- [ ] **Step 1: Write failing reducer and interaction tests**

```ts
it('does not allow calculation until all actual tricks total 13', () => {
  const state = reduce(initialState, { type: 'set-actual', playerId: 'p1', tricks: 4 });
  expect(selectCanCalculate(state)).toBe(false);
});
```

```tsx
it('shows redeal guidance after four Federation passes', async () => {
  const user = userEvent.setup();
  render(<FederationAuctionPanel playerIds={['p1','p2','p3','p4']} />);
  for (const name of ['p1','p2','p3','p4']) await user.click(screen.getByRole('button', { name: `Pass ${name}` }));
  expect(screen.getByText('Redeal required')).toBeInTheDocument();
  expect(screen.getByText('Same dealer · Same round')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify red**

Run:

```bash
npm run test:ui -- src/app/scoreSheet/currentRoundReducer.test.ts src/app/components/CurrentRoundRow.test.tsx src/app/components/FederationAuctionPanel.test.tsx
```

Expected: FAIL because the current-round modules do not exist.

- [ ] **Step 3: Implement draft state**

```ts
export interface CurrentRoundDraft {
  readonly roundNumber: number;
  readonly estimates: Readonly<Record<string, number | undefined>>;
  readonly actuals: Readonly<Record<string, number | undefined>>;
  readonly bidWinnerPlayerId?: string;
  readonly trump?: 'noTrump' | 'spades' | 'hearts' | 'diamonds' | 'clubs';
  readonly riskPlayerId?: string;
  readonly riskMultiplier?: number;
  readonly withPlayerIds: readonly string[];
}
```

The reducer updates one field at a time and never writes persistence.

- [ ] **Step 4: Convert draft to engine input and preview**

Build `UiRoundEntryInput` only when:

```ts
const estimateTotal = bids.reduce((sum, bid) => sum + bid.tricks, 0);
const actualTotal = actualResults.reduce((sum, result) => sum + result.actualTricks, 0);
if (estimateTotal === 13) return ['Total estimates cannot equal 13.'];
if (actualTotal !== 13) return ['Actual tricks must total 13.'];
```

Call `shell.previewRound(input)` first. Enable save only when preview is valid.

- [ ] **Step 5: Save and refresh history**

On successful save:

```ts
const result = shell.saveRound(scoreSheetId, input);
if (result.valid) {
  dispatch({ type: 'reset-for-next-round', roundNumber: input.roundNumber + 1 });
  reloadSession(scoreSheetId);
}
```

- [ ] **Step 6: Implement Federation all-pass handling**

For four pass actions call `resolveFederationAuction`. On `redeal-required`, clear auction actions while preserving `roundNumber` and `dealerPlayerId`; do not call `saveRound`.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm run ci
```

Expected: all engine and UI tests pass and the app builds.

Commit:

```bash
git add src/app
 git commit -m "feat: add current round scoring and Federation redeal"
```

---

### Task 5: Engine-Level Manual Round Score Overrides

**Files:**
- Modify: `src/persistence/types.ts`
- Create: `src/services/RoundScoreOverrideService.ts`
- Modify: `src/ui/BrowserUiShellService.ts`
- Modify: `src/index.ts`
- Create: `tests/roundScoreOverride.test.ts`
- Create: `tests/browserUiRoundEdit.test.ts`

**Interfaces:**
- Consumes: persisted `MvpGameInput`, calculated `MvpGameResult`, repository save/get operations, and selected-player applied scores.
- Produces: persisted override audit records, recalculated cumulative results, updated leaderboard, and restore operation.

- [ ] **Step 1: Write the failing engine tests**

```ts
it('requires a reason when an applied score differs from calculated score', () => {
  const result = service.apply({
    scoreSheet,
    roundNumber: 2,
    overrides: [{ playerId: 'p1', appliedScore: 12, reason: '' }],
    changedAtIso: '2026-07-22T12:00:00.000Z',
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Override reason is required for player p1.']);
});
```

```ts
it('recalculates every following cumulative total and ranking', () => {
  const result = service.apply({
    scoreSheet: threeRoundScoreSheet,
    roundNumber: 1,
    overrides: [{ playerId: 'p1', appliedScore: 20, reason: 'Ad-hoc table decision' }],
    changedAtIso: '2026-07-22T12:00:00.000Z',
  });
  assert.equal(result.valid, true);
  assert.equal(result.scoreSheet?.gameResult?.rounds[2].balancesByPlayer.p1, expectedRoundThreeBalance);
  assert.equal(result.scoreSheet?.gameResult?.leaderboard[0].playerId, 'p1');
});
```

- [ ] **Step 2: Run and verify red**

Run:

```bash
npm run test:engine -- tests/roundScoreOverride.test.ts tests/browserUiRoundEdit.test.ts
```

Expected: compile failure because override types and service do not exist.

- [ ] **Step 3: Add persisted audit types**

```ts
export interface PlayerRoundScoreOverride {
  readonly playerId: string;
  readonly calculatedScore: number;
  readonly appliedScore: number;
  readonly reason: string;
  readonly changedAtIso: string;
}

export interface RoundScoreOverrideRecord {
  readonly roundNumber: number;
  readonly players: readonly PlayerRoundScoreOverride[];
}
```

Add to `PersistedScoreSheet` and `SaveScoreSheetInput`:

```ts
readonly roundScoreOverrides?: readonly RoundScoreOverrideRecord[];
```

- [ ] **Step 4: Implement override validation and applied-score projection**

The service must:

1. Find the completed round by one-based `roundNumber`.
2. Validate unique known player ids and integer applied scores.
3. Require trimmed reason only when applied differs from calculated.
4. Normalize unchanged values by removing their override.
5. Preserve calculated round scores.
6. Rebuild applied cumulative balances from round 1 onward.
7. Rebuild leaderboard from final applied balances.

Expose:

```ts
apply(input: ApplyRoundScoreOverridesInput): ApplyRoundScoreOverridesResult;
restore(input: RestoreRoundScoreOverridesInput): ApplyRoundScoreOverridesResult;
```

- [ ] **Step 5: Add browser-shell edit operations**

```ts
editRoundScores(
  scoreSheetId: string,
  roundNumber: number,
  overrides: readonly UiPlayerScoreOverrideInput[],
  nowIso?: string,
): UiEditRoundScoresResult
```

```ts
restoreCalculatedRoundScores(
  scoreSheetId: string,
  roundNumber: number,
  nowIso?: string,
): UiEditRoundScoresResult
```

Both methods load, validate, save once, and return the refreshed score sheet/game result. Invalid edits do not call repository save.

- [ ] **Step 6: Run all engine tests and commit**

Run:

```bash
npm run test:engine
npm run typecheck:engine
```

Expected: existing 128+ tests and new override tests pass.

Commit:

```bash
git add src/persistence/types.ts src/services/RoundScoreOverrideService.ts src/ui/BrowserUiShellService.ts src/index.ts tests
 git commit -m "feat: add audited round score overrides"
```

---

### Task 6: Round Edit Dialog and Derived Recalculation UI

**Files:**
- Create: `src/app/components/RoundEditDialog.tsx`
- Modify: `src/app/components/ScoreSheetTable.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.tsx`
- Create: `src/app/components/RoundEditDialog.test.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes: `BrowserUiShellService.editRoundScores` and `restoreCalculatedRoundScores`.
- Produces: selected-player overrides, required reason, audit marker, refresh of cumulative totals and ranks.

- [ ] **Step 1: Write failing dialog tests**

```tsx
it('allows a selected-player override and requires a reason', async () => {
  const user = userEvent.setup();
  render(<RoundEditDialog round={round} players={players} />);
  await user.clear(screen.getByLabelText('Ahmed applied score'));
  await user.type(screen.getByLabelText('Ahmed applied score'), '12');
  await user.click(screen.getByRole('button', { name: 'Save and recalculate' }));
  expect(screen.getByText('Reason is required for Ahmed.')).toBeInTheDocument();
});
```

```tsx
it('refreshes later totals and ranking after save', async () => {
  mockEditRoundScores.mockReturnValue({ valid: true, errors: [], scoreSheet: recalculated });
  // submit override
  expect(await screen.findByText('Total 92')).toBeInTheDocument();
  expect(screen.getByLabelText('KING: Ahmed')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify red**

Run:

```bash
npm run test:ui -- src/app/components/RoundEditDialog.test.tsx
```

Expected: FAIL because the dialog does not exist.

- [ ] **Step 3: Implement accessible dialog state**

Each player row displays calculated score, editable applied score, and reason. Submit only changed players:

```ts
const overrides = rows
  .filter((row) => row.appliedScore !== row.calculatedScore)
  .map((row) => ({
    playerId: row.playerId,
    appliedScore: row.appliedScore,
    reason: row.reason.trim(),
  }));
```

- [ ] **Step 4: Add history-row edit and audit markers**

Every completed round gets an `Edit round N` button. Overridden scores display an indicator and expandable details containing calculated, applied, reason, and timestamp.

- [ ] **Step 5: Refresh all derived UI after save or restore**

After a successful mutation, call `openSession(scoreSheetId)` and replace the complete session model. Do not patch totals locally.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run ci
```

Expected: all tests and production build pass.

Commit:

```bash
git add src/app
 git commit -m "feat: add round edit and score override interface"
```

---

### Task 7: Backup, CSV, Responsive Polish, and Acceptance Verification

**Files:**
- Modify: `src/importExport/types.ts`
- Modify: `src/importExport/ScoreSheetBackupService.ts`
- Modify: `src/richExport/ScoreSheetCsvExportService.ts`
- Modify: `src/app/styles/app.css`
- Modify: `README.md`
- Modify: `BACKLOG.md`
- Modify: `PROJECT_LOG.md`
- Add/modify relevant export and app tests.

**Interfaces:**
- Consumes: persisted override records and completed UI flows.
- Produces: round-trip backups, audit-aware CSV, mobile/landscape completion, and project records.

- [ ] **Step 1: Write failing backup and CSV tests**

```ts
it('round-trips override metadata through backup export and import', () => {
  const document = service.exportScoreSheets({ scoreSheets: [overriddenScoreSheet], source: 'test' });
  const imported = service.importScoreSheets(document);
  assert.deepEqual(imported.scoreSheets[0].roundScoreOverrides, overriddenScoreSheet.roundScoreOverrides);
});
```

```ts
it('exports calculated score, applied score, reason, and changed timestamp', () => {
  const csv = csvService.export(overriddenScoreSheet);
  assert.match(csv, /calculatedScore,appliedScore,overrideReason,overrideChangedAt/);
  assert.match(csv, /14,12,Missing house rule,2026-07-22T12:00:00.000Z/);
});
```

- [ ] **Step 2: Run and verify red**

Run:

```bash
npm run test:engine
```

Expected: new export assertions fail because audit fields are not serialized.

- [ ] **Step 3: Preserve audit metadata in backup and CSV**

Backup documents carry `roundScoreOverrides` unchanged. CSV emits calculated and applied values separately and leaves override fields empty for non-overridden rows.

- [ ] **Step 4: Complete responsive and accessibility styling**

Verify:

- 390px portrait: sticky round column and horizontal player scroll.
- 844px landscape: all four players visible when space permits.
- Keyboard: language switch, game setup, current row, dialog, and save controls reachable.
- Screen readers: suit and rank labels announced; success/failure is not color-only.
- Arabic: header, controls, and table direction remain usable under `dir="rtl"`.

- [ ] **Step 5: Update documentation and backlog**

README commands:

```bash
npm install
npm run dev
npm run ci
```

Mark US-220 done only after acceptance tests and final CI pass. Record PR, CI run, and merge evidence in `PROJECT_LOG.md` after integration.

- [ ] **Step 6: Final verification**

Run:

```bash
npm run ci
```

Manual browser acceptance:

1. Create four-player House game.
2. Save a valid round and confirm previous-round row.
3. Confirm O/U is non-zero and correct.
4. Confirm only winner estimate shows trump.
5. Switch Arabic and verify RTL.
6. Create Federation game and trigger all-pass redeal.
7. Override one past score with reason.
8. Confirm later cumulative totals and ranking change.
9. Restore calculated score.
10. Reload browser and confirm persistence.
11. Export/import backup and inspect CSV override fields.

Expected: all eleven acceptance checks pass.

- [ ] **Step 7: Commit**

```bash
git add src tests README.md BACKLOG.md PROJECT_LOG.md
 git commit -m "feat: complete React Estimation score calculator prototype"
```

---

## Self-Review Result

- **Spec coverage:** All approved requirements map to Tasks 1–7: app foundation, bilingual session flow, player-column history table, current round, O/U, dealer rotation, trump/Risk/With annotations, Federation all-pass, ranking badges, manual overrides, downstream recalculation, audit exports, and responsive/accessibility behavior.
- **Placeholder scan:** No TBD, TODO, “similar to”, or unspecified error-handling steps remain.
- **Type consistency:** `PlayerRoundScoreOverride`, `RoundScoreOverrideRecord`, `editRoundScores`, and `restoreCalculatedRoundScores` use consistent names across persistence, service, browser shell, UI, tests, and exports.
