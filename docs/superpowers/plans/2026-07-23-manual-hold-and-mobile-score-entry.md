# Manual Hold and Mobile Score Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inferred Follow/Hold prompts with an explicit Hold toggle, require landscape for mobile score sheets, and replace mobile score-field keyboards with a centered number picker.

**Architecture:** Keep one Hold source of truth in `BiddingState.statusByPlayerId`, remove pending Follow/Hold state, and derive WITH, Risk, serialization, and history from finalized bidding status. Isolate coarse-pointer and portrait detection in one media-query hook, use a controlled portal dialog for mobile numeric entry, and overlay the valid active score sheet in portrait without unmounting it. Both desktop and mobile entry dispatch the existing reducer actions, preserving identical local and online data flows.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, Vite, Supabase RPC integration, Vercel Preview

## Global Constraints

- Individual estimates remain integers from 0 through 12.
- The total of all four estimates must not equal 13.
- Hold is never inferred or automatically selected.
- Hold is available only for a positive-estimate non-owner before estimates are accepted.
- A manually selected Hold survives estimate and trump changes while its player remains eligible.
- Hold clears only when the user toggles it off, the estimate becomes zero/blank, or the player becomes bid owner.
- Hold keeps existing normal scoring and remains excluded from Risk candidacy and multiple-WITH counts.
- Do not change Supabase schema or RPC signatures.
- Preserve synchronous local-browser mode and asynchronous online mode.
- Require landscape only for the active score sheet on coarse-primary-pointer devices.
- Keep sign-in, player/game lists, setup, and other non-score-sheet screens usable in portrait.
- Mobile estimates use a centered `0`–`12` picker; mobile actual tricks use a centered `0`–`13` picker.
- Never focus a numeric text input for mobile estimate or actual-trick entry.
- Preserve desktop keyboard entry on fine-primary-pointer devices.
- Do not merge to `main`.
- Do not report completion until `npm run ci` passes and the stable deployed UAT is opened and smoke-tested.

---

### Task 0: Checkpoint the Completed Online UAT Foundation

**Files:**
- Commit: `.github/workflows/ci.yml`
- Commit: `.gitignore`
- Commit: `README.md`
- Commit: `docs/UAT_DEPLOYMENT.md`
- Commit: `package-lock.json`
- Commit: `src/app/App.tsx`
- Commit: `src/app/AppContext.tsx`
- Commit: `src/app/screens/ScoreSheetLifecycleScreen.test.tsx`
- Commit: `src/app/screens/ScoreSheetScreen.tsx`
- Commit: `src/online/games/OnlineBrowserShellService.test.ts`
- Commit: `src/online/games/OnlineBrowserShellService.ts`
- Commit: `src/online/games/OnlineGameService.test.ts`
- Commit: `src/online/games/OnlineGameService.ts`
- Commit: `src/ui/BrowserUiShellService.ts`
- Commit: `supabase/.gitignore`
- Commit: `supabase/config.toml`
- Commit: `supabase/migrations/202607230003_online_uat_rpc.sql`
- Commit: `supabase/migrations/202607230004_fix_rpc_column_ambiguity.sql`
- Commit: `tests/deploymentConfiguration.test.ts`
- Commit: `tests/onlineUatLifecycleSchema.test.ts`
- Commit: `vercel.json`
- Commit: `vitest.config.ts`

**Interfaces:**
- Consumes: the already CI-passing complete snapshot RPC, asynchronous online
  integration, migration fixes, and UAT deployment configuration.
- Produces: a clean, reviewable baseline commit before Hold and mobile files
  are changed.
- Excludes: the unrelated zero-byte files
  `estimation-score-calculator@0.1.0`, `node`, `npm`, and `tsc`.

- [ ] **Step 1: Verify the branch and intended baseline diff**

Run:

```powershell
git branch --show-current
git status --short
git diff --check
```

Expected:

- branch is exactly `feature/react-vite-frontend-prototype`;
- only the listed UAT foundation files and the four excluded zero-byte files
  are present;
- `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Re-run the baseline CI gate**

Run:

```powershell
npm run ci
```

Expected: engine typecheck, app typecheck, engine tests, UI tests, and the Vite
production build all PASS. The existing bundle-size warning may remain.

- [ ] **Step 3: Stage only the completed UAT foundation**

Run:

```powershell
git add -- .github/workflows/ci.yml .gitignore README.md docs/UAT_DEPLOYMENT.md package-lock.json src/app/App.tsx src/app/AppContext.tsx src/app/screens/ScoreSheetLifecycleScreen.test.tsx src/app/screens/ScoreSheetScreen.tsx src/online/games/OnlineBrowserShellService.test.ts src/online/games/OnlineBrowserShellService.ts src/online/games/OnlineGameService.test.ts src/online/games/OnlineGameService.ts src/ui/BrowserUiShellService.ts supabase/.gitignore supabase/config.toml supabase/migrations/202607230003_online_uat_rpc.sql supabase/migrations/202607230004_fix_rpc_column_ambiguity.sql tests/deploymentConfiguration.test.ts tests/onlineUatLifecycleSchema.test.ts vercel.json vitest.config.ts
git diff --cached --check
git status --short
```

Expected:

- every listed UAT foundation file is staged;
- the four excluded zero-byte files are not staged;
- the staged diff has no whitespace errors.

- [ ] **Step 4: Commit the verified baseline**

Run:

```powershell
git commit -m "feat: complete online UAT foundation"
```

Expected: one commit containing only the verified online UAT foundation.

---

### Task 1: Replace Pending Follow/Hold With Explicit State

**Files:**
- Modify: `src/app/scoreSheet/biddingState.ts`
- Modify: `src/app/scoreSheet/biddingState.test.ts`
- Modify: `src/app/scoreSheet/currentRoundReducer.ts`
- Modify: `src/app/scoreSheet/currentRoundReducer.test.ts`

**Interfaces:**
- Consumes: `BiddingState`, `BiddingPlayerStatus`, `setBiddingEstimate`, `setBiddingTrump`, `confirmBidding`.
- Produces: `toggleBiddingHold(state: BiddingState, playerId: string): BiddingState` and reducer action `{ type: 'toggle-hold'; playerId: string }`.
- Removes: `pendingDecisionPlayerIds`, `previousWithEstimateByPlayerId`, `resolveFollow`, `resolveHold`, `pendingWithDecisionPlayerIds`, and the `follow-with` / `hold-with` reducer actions.

- [ ] **Step 1: Write failing state-machine tests for manual Hold**

Replace the pending-decision tests in `biddingState.test.ts` with explicit manual-Hold cases:

```ts
import {
  confirmBidding,
  createBiddingState,
  resolveMultipleWithMultiplier,
  resolveRiskPlayerId,
  setBiddingEstimate,
  setBiddingTrump,
  toggleBiddingHold,
} from './biddingState.js';

it('selects Hold only through an explicit non-owner toggle and can remove it', () => {
  let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
  state = setBiddingEstimate(state, 'P1', 5);
  state = setBiddingTrump(state, 'hearts');
  state = setBiddingEstimate(state, 'P3', 5);

  expect(state.statusByPlayerId.P3).toBe('with');
  state = toggleBiddingHold(state, 'P3');
  expect(state.statusByPlayerId.P3).toBe('hold');
  expect(state.estimatesByPlayerId.P3).toBe(5);

  state = toggleBiddingHold(state, 'P3');
  expect(state.statusByPlayerId.P3).toBe('with');
});

it('keeps manual Hold through owner estimate and trump changes without inferring new Holds', () => {
  let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
  state = setBiddingEstimate(state, 'P1', 4);
  state = setBiddingTrump(state, 'hearts');
  state = setBiddingEstimate(state, 'P3', 4);
  state = toggleBiddingHold(state, 'P3');

  state = setBiddingEstimate(state, 'P1', 5);
  state = setBiddingTrump(state, 'spades');

  expect(state.statusByPlayerId.P3).toBe('hold');
  expect(state.estimatesByPlayerId.P3).toBe(4);
  expect(state.statusByPlayerId.P4).toBe('normal');
  expect(confirmBidding(state).errors).toEqual([]);
});

it('clears Hold when its estimate is removed or its player becomes owner', () => {
  let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
  state = setBiddingEstimate(state, 'P1', 5);
  state = setBiddingEstimate(state, 'P3', 3);
  state = toggleBiddingHold(state, 'P3');

  state = setBiddingEstimate(state, 'P3', undefined);
  expect(state.statusByPlayerId.P3).toBe('normal');

  state = setBiddingEstimate(state, 'P3', 3);
  state = toggleBiddingHold(state, 'P3');
  state = setBiddingEstimate(state, 'P3', 0);
  expect(state.statusByPlayerId.P3).toBe('normal');

  state = setBiddingEstimate(state, 'P3', 3);
  state = toggleBiddingHold(state, 'P3');
  state = setBiddingEstimate(state, 'P3', 6);
  expect(state.bidOwnerPlayerId).toBe('P3');
  expect(state.statusByPlayerId.P3).toBe('normal');
});

it('moves Risk past an explicitly selected Hold and excludes it from multiple WITH', () => {
  let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
  state = setBiddingEstimate(state, 'P1', 5);
  state = setBiddingTrump(state, 'clubs');
  state = setBiddingEstimate(state, 'P2', 2);
  state = setBiddingEstimate(state, 'P3', 5);
  state = setBiddingEstimate(state, 'P4', 5);

  expect(resolveRiskPlayerId(state)).toBe('P4');
  expect(resolveMultipleWithMultiplier(state)).toBe(2);

  state = toggleBiddingHold(state, 'P4');
  expect(resolveRiskPlayerId(state)).toBe('P3');
  expect(resolveMultipleWithMultiplier(state)).toBe(1);
});

it('does not activate Risk from Hold when the estimate total is outside a Risk threshold', () => {
  let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
  state = setBiddingEstimate(state, 'P1', 5);
  state = setBiddingTrump(state, 'diamonds');
  state = setBiddingEstimate(state, 'P2', 3);
  state = setBiddingEstimate(state, 'P3', 4);
  state = toggleBiddingHold(state, 'P3');

  expect(state.statusByPlayerId.P3).toBe('hold');
  expect(resolveRiskPlayerId(state)).toBeUndefined();
});

it('does not infer Hold when bid ownership transfers', () => {
  let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
  state = setBiddingEstimate(state, 'P1', 4);
  state = setBiddingTrump(state, 'hearts');
  state = setBiddingEstimate(state, 'P2', 5);

  expect(state.bidOwnerPlayerId).toBe('P2');
  expect(state.statusByPlayerId.P1).toBe('normal');
  expect(state.statusByPlayerId.P2).toBe('normal');
});
```

- [ ] **Step 2: Write failing reducer tests for the new action**

Update `currentRoundReducer.test.ts` to use `toggle-hold` and prove the reducer does not expose pending decisions:

```ts
it('toggles explicit Hold without changing the estimate and preserves it across owner changes', () => {
  let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
  draft = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'A', value: 4 });
  draft = currentRoundReducer(draft, { type: 'set-trump', suit: 'hearts' });
  draft = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'C', value: 4 });

  draft = currentRoundReducer(draft, { type: 'toggle-hold', playerId: 'C' });
  draft = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'A', value: 5 });
  draft = currentRoundReducer(draft, { type: 'set-trump', suit: 'spades' });

  expect(resolveHoldPlayerIds(draft)).toEqual(['C']);
  expect(resolveWithPlayerIds(draft)).toEqual([]);
  expect(draft.estimates.C).toBe(4);
  expect(validateAcceptedEstimates(draft)).toEqual([]);
});
```

- [ ] **Step 3: Run the focused tests and verify the new API is missing**

Run:

```powershell
npx vitest run src/app/scoreSheet/biddingState.test.ts src/app/scoreSheet/currentRoundReducer.test.ts
```

Expected: FAIL because `toggleBiddingHold` and `toggle-hold` do not exist and pending Follow/Hold behavior remains.

- [ ] **Step 4: Implement explicit Hold status transitions**

In `biddingState.ts`, remove the two pending-decision properties from `BiddingState` and add one status resolver:

```ts
function resolveNonOwnerStatus(
  state: BiddingState,
  playerId: string,
  estimatesByPlayerId: Readonly<Record<string, number | undefined>>,
  winningEstimate: number,
): BiddingPlayerStatus {
  const estimate = estimatesByPlayerId[playerId] ?? 0;
  if (estimate <= 0) return 'normal';
  if (state.statusByPlayerId[playerId] === 'hold') return 'hold';
  return estimate === winningEstimate ? 'with' : 'normal';
}
```

Use it after every non-owner estimate change and whenever the existing owner
raises or lowers without transferring ownership. Centralize the map so each
path applies the same rules:

```ts
function deriveStatusByPlayerId(
  state: BiddingState,
  estimatesByPlayerId: Readonly<Record<string, number | undefined>>,
  ownerPlayerId: string | undefined,
  winningEstimate: number,
): Readonly<Record<string, BiddingPlayerStatus>> {
  return Object.fromEntries(
    state.playerOrder.map((playerId) => [
      playerId,
      playerId === ownerPlayerId
        ? 'normal'
        : resolveNonOwnerStatus(state, playerId, estimatesByPlayerId, winningEstimate),
    ]),
  ) as Record<string, BiddingPlayerStatus>;
}
```

In `transferOwnership`, force the new owner to `normal`, preserve an eligible
prior `hold`, and derive all remaining non-owner statuses from the new winning
estimate:

```ts
const statusByPlayerId = deriveStatusByPlayerId(
  state,
  estimatesByPlayerId,
  newOwnerPlayerId,
  winningEstimate,
);
```

For an estimate update that does not transfer ownership, return the same state
shape with this exact derived status map:

```ts
const statusByPlayerId = deriveStatusByPlayerId(
  state,
  estimatesByPlayerId,
  state.bidOwnerPlayerId,
  state.winningEstimate,
);

return {
  ...state,
  estimateEntryOrder,
  estimatesByPlayerId,
  statusByPlayerId,
};
```

When an owner changes their own value but remains owner, pass `nextValue` as
the final argument. When no positive owner remains, reset all statuses:

```ts
const statusByPlayerId = Object.fromEntries(
  state.playerOrder.map((playerId) => {
    return [playerId, 'normal'];
  }),
) as Record<string, BiddingPlayerStatus>;
```

Add the only public Hold mutation:

```ts
export function toggleBiddingHold(state: BiddingState, playerId: string): BiddingState {
  assertPlayer(state, playerId);
  if (state.confirmed) return state;
  const estimate = normalizedEstimate(state, playerId);
  if (playerId === state.bidOwnerPlayerId || estimate <= 0) return state;
  const nextStatus = state.statusByPlayerId[playerId] === 'hold'
    ? estimate === state.winningEstimate ? 'with' : 'normal'
    : 'hold';
  return {
    ...state,
    statusByPlayerId: { ...state.statusByPlayerId, [playerId]: nextStatus },
  };
}
```

Remove pending-decision validation from `confirmBidding`. Preserve the existing 0–12, total-not-13, positive-estimate, owner, and trump validations.

- [ ] **Step 5: Expose the reducer toggle and remove pending state**

In `currentRoundReducer.ts`, import `toggleBiddingHold`, remove `pendingWithDecisionPlayerIds`, and replace both old actions with:

```ts
export type CurrentRoundAction =
  | { readonly type: 'set-estimate'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-actual'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-trump'; readonly suit: ContractSuit }
  | { readonly type: 'toggle-hold'; readonly playerId: string }
  | { readonly type: 'accept-estimates' }
  | { readonly type: 'reset' };
```

Handle the action only during estimate entry:

```ts
case 'toggle-hold':
  return draft.phase === 'estimating'
    ? withBidding(draft, toggleBiddingHold(draft.bidding, action.playerId))
    : draft;
```

- [ ] **Step 6: Run the focused state tests**

Run:

```powershell
npx vitest run src/app/scoreSheet/biddingState.test.ts src/app/scoreSheet/currentRoundReducer.test.ts
```

Expected: both files PASS, including explicit selection, sticky eligibility, clearing, Risk, and multiplier cases.

- [ ] **Step 7: Commit the state model**

```powershell
git add -- src/app/scoreSheet/biddingState.ts src/app/scoreSheet/biddingState.test.ts src/app/scoreSheet/currentRoundReducer.ts src/app/scoreSheet/currentRoundReducer.test.ts
git commit -m "feat: model manual hold entry"
```

---

### Task 2: Render the Hold Toggle and Persist the Selected Status

**Files:**
- Modify: `src/app/components/CurrentRoundRow.tsx`
- Modify: `src/app/components/CurrentRoundRow.test.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.test.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes: reducer action `{ type: 'toggle-hold'; playerId: string }`, `resolveHoldPlayerIds`, `resolveWithPlayerIds`, and existing `ScoreSheetScreen` bid serialization.
- Produces: an accessible button named `<Player name> Hold` with `aria-pressed`, visible only for eligible estimates.

- [ ] **Step 1: Write failing component tests for explicit Hold controls**

Replace the forced Follow/Hold tests in `CurrentRoundRow.test.tsx`:

```tsx
it('shows an unselected Hold toggle for every positive non-owner and never infers Hold', async () => {
  const user = userEvent.setup();
  renderRow();

  await user.type(screen.getByLabelText('Ahmed estimate'), '4');
  await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'hearts');
  await user.type(screen.getByLabelText('Rami estimate'), '4');

  expect(screen.queryByRole('button', { name: 'Ahmed Hold' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByLabelText('Rami estimate annotations')).toHaveTextContent('W');

  await user.clear(screen.getByLabelText('Ahmed estimate'));
  await user.type(screen.getByLabelText('Ahmed estimate'), '5');

  expect(screen.queryByRole('button', { name: 'Rami follow 5' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'false');
});

it('keeps a selected Hold through owner estimate and trump changes and allows removal', async () => {
  const user = userEvent.setup();
  renderRow();

  await user.type(screen.getByLabelText('Ahmed estimate'), '4');
  await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'hearts');
  await user.type(screen.getByLabelText('Rami estimate'), '4');
  await user.click(screen.getByRole('button', { name: 'Rami Hold' }));

  expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'true');

  await user.clear(screen.getByLabelText('Ahmed estimate'));
  await user.type(screen.getByLabelText('Ahmed estimate'), '5');
  await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'spades');

  expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Rami Hold' }));
  expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'false');
});

it('moves Risk when the last caller is explicitly marked Hold', async () => {
  const user = userEvent.setup();
  renderRow();

  await user.type(screen.getByLabelText('Ahmed estimate'), '5');
  await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'clubs');
  await user.type(screen.getByLabelText('Mona estimate'), '2');
  await user.type(screen.getByLabelText('Rami estimate'), '5');
  await user.type(screen.getByLabelText('Dina estimate'), '5');
  expect(screen.getByLabelText('Dina estimate annotations')).toHaveTextContent('R');

  await user.click(screen.getByRole('button', { name: 'Dina Hold' }));
  expect(screen.getByLabelText('Rami estimate annotations')).toHaveTextContent('R');
});
```

- [ ] **Step 2: Update the screen serialization regression**

In `ScoreSheetScreen.test.tsx`, select Hold directly after entering each non-owner estimate:

```ts
await user.type(screen.getByLabelText('Ahmed estimate'), '5');
await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'clubs');
await user.type(screen.getByLabelText('Mona estimate'), '2');
await user.type(screen.getByLabelText('Rami estimate'), '4');
await user.type(screen.getByLabelText('Dina estimate'), '4');
await user.click(screen.getByRole('button', { name: 'Rami Hold' }));
await user.click(screen.getByRole('button', { name: 'Dina Hold' }));
await user.click(screen.getByRole('button', { name: 'Accept estimates' }));
```

Keep the existing expected payload:

```ts
expect(saveRound).toHaveBeenCalledWith('sheet-1', expect.objectContaining({
  bidOwnerPlayerId: 'A',
  riskPlayerId: 'B',
  multipleWithMultiplier: 1,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'clubs' },
    { playerId: 'B', bidType: 'normal', tricks: 2 },
    { playerId: 'C', bidType: 'hold', tricks: 4 },
    { playerId: 'D', bidType: 'hold', tricks: 4 },
  ],
}));
```

- [ ] **Step 3: Run the focused UI tests and verify they fail**

Run:

```powershell
npx vitest run src/app/components/CurrentRoundRow.test.tsx src/app/screens/ScoreSheetScreen.test.tsx
```

Expected: FAIL because the manual `<Player> Hold` toggle is absent and the old forced decision buttons remain.

- [ ] **Step 4: Render the manual Hold toggle**

In `CurrentRoundRow.tsx`, remove pending decision imports and rendering. Inside the player loop derive:

```tsx
const estimate = draft.estimates[player.id] ?? 0;
const isHold = holdPlayerIds.has(player.id);
const canToggleHold = isEstimating && !isWinner && estimate > 0;
```

Render the control beside the estimate:

```tsx
{canToggleHold && (
  <button
    type="button"
    className={isHold ? 'hold-toggle hold-toggle--selected' : 'hold-toggle'}
    aria-label={`${player.name} Hold`}
    aria-pressed={isHold}
    onClick={() => dispatch({ type: 'toggle-hold', playerId: player.id })}
  >
    H
  </button>
)}
```

During accepted/frozen actual entry, retain `H` in `estimate-annotations` so the selected state remains visible after the toggle is hidden.

- [ ] **Step 5: Replace obsolete Follow/Hold CSS**

In `app.css`, remove `.with-decision-*` rules and add:

```css
.hold-toggle {
  min-width: 1.5rem;
  min-height: 1.5rem;
  border: 1px solid #d3a455;
  border-radius: .35rem;
  background: #fff;
  color: #7a4f08;
  padding: .08rem .25rem;
  font-size: clamp(.45rem, .52vw, .64rem);
  font-weight: 850;
  line-height: 1;
}

.hold-toggle--selected {
  border-color: #9b6508;
  background: #fff0c9;
  box-shadow: inset 0 0 0 1px #9b6508;
}
```

At the narrow breakpoint, keep the toggle at its intrinsic width rather than stretching it across the table cell.

- [ ] **Step 6: Run component and screen tests**

Run:

```powershell
npx vitest run src/app/components/CurrentRoundRow.test.tsx src/app/components/CurrentRoundRiskRegression.test.tsx src/app/screens/ScoreSheetScreen.test.tsx
```

Expected: all tests PASS; no Follow/Hold decision button remains.

- [ ] **Step 7: Commit the UI behavior**

```powershell
git add -- src/app/components/CurrentRoundRow.tsx src/app/components/CurrentRoundRow.test.tsx src/app/screens/ScoreSheetScreen.test.tsx src/app/styles/app.css
git commit -m "feat: add manual hold toggle"
```

---

### Task 3: Isolate Mobile Device-Mode Detection

**Files:**
- Create: `src/app/mobile/deviceMode.ts`
- Create: `src/app/mobile/deviceMode.test.tsx`

**Interfaces:**
- Produces: `COARSE_POINTER_QUERY`, `MOBILE_PORTRAIT_QUERY`, `useMobileScoreEntry(): boolean`, and `useMobilePortraitScoreSheet(): boolean`.
- Consumes: `window.matchMedia` when available; falls back to `false` when it is unavailable.

- [ ] **Step 1: Write failing device-mode hook tests**

Create `src/app/mobile/deviceMode.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  COARSE_POINTER_QUERY,
  MOBILE_PORTRAIT_QUERY,
  useMobilePortraitScoreSheet,
  useMobileScoreEntry,
} from './deviceMode.js';

function installMatchMedia(initial: Readonly<Record<string, boolean>>) {
  const matches = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => {
      const queryListeners = listeners.get(query) ?? new Set();
      listeners.set(query, queryListeners);
      return {
        get matches() {
          return matches.get(query) ?? false;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          queryListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          queryListeners.delete(listener);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    }),
  });

  return {
    set(query: string, value: boolean) {
      matches.set(query, value);
      for (const listener of listeners.get(query) ?? []) {
        listener({ matches: value, media: query } as MediaQueryListEvent);
      }
    },
  };
}

function DeviceModeProbe() {
  const mobileEntry = useMobileScoreEntry();
  const portraitGate = useMobilePortraitScoreSheet();
  return <output>{`${mobileEntry}:${portraitGate}`}</output>;
}

describe('mobile device mode', () => {
  it('reports coarse-pointer entry and reacts to portrait changes', () => {
    const media = installMatchMedia({
      [COARSE_POINTER_QUERY]: true,
      [MOBILE_PORTRAIT_QUERY]: true,
    });
    render(<DeviceModeProbe />);

    expect(screen.getByText('true:true')).toBeInTheDocument();
    act(() => media.set(MOBILE_PORTRAIT_QUERY, false));
    expect(screen.getByText('true:false')).toBeInTheDocument();
  });

  it('falls back to desktop mode when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: undefined,
    });
    render(<DeviceModeProbe />);
    expect(screen.getByText('false:false')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the hook test and verify it fails**

Run:

```powershell
npx vitest run src/app/mobile/deviceMode.test.tsx
```

Expected: FAIL because `deviceMode.ts` and its exported hooks do not exist.

- [ ] **Step 3: Implement the shared media-query hooks**

Create `src/app/mobile/deviceMode.ts`:

```ts
import { useEffect, useState } from 'react';

export const COARSE_POINTER_QUERY = '(pointer: coarse)';
export const MOBILE_PORTRAIT_QUERY = '(pointer: coarse) and (orientation: portrait)';

function readMediaQuery(query: string): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMediaQuery(query));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      setMatches(false);
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const update = (event?: MediaQueryListEvent) => {
      setMatches(event?.matches ?? mediaQuery.matches);
    };
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function useMobileScoreEntry(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY);
}

export function useMobilePortraitScoreSheet(): boolean {
  return useMediaQuery(MOBILE_PORTRAIT_QUERY);
}
```

- [ ] **Step 4: Run the hook test**

Run:

```powershell
npx vitest run src/app/mobile/deviceMode.test.tsx
```

Expected: `2` tests PASS, including the reactive orientation update and unavailable-API fallback.

- [ ] **Step 5: Commit device-mode detection**

```powershell
git add -- src/app/mobile/deviceMode.ts src/app/mobile/deviceMode.test.tsx
git commit -m "feat: detect mobile score entry mode"
```

---

### Task 4: Build the Centered Number Picker

**Files:**
- Create: `src/app/components/NumberPickerDialog.tsx`
- Create: `src/app/components/NumberPickerDialog.test.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Produces: `NumberPickerDialog({ title, value, max, onSelect, onClear, onCancel })`.
- Consumes: an integer maximum of `12` for estimates or `13` for actual tricks.
- Does not consume reducer, player, Supabase, or lifecycle state.

- [ ] **Step 1: Write failing picker behavior tests**

Create `src/app/components/NumberPickerDialog.test.tsx`:

```tsx
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberPickerDialog, type NumberPickerDialogProps } from './NumberPickerDialog.js';

function renderPicker(overrides: Partial<NumberPickerDialogProps> = {}) {
  const props: NumberPickerDialogProps = {
    title: 'Rami — Estimate',
    value: 4,
    max: 12,
    onSelect: vi.fn(),
    onClear: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<NumberPickerDialog {...props} />);
  return props;
}

describe('NumberPickerDialog', () => {
  it('renders a centered estimate picker from 0 through 12 and marks the current value', async () => {
    const user = userEvent.setup();
    const props = renderPicker();

    expect(screen.getByRole('dialog', { name: 'Rami — Estimate' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Choose \d+$/ })).toHaveLength(13);
    expect(screen.getByRole('button', { name: 'Choose 4' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Choose 13' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Choose 12' }));
    expect(props.onSelect).toHaveBeenCalledWith(12);
  });

  it('renders 13 for actual tricks and supports Clear and Cancel', async () => {
    const user = userEvent.setup();
    const props = renderPicker({ title: 'Rami — Actual tricks', value: undefined, max: 13 });

    expect(screen.getByRole('button', { name: 'Choose 13' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear value' }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel number entry' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape and backdrop click without selecting a value', () => {
    const props = renderPicker();
    const dialog = screen.getByRole('dialog', { name: 'Rami — Estimate' });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(dialog);

    expect(props.onCancel).toHaveBeenCalledTimes(2);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog and restores it to the trigger on cancellation', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Edit estimate</button>
          {open && (
            <NumberPickerDialog
              title="Rami — Estimate"
              value={4}
              max={12}
              onSelect={vi.fn()}
              onClear={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Edit estimate' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Choose 4' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel number entry' }));
    expect(trigger).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the picker test and verify it fails**

Run:

```powershell
npx vitest run src/app/components/NumberPickerDialog.test.tsx
```

Expected: FAIL because `NumberPickerDialog` does not exist.

- [ ] **Step 3: Implement the controlled portal dialog**

Create `src/app/components/NumberPickerDialog.tsx`:

```tsx
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface NumberPickerDialogProps {
  readonly title: string;
  readonly value?: number;
  readonly max: 12 | 13;
  readonly onSelect: (value: number) => void;
  readonly onClear: () => void;
  readonly onCancel: () => void;
}

export function NumberPickerDialog({
  title,
  value,
  max,
  onSelect,
  onClear,
  onCancel,
}: NumberPickerDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const values = Array.from({ length: max + 1 }, (_, index) => index);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const selected = dialog.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    const firstNumber = dialog.querySelector<HTMLButtonElement>('.number-picker-value');
    (selected ?? firstNumber)?.focus();
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      returnFocusRef.current?.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="number-picker-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section className="number-picker-panel">
        <h3 id={titleId}>{title}</h3>
        <div className="number-picker-grid">
          {values.map((option) => (
            <button
              key={option}
              className="number-picker-value"
              type="button"
              aria-label={`Choose ${option}`}
              aria-pressed={value === option}
              onClick={() => onSelect(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="number-picker-actions">
          <button type="button" className="secondary-button" aria-label="Clear value" onClick={onClear}>
            Clear
          </button>
          <button type="button" className="secondary-button" aria-label="Cancel number entry" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </dialog>,
    document.body,
  );
}
```

- [ ] **Step 4: Add compact centered-picker styles**

Append the following rules to `src/app/styles/app.css` before the media queries:

```css
.number-picker-dialog {
  width: min(92vw, 24rem);
  max-width: none;
  margin: auto;
  overflow: visible;
  border: 1px solid #bfcac7;
  border-radius: .9rem;
  background: white;
  box-shadow: 0 1rem 3rem rgb(0 0 0 / 28%);
  padding: 0;
}
.number-picker-dialog::backdrop { background: rgb(17 24 32 / 24%); }
.number-picker-panel { display: grid; gap: .65rem; padding: .8rem; }
.number-picker-panel h3 { margin: 0; text-align: center; font-size: .95rem; }
.number-picker-grid { display: grid; grid-template-columns: repeat(7, minmax(2.75rem, 1fr)); gap: .3rem; }
.number-picker-value {
  min-width: 2.75rem;
  min-height: 2.75rem;
  border: 1px solid #c8d3d0;
  border-radius: .55rem;
  background: #f8fbfa;
  color: #111820;
  padding: 0;
  font-weight: 800;
}
.number-picker-value[aria-pressed="true"] {
  border-color: #087443;
  background: #dceee9;
  color: #075c38;
  box-shadow: inset 0 0 0 1px #087443;
}
.number-picker-value:focus-visible {
  outline: 3px solid #65ad96;
  outline-offset: 1px;
}
.number-picker-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
.number-picker-actions .secondary-button { min-height: 2.4rem; padding: .45rem .7rem; }
```

- [ ] **Step 5: Run the picker tests**

Run:

```powershell
npx vitest run src/app/components/NumberPickerDialog.test.tsx
```

Expected: `4` tests PASS, the dialog exposes `13` only when `max={13}`, and
focus returns to its trigger after cancellation.

- [ ] **Step 6: Commit the picker**

```powershell
git add -- src/app/components/NumberPickerDialog.tsx src/app/components/NumberPickerDialog.test.tsx src/app/styles/app.css
git commit -m "feat: add mobile number picker"
```

---

### Task 5: Integrate Mobile Entry and the Landscape Gate

**Files:**
- Create: `src/app/components/MobileLandscapeGate.tsx`
- Create: `src/app/components/MobileLandscapeGate.test.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/components/CurrentRoundRow.tsx`
- Modify: `src/app/components/CurrentRoundRow.test.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.test.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes: `useMobileScoreEntry`, `useMobilePortraitScoreSheet`, `NumberPickerDialog`, `set-estimate`, and `set-actual`.
- Produces: a portrait-only score-sheet gate and mobile input-styled buttons that open exactly one centered picker.
- Preserves: desktop numeric inputs and the `CurrentRoundDraft` reducer contract.

- [ ] **Step 1: Write the failing landscape-gate tests**

Create `src/app/components/MobileLandscapeGate.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobilePortraitScoreSheet } from '../mobile/deviceMode.js';
import { MobileLandscapeGate } from './MobileLandscapeGate.js';

vi.mock('../mobile/deviceMode.js', () => ({
  useMobilePortraitScoreSheet: vi.fn(() => false),
}));

const portrait = vi.mocked(useMobilePortraitScoreSheet);

beforeEach(() => portrait.mockReturnValue(false));

describe('MobileLandscapeGate', () => {
  it('shows a blocking rotate message only in mobile portrait', () => {
    portrait.mockReturnValue(true);
    render(<MobileLandscapeGate><p>Score sheet content</p></MobileLandscapeGate>);

    expect(screen.getByRole('dialog', { name: 'Landscape required' })).toBeVisible();
    expect(screen.getByText('Rotate your device to landscape')).toBeInTheDocument();
  });

  it('preserves mounted child state while portrait is entered and left', async () => {
    const user = userEvent.setup();
    const view = render(
      <MobileLandscapeGate>
        <label>Draft <input aria-label="Draft" /></label>
      </MobileLandscapeGate>,
    );
    await user.type(screen.getByLabelText('Draft'), '5');

    portrait.mockReturnValue(true);
    view.rerender(
      <MobileLandscapeGate>
        <label>Draft <input aria-label="Draft" /></label>
      </MobileLandscapeGate>,
    );
    expect(screen.getByLabelText('Draft')).toHaveValue('5');

    portrait.mockReturnValue(false);
    view.rerender(
      <MobileLandscapeGate>
        <label>Draft <input aria-label="Draft" /></label>
      </MobileLandscapeGate>,
    );
    expect(screen.queryByRole('dialog', { name: 'Landscape required' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Draft')).toHaveValue('5');
  });
});
```

- [ ] **Step 2: Write failing mobile row-entry tests**

In `CurrentRoundRow.test.tsx`, mock device mode with desktop defaults:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobilePortraitScoreSheet, useMobileScoreEntry } from '../mobile/deviceMode.js';

vi.mock('../mobile/deviceMode.js', () => ({
  useMobileScoreEntry: vi.fn(() => false),
  useMobilePortraitScoreSheet: vi.fn(() => false),
}));

const mobileEntry = vi.mocked(useMobileScoreEntry);
const mobilePortrait = vi.mocked(useMobilePortraitScoreSheet);

beforeEach(() => {
  mobileEntry.mockReturnValue(false);
  mobilePortrait.mockReturnValue(false);
});
```

Add these cases:

```tsx
it('uses a centered 0–12 picker for mobile estimates without rendering a numeric input', async () => {
  mobileEntry.mockReturnValue(true);
  const user = userEvent.setup();
  renderRow();

  const trigger = screen.getByRole('button', { name: 'Ahmed estimate' });
  expect(screen.queryByRole('spinbutton', { name: 'Ahmed estimate' })).not.toBeInTheDocument();
  await user.click(trigger);

  expect(screen.getByRole('dialog', { name: 'Ahmed — Estimate' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Choose 13' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Choose 5' }));
  expect(trigger).toHaveTextContent('5');
});

it('uses a centered 0–13 picker for mobile actual tricks and keeps manual Hold available', async () => {
  mobileEntry.mockReturnValue(true);
  const user = userEvent.setup();
  renderRow();

  await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
  await user.click(screen.getByRole('button', { name: 'Choose 5' }));
  await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'clubs');
  await user.click(screen.getByRole('button', { name: 'Rami estimate' }));
  await user.click(screen.getByRole('button', { name: 'Choose 5' }));
  await user.click(screen.getByRole('button', { name: 'Rami Hold' }));
  expect(screen.getByLabelText('Rami estimate annotations')).toHaveTextContent('H');

  await user.click(screen.getByRole('button', { name: 'Accept estimates' }));
  await user.click(screen.getByRole('button', { name: 'Rami actual tricks' }));
  expect(screen.getByRole('button', { name: 'Choose 13' })).toBeInTheDocument();
});

it('clears a mobile value and closes the picker when portrait begins', async () => {
  mobileEntry.mockReturnValue(true);
  const user = userEvent.setup();
  const view = render(<table><tbody><CurrentRoundRow
    roundNumber={1}
    players={players}
    existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
    onSave={vi.fn()}
  /></tbody></table>);

  await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
  await user.click(screen.getByRole('button', { name: 'Choose 4' }));
  await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
  await user.click(screen.getByRole('button', { name: 'Clear value' }));
  expect(screen.getByRole('button', { name: 'Ahmed estimate' })).toHaveTextContent('—');

  await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
  mobilePortrait.mockReturnValue(true);
  view.rerender(<table><tbody><CurrentRoundRow
    roundNumber={1}
    players={players}
    existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
    onSave={vi.fn()}
  /></tbody></table>);
  expect(screen.queryByRole('dialog', { name: 'Ahmed — Estimate' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ahmed estimate' })).toHaveTextContent('—');
});

it('does not open the picker from disabled mobile fields', async () => {
  mobileEntry.mockReturnValue(true);
  const user = userEvent.setup();
  renderRow();

  const actualTrigger = screen.getByRole('button', { name: 'Ahmed actual tricks' });
  expect(actualTrigger).toBeDisabled();
  await user.click(actualTrigger);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
  await user.click(screen.getByRole('button', { name: 'Choose 5' }));
  await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'spades');
  await user.click(screen.getByRole('button', { name: 'Accept estimates' }));

  const estimateTrigger = screen.getByRole('button', { name: 'Ahmed estimate' });
  expect(estimateTrigger).toBeDisabled();
  await user.click(estimateTrigger);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```powershell
npx vitest run src/app/components/MobileLandscapeGate.test.tsx src/app/components/CurrentRoundRow.test.tsx
```

Expected: FAIL because the gate, mobile triggers, and picker integration do not exist.

- [ ] **Step 4: Implement the landscape gate**

Create `src/app/components/MobileLandscapeGate.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useMobilePortraitScoreSheet } from '../mobile/deviceMode.js';

export function MobileLandscapeGate({ children }: { readonly children: ReactNode }) {
  const portraitBlocked = useMobilePortraitScoreSheet();

  return (
    <div className="mobile-landscape-shell">
      <div
        className="mobile-landscape-content"
        inert={portraitBlocked ? true : undefined}
        aria-hidden={portraitBlocked ? true : undefined}
      >
        {children}
      </div>
      {portraitBlocked && (
        <div
          className="mobile-landscape-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-landscape-title"
        >
          <div className="mobile-landscape-message">
            <span className="mobile-landscape-icon" aria-hidden="true">↻</span>
            <h2 id="mobile-landscape-title">Landscape required</h2>
            <p>Rotate your device to landscape</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

Import the gate and change only the opening and closing tags of the valid
score-sheet return in `ScoreSheetScreen.tsx`:

```tsx
import { MobileLandscapeGate } from '../components/MobileLandscapeGate.js';

// Before:
return (
  <section className="score-sheet-screen">

// After:
return (
  <MobileLandscapeGate>
    <section className="score-sheet-screen">

// Before the return closes:
    </section>
);

// After:
    </section>
  </MobileLandscapeGate>
);
```

Leave every element between the opening and closing `section` tags byte-for-byte
unchanged. Do not wrap loading, unavailable, sign-in, home, or new-game
screens.

- [ ] **Step 5: Integrate the controlled picker into `CurrentRoundRow`**

Update the imports:

```tsx
import { useEffect, useReducer, useState } from 'react';
import { useMobilePortraitScoreSheet, useMobileScoreEntry } from '../mobile/deviceMode.js';
import { NumberPickerDialog } from './NumberPickerDialog.js';
```

Add the target type above the component:

```tsx
interface NumberPickerTarget {
  readonly playerId: string;
  readonly playerName: string;
  readonly entryType: 'estimate' | 'actual';
}
```

Add state and orientation cleanup inside the component:

```tsx
const mobileEntry = useMobileScoreEntry();
const mobilePortrait = useMobilePortraitScoreSheet();
const [numberPickerTarget, setNumberPickerTarget] = useState<NumberPickerTarget | undefined>();

useEffect(() => {
  if (mobilePortrait || !mobileEntry) setNumberPickerTarget(undefined);
}, [mobileEntry, mobilePortrait]);
```

Replace each estimate input with the mobile trigger or the existing desktop
input:

```tsx
{mobileEntry ? (
  <button
    className="estimate-input number-picker-trigger"
    aria-label={`${player.name} estimate`}
    type="button"
    disabled={!isEstimating}
    onClick={() => setNumberPickerTarget({
      playerId: player.id,
      playerName: player.name,
      entryType: 'estimate',
    })}
  >
    {draft.estimates[player.id] ?? '—'}
  </button>
) : (
  <input
    className="estimate-input"
    aria-label={`${player.name} estimate`}
    type="number"
    min="0"
    max="12"
    inputMode="numeric"
    disabled={!isEstimating}
    value={draft.estimates[player.id] ?? ''}
    onChange={(event) => dispatch({
      type: 'set-estimate',
      playerId: player.id,
      value: numberValue(event.target.value),
    })}
  />
)}
```

Replace each actual-trick input with the same mode split:

```tsx
{mobileEntry ? (
  <button
    className="trick-input number-picker-trigger"
    aria-label={`${player.name} actual tricks`}
    type="button"
    disabled={isEstimating}
    onClick={() => setNumberPickerTarget({
      playerId: player.id,
      playerName: player.name,
      entryType: 'actual',
    })}
  >
    {draft.actuals[player.id] ?? '—'}
  </button>
) : (
  <input
    className="trick-input"
    aria-label={`${player.name} actual tricks`}
    type="number"
    min="0"
    max="13"
    inputMode="numeric"
    disabled={isEstimating}
    value={draft.actuals[player.id] ?? ''}
    onChange={(event) => dispatch({
      type: 'set-actual',
      playerId: player.id,
      value: numberValue(event.target.value),
    })}
  />
)}
```

Render one portal picker after the table-row fragment. Because the picker uses
`createPortal`, it does not create invalid children inside `<tbody>`:

```tsx
{numberPickerTarget !== undefined && !mobilePortrait && (
  <NumberPickerDialog
    title={`${numberPickerTarget.playerName} — ${
      numberPickerTarget.entryType === 'estimate' ? 'Estimate' : 'Actual tricks'
    }`}
    value={numberPickerTarget.entryType === 'estimate'
      ? draft.estimates[numberPickerTarget.playerId]
      : draft.actuals[numberPickerTarget.playerId]}
    max={numberPickerTarget.entryType === 'estimate' ? 12 : 13}
    onSelect={(value) => {
      dispatch(numberPickerTarget.entryType === 'estimate'
        ? { type: 'set-estimate', playerId: numberPickerTarget.playerId, value }
        : { type: 'set-actual', playerId: numberPickerTarget.playerId, value });
      setNumberPickerTarget(undefined);
    }}
    onClear={() => {
      dispatch(numberPickerTarget.entryType === 'estimate'
        ? { type: 'set-estimate', playerId: numberPickerTarget.playerId, value: undefined }
        : { type: 'set-actual', playerId: numberPickerTarget.playerId, value: undefined });
      setNumberPickerTarget(undefined);
    }}
    onCancel={() => setNumberPickerTarget(undefined)}
  />
)}
```

Keep the Task 2 manual `H` toggle enabled only for positive non-owner
estimates. Remove all references to the obsolete `isPending` state.

- [ ] **Step 6: Add the orientation and mobile-trigger styles**

Add to `app.css`:

```css
.mobile-landscape-shell,
.mobile-landscape-content { min-width: 0; }
.number-picker-trigger {
  display: inline-grid;
  place-items: center;
  appearance: none;
  color: inherit;
}
.mobile-landscape-gate {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  background: #f7f9f8;
  padding: 1.5rem;
  text-align: center;
}
.mobile-landscape-message {
  display: grid;
  justify-items: center;
  gap: .65rem;
  max-width: 22rem;
}
.mobile-landscape-message h2,
.mobile-landscape-message p { margin: 0; }
.mobile-landscape-message p { color: #5b6875; }
.mobile-landscape-icon {
  display: grid;
  width: 4rem;
  height: 4rem;
  place-items: center;
  border-radius: 999px;
  background: #dceee9;
  color: #075c38;
  font-size: 2.4rem;
  font-weight: 850;
}
```

At `@media (max-width: 48rem)`, keep picker touch targets at `2.75rem` rather
than inheriting score-table button sizing:

```css
@media (max-width: 48rem) {
  .number-picker-grid {
    grid-template-columns: repeat(7, minmax(2.75rem, 1fr));
  }
  .number-picker-value {
    width: auto;
    min-height: 2.75rem;
    font-size: .9rem;
  }
}
```

- [ ] **Step 7: Add the score-sheet scope regression**

In `ScoreSheetScreen.test.tsx`, mock portrait mode and verify the valid score
sheet is wrapped while loading/unavailable UI is not changed:

```tsx
it('scopes the mobile landscape gate to a valid active score sheet', () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('orientation: portrait'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });

  render(<ScoreSheetScreen scoreSheetId="sheet-1" shell={shell} />);
  expect(screen.getByRole('dialog', { name: 'Landscape required' })).toBeVisible();
  expect(screen.getByRole('table', {
    name: 'Thursday Table score sheet',
    hidden: true,
  })).toBeInTheDocument();
});
```

In `App.test.tsx`, add a direct non-score-sheet portrait regression:

```tsx
it('keeps the home screen usable in mobile portrait', () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('pointer: coarse') && query.includes('orientation: portrait'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });

  render(<App services={createServices()} />);
  expect(screen.getByRole('heading', { name: 'Estimation' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Landscape required' })).not.toBeInTheDocument();
});
```

The gate is imported only by `ScoreSheetScreen`, so sign-in, home, and new-game
screens remain outside it.

- [ ] **Step 8: Run the focused mobile and Hold integration tests**

Run:

```powershell
npx vitest run src/app/mobile/deviceMode.test.tsx src/app/components/NumberPickerDialog.test.tsx src/app/components/MobileLandscapeGate.test.tsx src/app/components/CurrentRoundRow.test.tsx src/app/screens/ScoreSheetScreen.test.tsx src/app/App.test.tsx
```

Expected: all focused tests PASS. Existing desktop tests continue to find
spinbuttons, mobile tests find input-styled buttons, and Hold works with the
picker-selected estimate.

- [ ] **Step 9: Commit mobile score-sheet integration**

```powershell
git add -- src/app/App.test.tsx src/app/components/MobileLandscapeGate.tsx src/app/components/MobileLandscapeGate.test.tsx src/app/components/CurrentRoundRow.tsx src/app/components/CurrentRoundRow.test.tsx src/app/screens/ScoreSheetScreen.tsx src/app/screens/ScoreSheetScreen.test.tsx src/app/styles/app.css
git commit -m "feat: optimize mobile score entry"
```

---

### Task 6: Verify Snapshot Restoration, CI, and the Deployed UAT

**Files:**
- Modify: `src/online/games/OnlineBrowserShellService.test.ts`
- Modify: `docs/UAT_DEPLOYMENT.md`

**Interfaces:**
- Consumes: persisted `round_bids.bid_type = 'hold'`, `get_game_snapshot`, existing `OnlineBrowserShellService.mapSnapshot`, Vercel stable UAT alias.
- Produces: regression evidence that online snapshots restore Hold, an updated
  Hold/mobile UAT checklist, a pushed feature branch, and a smoke-tested stable
  deployment.

- [ ] **Step 1: Add an online snapshot assertion**

In `OnlineBrowserShellService.test.ts`, change one snapshot bid to Hold and assert the mapped round input retains it:

```ts
{ player_id: 'p3', bid_type: 'hold', tricks: 3, trump_suit: null, with_target_player_id: null },
```

Add:

```ts
expect(opened.scoreSheet?.gameInput.rounds[0]?.bids[2]).toEqual(expect.objectContaining({
  playerId: 'p3',
  bidType: 'hold',
  tricks: 3,
}));
```

- [ ] **Step 2: Run the snapshot test**

Run:

```powershell
npx vitest run src/online/games/OnlineBrowserShellService.test.ts
```

Expected: PASS if the existing snapshot mapper is already correct; otherwise FAIL at the new Hold assertion.

- [ ] **Step 3: Apply the smallest mapper correction only if required**

The bid mapper must preserve the database value:

```ts
const bids = round.bids.map((bid) => ({
  playerId: bid.player_id,
  bidType: bid.bid_type,
  tricks: bid.tricks,
  ...(bid.trump_suit === null ? {} : { trumpSuit: bid.trump_suit }),
  ...(bid.with_target_player_id === null ? {} : { withTargetPlayerId: bid.with_target_player_id }),
}));
```

Do not add a new Hold field or database migration.

- [ ] **Step 4: Add manual Hold and mobile entry to the deployment smoke checklist**

In `docs/UAT_DEPLOYMENT.md`, require this exact live check:

```markdown
- Enter a positive non-owner estimate and verify `H` starts unselected.
- Select `H`, change the owner estimate and trump, and verify `H` remains selected.
- Verify Risk moves past the selected Hold player.
- Save the round, reload the game, and verify the history retains `H`.
- Emulate a coarse-pointer phone in portrait and verify only the active score sheet shows the landscape gate.
- Rotate the emulated phone to landscape and verify the same score-sheet draft remains.
- Verify estimate entry opens a centered `0`–`12` picker without a numeric input.
- Verify actual-trick entry opens a centered `0`–`13` picker.
- Select, clear, and cancel values; confirm the picker closes after each action.
- Save a picker-entered round, reload it, and verify `get_game_snapshot` restores the round.
```

- [ ] **Step 5: Run the complete CI gate**

Run:

```powershell
npm run ci
```

Expected:

- engine typecheck PASS;
- app typecheck PASS;
- all engine tests PASS;
- all UI tests PASS;
- Vite production build PASS;
- only the existing non-blocking bundle-size warning may remain.

- [ ] **Step 6: Commit the integration evidence**

```powershell
git add -- src/online/games/OnlineBrowserShellService.test.ts docs/UAT_DEPLOYMENT.md
git commit -m "test: verify Hold and mobile UAT"
```

- [ ] **Step 7: Push the CI-passing feature branch**

Run:

```powershell
git status --short
git push origin feature/react-vite-frontend-prototype
```

Expected:

- only the four explicitly excluded zero-byte files may remain untracked;
- the remote feature branch advances without merging to `main`.

If Git authentication is required, stop and ask the user to complete the
interactive sign-in. Never print or commit credentials.

- [ ] **Step 8: Deploy the CI-passing Preview**

Run:

```powershell
$uatPreviewUrl = (npx --yes vercel@latest deploy --target=preview --yes --force | Select-Object -Last 1).Trim()
$uatPreviewUri = [Uri]$uatPreviewUrl
$uatPreviewUri.AbsoluteUri
```

Expected: `$uatPreviewUri` is an HTTPS Vercel Preview URL and the deployment is
READY. Never print or commit environment-variable values.

Update the stable alias:

```powershell
npx --yes vercel@latest alias set $uatPreviewUri.Host estimation-score-calculator-uat.vercel.app
```

Expected: `https://estimation-score-calculator-uat.vercel.app` points to the READY deployment.

- [ ] **Step 9: Smoke-test manual Hold and mobile entry on the stable URL**

Open `https://estimation-score-calculator-uat.vercel.app` in the authenticated Chrome profile and verify:

1. positive non-owner estimate shows an unselected `H`;
2. no Hold is inferred after an owner raise;
3. selecting `H` keeps the estimate unchanged;
4. changing owner estimate and trump retains the selected `H`;
5. Risk skips the selected Hold player;
6. the saved online round persists;
7. reloading through `get_game_snapshot` restores `H` in history;
8. coarse-pointer portrait emulation shows the landscape gate only on the
   active score sheet;
9. landscape emulation reveals the same draft;
10. estimate entry opens a centered `0`–`12` picker and no system numeric
    input;
11. actual entry opens a centered `0`–`13` picker;
12. number selection, Clear, Cancel, backdrop cancellation, and the current
    selected value work;
13. a round entered through the picker saves and reloads through
    `get_game_snapshot`.

- [ ] **Step 10: Resume the paused lifecycle and lock smoke tests**

Continue the existing lifecycle game from Round 9 through Round 18, then verify:

1. Round 18 save suggests completion but does not finalize automatically;
2. cancellation keeps the game in progress;
3. confirmed finish changes status to Completed;
4. completed score inputs and overrides are read-only;
5. reopening restores In progress without deleting rounds;
6. a second Tester session opens an actively locked game view-only;
7. lock expiry or release permits editing;
8. Admin force release is audited and permits editing.

- [ ] **Step 11: Record final evidence**

Report:

- stable UAT URL;
- exact `npm run ci` counts;
- live sign-in, shared-player, duplicate-name, Hold, mobile picker, orientation,
  round persistence, Round 18, completion, reopen, and lock results;
- remaining bundle-size, physical-mobile, or multi-user-test risks;
- exact Admin invitation and membership procedure.
