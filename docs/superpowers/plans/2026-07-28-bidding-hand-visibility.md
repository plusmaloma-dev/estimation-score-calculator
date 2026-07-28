# Bidding Hand Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the authenticated viewer’s complete private hand throughout bidding as non-interactive cards while preserving existing legal-card interaction during play.

**Architecture:** Extract the existing card rendering and accessibility behavior into a reusable `GameplayHand` component with explicit `read-only` and `play` modes. `GameplayBidPanel` renders the hand in read-only mode during bidding, while `GameplayCardPanel` delegates its current interactive hand behavior to the same component. Existing viewer-scoped snapshots remain the sole data source, so no API or database change is required.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Vite gameplay build, guarded Vercel deployment.

## Global Constraints

- Begin only after the human action-boundary synchronization plan has passed hosted UAT.
- Work only in `C:\Users\rjamm\estimation-gameplay-uat` on branch `feature/online-game-bot-mvp`.
- Keep PR #14 open, draft, unmerged, and unauthorized for merge.
- Do not change Supabase Functions, migrations, database objects, or the score UAT environment.
- Show only `snapshot.ownHand`; never derive or expose another seat’s private cards.
- Bidding cards must remain non-clickable and must never be marked legal.
- Existing playing-phase legal-card behavior must remain unchanged.
- Deploy only the dedicated Vercel project `estimation-gameplay-uat`, only after explicit approval, through `scripts/isolation/deploy-gameplay-vercel.mjs`.
- The canonical gameplay UAT URL remains `https://estimation-gameplay-uat.vercel.app`.
- Never expose the publishable key in output, logs, screenshots, or chat; enter it only through a hidden prompt.
- Commit and push only after focused GREEN, `npm run ci`, and `npm run ci:isolation` all pass.

---

### Task 1: Add RED tests for bidding hand visibility and shared hand behavior

**Files:**
- Create: `src/app/components/GameplayHand.test.tsx`
- Modify: `src/app/screens/ActiveGameplayBiddingScreen.test.tsx`
- Reference: `src/app/components/GameplayCardPanel.test.tsx`

**Interfaces:**
- Consumes: the existing viewer-scoped `OnlineGameplayRoundSnapshot.ownHand` array.
- Produces: UI regression coverage for 13 visible read-only bidding cards and preserved playing-phase interaction.

- [ ] **Step 1: Add a bidding-screen test that requires the viewer hand**

Append to `ActiveGameplayBiddingScreen.test.tsx`:

```tsx
it('shows all viewer cards as read-only while bidding', async () => {
  renderScreen(services(roundSnapshot()), 'user-2');

  const hand = await screen.findByRole('group', { name: 'Your hand' });
  const cards = within(hand).getAllByRole('button');

  expect(cards).toHaveLength(13);
  for (const card of cards) expect(card).toBeDisabled();
  expect(within(hand).getByRole('button', { name: '2 of clubs' })).toBeVisible();
  expect(within(hand).getByRole('button', { name: 'Ace of clubs' })).toBeVisible();
  expect(screen.queryByText('Opponent hand')).not.toBeInTheDocument();
});
```

Use the canonical deck order already returned by `createCanonicalDeck().slice(0, 13)`; verify the actual first and last accessible names against the current deck order before committing the test. Keep exactly two stable card-name assertions.

- [ ] **Step 2: Create the reusable hand component test**

Create `src/app/components/GameplayHand.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayHand } from './GameplayHand.js';

const cards = [
  { suit: 'hearts', rank: 'A' },
  { suit: 'clubs', rank: '2' },
] as const;

function renderHand(input: {
  readonly mode: 'read-only' | 'play';
  readonly active?: boolean;
  readonly busy?: boolean;
  readonly onPlay?: ReturnType<typeof vi.fn>;
}) {
  const onPlay = input.onPlay ?? vi.fn(async () => undefined);
  render(
    <I18nProvider>
      <GameplayHand
        cards={cards}
        legalCards={[cards[0]]}
        mode={input.mode}
        active={input.active ?? false}
        busy={input.busy ?? false}
        onPlay={onPlay}
      />
    </I18nProvider>,
  );
  return onPlay;
}

describe('GameplayHand', () => {
  it('renders accessible viewer cards in read-only mode', () => {
    renderHand({ mode: 'read-only' });
    const hand = screen.getByRole('group', { name: 'Your hand' });
    expect(within(hand).getAllByRole('button')).toHaveLength(2);
    expect(within(hand).getByRole('button', { name: 'Ace of hearts' })).toBeDisabled();
    expect(within(hand).getByRole('button', { name: '2 of clubs' })).toBeDisabled();
  });

  it('enables only legal cards in active play mode', async () => {
    const user = userEvent.setup();
    const onPlay = renderHand({ mode: 'play', active: true });
    const legal = screen.getByRole('button', { name: 'Ace of hearts' });
    const illegal = screen.getByRole('button', { name: '2 of clubs' });
    expect(legal).toBeEnabled();
    expect(illegal).toBeDisabled();
    await user.click(legal);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(cards[0]);
  });

  it('disables every card when play mode is inactive or busy', () => {
    renderHand({ mode: 'play', active: false });
    for (const card of screen.getAllByRole('button')) expect(card).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run focused UI tests and verify RED**

```powershell
npx vitest run `
  src/app/components/GameplayHand.test.tsx `
  src/app/screens/ActiveGameplayBiddingScreen.test.tsx
```

Expected: non-zero exit because `GameplayHand` does not exist and the bidding screen does not render `ownHand`.

- [ ] **Step 4: Commit the RED tests only**

```powershell
git add `
  src/app/components/GameplayHand.test.tsx `
  src/app/screens/ActiveGameplayBiddingScreen.test.tsx

git commit -m "test: reproduce hidden hand during bidding"
```

---

### Task 2: Extract the reusable hand component

**Files:**
- Create: `src/app/components/GameplayHand.tsx`
- Modify: `src/app/components/GameplayCardPanel.tsx`
- Test: `src/app/components/GameplayHand.test.tsx`
- Test: `src/app/components/GameplayCardPanel.test.tsx`

**Interfaces:**
- Consumes: viewer cards, legal cards, mode, active/busy state, and optional `onPlay` callback.
- Produces: one accessible card renderer used by both bidding and card play.

- [ ] **Step 1: Create the shared component with exact public props**

Create `src/app/components/GameplayHand.tsx`:

```tsx
import type { Card, CardSuit, Rank } from '../../domain/card.js';
import { cardId } from '../../domain/card.js';
import { useI18n } from '../i18n/I18nContext.js';

const SUIT_SYMBOLS: Readonly<Record<CardSuit, string>> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const RANK_LABELS: Readonly<Record<Rank, string>> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
};

function accessibleCardName(card: Card): string {
  return `${RANK_LABELS[card.rank]} of ${card.suit}`;
}

function isRedSuit(suit: CardSuit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function GameplayHand({
  cards,
  legalCards = [],
  mode,
  active = false,
  busy = false,
  onPlay,
}: {
  readonly cards: readonly Card[];
  readonly legalCards?: readonly Card[];
  readonly mode: 'read-only' | 'play';
  readonly active?: boolean;
  readonly busy?: boolean;
  readonly onPlay?: (card: Card) => Promise<void>;
}) {
  const { t } = useI18n();
  const legalIds = new Set(legalCards.map((card) => cardId(card)));
  const readOnly = mode === 'read-only';

  return (
    <div
      className={`gameplay-hand${readOnly ? ' gameplay-hand--read-only' : ''}`}
      role="group"
      aria-label={t('yourHand')}
    >
      {cards.map((card) => {
        const legal = mode === 'play' && active && legalIds.has(cardId(card));
        const enabled = legal && !busy && onPlay !== undefined;
        return (
          <button
            key={cardId(card)}
            type="button"
            className={`playing-card${isRedSuit(card.suit) ? ' playing-card--red' : ''}${legal ? ' playing-card--legal' : ''}`}
            aria-label={accessibleCardName(card)}
            disabled={!enabled}
            onClick={() => {
              if (enabled) void onPlay(card);
            }}
          >
            <span>{card.rank}</span>
            <span aria-hidden="true">{SUIT_SYMBOLS[card.suit]}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Replace the duplicated card-hand rendering in `GameplayCardPanel`**

Keep `compactCardName()` and current-trick rendering local. Remove the local hand-only constants/functions that moved to `GameplayHand`, import the component, and replace the existing hand `<div>` with:

```tsx
<GameplayHand
  cards={snapshot.ownHand}
  legalCards={snapshot.legalCards}
  mode="play"
  active={isViewerTurn}
  busy={busy}
  onPlay={onPlay}
/>
```

- [ ] **Step 3: Run component-focused tests and verify GREEN**

```powershell
npx vitest run `
  src/app/components/GameplayHand.test.tsx `
  src/app/components/GameplayCardPanel.test.tsx
```

Expected: both files pass and existing legal-card behavior remains unchanged.

- [ ] **Step 4: Commit the shared component extraction**

```powershell
git add `
  src/app/components/GameplayHand.tsx `
  src/app/components/GameplayHand.test.tsx `
  src/app/components/GameplayCardPanel.tsx `
  src/app/components/GameplayCardPanel.test.tsx

git commit -m "refactor: share gameplay hand rendering"
```

---

### Task 3: Render the read-only hand during bidding

**Files:**
- Modify: `src/app/components/GameplayBidPanel.tsx`
- Modify: `src/app/styles/gameplay.css`
- Test: `src/app/screens/ActiveGameplayBiddingScreen.test.tsx`

**Interfaces:**
- Consumes: `snapshot.ownHand` from the existing viewer-scoped round snapshot.
- Produces: 13 clearly visible, disabled cards during every bidding state.

- [ ] **Step 1: Import and render `GameplayHand` in bidding**

Add:

```ts
import { GameplayHand } from './GameplayHand.js';
```

Inside `GameplayBidPanel`, after the bidding form/waiting status branch and before the closing section tag, render:

```tsx
{snapshot.phase === 'bidding' && (
  <GameplayHand
    cards={snapshot.ownHand}
    mode="read-only"
  />
)}
```

This must render both when it is the viewer’s turn and while waiting for another bidder.

- [ ] **Step 2: Preserve full opacity for read-only bidding cards**

In `src/app/styles/gameplay.css`, immediately after the existing `.playing-card:disabled` rule, add:

```css
.gameplay-hand--read-only .playing-card:disabled {
  opacity: 1;
  cursor: default;
}
```

Do not change the dimmed disabled state used during card play.

- [ ] **Step 3: Run the bidding and card-panel focused tests**

```powershell
npx vitest run `
  src/app/components/GameplayHand.test.tsx `
  src/app/components/GameplayCardPanel.test.tsx `
  src/app/screens/ActiveGameplayBiddingScreen.test.tsx
```

Expected: all focused UI tests pass.

- [ ] **Step 4: Check mobile rendering through the gameplay build**

```powershell
npm run typecheck:app
npm run build:gameplay
```

Expected: both commands exit `0`; the existing flex-wrap hand layout remains within the responsive shell at 30rem and 48rem breakpoints.

- [ ] **Step 5: Commit bidding visibility**

```powershell
git add `
  src/app/components/GameplayBidPanel.tsx `
  src/app/styles/gameplay.css `
  src/app/screens/ActiveGameplayBiddingScreen.test.tsx

git commit -m "feat: show viewer hand during bidding"
```

---

### Task 4: Verify, publish, deploy with approval, and run hosted UI UAT

**Files:**
- Verify: files changed in Tasks 1–3 and this plan.
- Reference: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`.

**Interfaces:**
- Consumes: the completed read-only bidding hand implementation.
- Produces: one CI-green frontend SHA and one guarded gameplay-only Vercel deployment after approval.

- [ ] **Step 1: Run full local verification**

```powershell
npm run ci
npm run ci:isolation
```

Expected: both commands exit `0`.

- [ ] **Step 2: Inspect exact scope and patch quality**

```powershell
git status --short
git diff --check
git diff --stat
git diff
```

Required scope:

```text
src/app/components/GameplayHand.tsx
src/app/components/GameplayHand.test.tsx
src/app/components/GameplayCardPanel.tsx
src/app/components/GameplayCardPanel.test.tsx
src/app/components/GameplayBidPanel.tsx
src/app/screens/ActiveGameplayBiddingScreen.test.tsx
src/app/styles/gameplay.css
docs/superpowers/plans/2026-07-28-bidding-hand-visibility.md
```

- [ ] **Step 3: Commit and push any remaining verified changes**

```powershell
git add `
  src/app/components/GameplayHand.tsx `
  src/app/components/GameplayHand.test.tsx `
  src/app/components/GameplayCardPanel.tsx `
  src/app/components/GameplayCardPanel.test.tsx `
  src/app/components/GameplayBidPanel.tsx `
  src/app/screens/ActiveGameplayBiddingScreen.test.tsx `
  src/app/styles/gameplay.css `
  docs/superpowers/plans/2026-07-28-bidding-hand-visibility.md

git commit -m "feat: display the private hand while bidding"
git push origin feature/online-game-bot-mvp
```

Skip the final commit if all implementation tasks were already committed and the working tree is clean; push the existing verified commits instead.

- [ ] **Step 4: Verify GitHub CI and PR state**

Confirm on the exact pushed SHA:

```text
Validate package: success
Validate isolation boundaries: success
PR #14: open, draft, unmerged
```

Stop and request explicit Vercel deployment approval.

- [ ] **Step 5: Run the guarded Vercel dry-run**

After approval, set the browser-safe key through a hidden prompt and never print it:

```powershell
$testedSha = (git rev-parse HEAD).Trim()
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
} finally {
  Remove-Item Env:GAMEPLAY_UAT_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
}
```

Required non-secret output:

```text
Gameplay Vercel target verified: estimation-gameplay-uat
Expected Supabase URL embedded: true
Expected workspace slug embedded: true
Expected publishable key embedded: true
Prohibited secret values detected: false
Dry run complete. No Vercel deployment was started.
```

- [ ] **Step 6: Run the guarded canonical UAT deployment**

Re-enter the key through the hidden prompt and run the same wrapper without `--dry-run`:

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
} finally {
  Remove-Item Env:GAMEPLAY_UAT_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
}
```

- [ ] **Step 7: Run hosted bidding-hand UAT**

Create a fresh private table named `Solo UAT Bidding Hand Retest 6`, start once, and stop on the first human estimate turn without refreshing.

Acceptance:

```text
13 viewer cards visible during bidding
all 13 bidding cards disabled
estimate control remains usable
no other private hand visible
no card becomes clickable before playing phase
```

After submitting one estimate, confirm the hand remains visible while waiting for the next bidder. Continue only far enough to reach the first human card turn and confirm legal-card interaction still works exactly as before.
