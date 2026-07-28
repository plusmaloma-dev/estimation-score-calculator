# Bidding Hand Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the authenticated viewer’s complete private hand throughout bidding as non-interactive cards while preserving existing legal-card interaction during play.

**Architecture:** Extract the existing card rendering into a reusable `GameplayHand` component with explicit `read-only` and `play` modes. `GameplayBidPanel` renders `snapshot.ownHand` in read-only mode; `GameplayCardPanel` delegates its existing playing behavior to the same component. No API, Function, or database change is required.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Vite gameplay build, guarded Vercel deployment.

## Global Constraints

- Begin only after the human action-boundary synchronization plan passes hosted UAT.
- Work only in `C:\Users\rjamm\estimation-gameplay-uat` on `feature/online-game-bot-mvp`.
- Keep PR #14 open, draft, unmerged, and unauthorized for merge.
- Do not change Supabase Functions, migrations, database objects, or score UAT.
- Render only `snapshot.ownHand`; never derive or expose another seat’s private cards.
- Bidding cards must remain disabled and must never receive the legal-card style.
- Existing playing-phase legal-card interaction must remain unchanged.
- Deploy only `estimation-gameplay-uat`, only after explicit approval, through the guarded Vercel wrapper.
- Never print or share the browser-safe publishable key; enter it only through a hidden prompt.
- Commit and push only after focused GREEN, `npm run ci`, and `npm run ci:isolation` pass.

---

### Task 1: Add RED tests for the hidden bidding hand

**Files:**
- Create: `src/app/components/GameplayHand.test.tsx`
- Modify: `src/app/screens/ActiveGameplayBiddingScreen.test.tsx`
- Future create: `src/app/components/GameplayHand.tsx`

**Interfaces:**
- Consumes: `OnlineGameplayRoundSnapshot.ownHand`.
- Produces: tests requiring 13 disabled viewer cards during bidding and preserved legal-card behavior in play mode.

- [ ] **Step 1: Add the bidding-screen RED test**

Append to `ActiveGameplayBiddingScreen.test.tsx`:

```tsx
it('shows all viewer cards as read-only while bidding', async () => {
  renderScreen(services(roundSnapshot()), 'user-2');

  const hand = await screen.findByRole('group', { name: 'Your hand' });
  const cards = within(hand).getAllByRole('button');

  expect(cards).toHaveLength(13);
  for (const card of cards) expect(card).toBeDisabled();
  expect(within(hand).getByRole('button', { name: '2 of spades' })).toBeVisible();
  expect(within(hand).getByRole('button', { name: 'Ace of spades' })).toBeVisible();
  expect(screen.queryByText('Opponent hand')).not.toBeInTheDocument();
});
```

The exact names come from `CARD_SUITS[0] === 'spades'` and the canonical rank order `2` through `A`.

- [ ] **Step 2: Add the reusable component RED test**

Create `src/app/components/GameplayHand.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayHand } from './GameplayHand.js';

const cards: readonly Card[] = [
  { suit: 'hearts', rank: 'A' },
  { suit: 'clubs', rank: '2' },
];

function renderHand(input: {
  readonly mode: 'read-only' | 'play';
  readonly active?: boolean;
  readonly busy?: boolean;
}) {
  const onPlay = vi.fn(async () => undefined);
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
  it('renders accessible cards in read-only mode', () => {
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

  it('disables all cards when play mode is inactive or busy', () => {
    const { rerender } = render(
      <I18nProvider>
        <GameplayHand cards={cards} legalCards={cards} mode="play" active={false} onPlay={vi.fn()} />
      </I18nProvider>,
    );
    for (const card of screen.getAllByRole('button')) expect(card).toBeDisabled();

    rerender(
      <I18nProvider>
        <GameplayHand cards={cards} legalCards={cards} mode="play" active busy onPlay={vi.fn()} />
      </I18nProvider>,
    );
    for (const card of screen.getAllByRole('button')) expect(card).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run RED**

```powershell
npx vitest run `
  src/app/components/GameplayHand.test.tsx `
  src/app/screens/ActiveGameplayBiddingScreen.test.tsx
```

Expected: non-zero exit because `GameplayHand` does not exist and bidding does not render a hand.

- [ ] **Step 4: Commit RED**

```powershell
git add src/app/components/GameplayHand.test.tsx src/app/screens/ActiveGameplayBiddingScreen.test.tsx
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
- Consumes: viewer cards, legal cards, `read-only`/`play` mode, active state, busy state, and `onPlay`.
- Produces: one accessible hand renderer shared by bidding and card play.

- [ ] **Step 1: Create `GameplayHand.tsx`**

```tsx
import type { Card, CardSuit, Rank } from '../../domain/card.js';
import { cardId } from '../../domain/card.js';
import { useI18n } from '../i18n/I18nContext.js';

const SUIT_SYMBOLS: Readonly<Record<CardSuit, string>> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};
const RANK_LABELS: Readonly<Record<Rank, string>> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace',
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
  const legalIds = new Set(legalCards.map(cardId));
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

- [ ] **Step 2: Use it from `GameplayCardPanel`**

Keep `compactCardName()` and current-trick rendering local. Remove the hand-only accessible-name and button rendering. Import `GameplayHand` and replace the existing hand block with:

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

- [ ] **Step 3: Run component GREEN**

```powershell
npx vitest run src/app/components/GameplayHand.test.tsx src/app/components/GameplayCardPanel.test.tsx
```

Expected: all tests pass; legal card submission remains one call with the selected card.

- [ ] **Step 4: Commit**

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
- Consumes: `snapshot.ownHand`.
- Produces: 13 fully visible disabled cards during both acting and waiting bidding states.

- [ ] **Step 1: Render the hand in `GameplayBidPanel`**

Import:

```ts
import { GameplayHand } from './GameplayHand.js';
```

After the bidding form/waiting branch, add:

```tsx
{snapshot.phase === 'bidding' && (
  <GameplayHand cards={snapshot.ownHand} mode="read-only" />
)}
```

- [ ] **Step 2: Keep bidding cards fully visible**

Immediately after `.playing-card:disabled`, add:

```css
.gameplay-hand--read-only .playing-card:disabled {
  opacity: 1;
  cursor: default;
}
```

Do not alter the normal disabled opacity used during card play.

- [ ] **Step 3: Run focused GREEN and build**

```powershell
npx vitest run `
  src/app/components/GameplayHand.test.tsx `
  src/app/components/GameplayCardPanel.test.tsx `
  src/app/screens/ActiveGameplayBiddingScreen.test.tsx
npm run typecheck:app
npm run build:gameplay
```

Expected: all commands exit `0`.

- [ ] **Step 4: Commit**

```powershell
git add `
  src/app/components/GameplayBidPanel.tsx `
  src/app/styles/gameplay.css `
  src/app/screens/ActiveGameplayBiddingScreen.test.tsx

git commit -m "feat: show viewer hand during bidding"
```

---

### Task 4: Verify, publish, deploy with approval, and run hosted UAT

**Files:**
- Verify: Task 1–3 files and this plan.
- Reference: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`.

**Interfaces:**
- Produces: one CI-green frontend SHA and one guarded gameplay Vercel deployment after approval.

- [ ] **Step 1: Run full verification**

```powershell
npm run ci
npm run ci:isolation
git diff --check
git status --short
git diff --stat
```

Expected: all commands succeed; scope is limited to hand component/tests, bid/card panels, bidding screen test, gameplay CSS, and this plan.

- [ ] **Step 2: Push verified commits**

```powershell
git push origin feature/online-game-bot-mvp
```

- [ ] **Step 3: Verify GitHub CI and PR**

Required on the exact pushed SHA:

```text
Validate package: success
Validate isolation boundaries: success
PR #14: open, draft, unmerged
```

Stop and request explicit Vercel deployment approval.

- [ ] **Step 4: Run the guarded Vercel dry-run after approval**

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

Required output includes `Prohibited secret values detected: false` and `Dry run complete. No Vercel deployment was started.`

- [ ] **Step 5: Run the guarded canonical UAT deployment**

Re-enter the key through the hidden prompt and run:

```powershell
try {
  npm run deploy:gameplay-vercel -- `
    --expected-sha $testedSha `
    --supabase-url https://stedjwppoanbmhxsfhcg.supabase.co `
    --workspace-slug estimation-gameplay-uat
} finally {
  Remove-Item Env:GAMEPLAY_UAT_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
}
```

Before this block, repeat the hidden-key initialization from Step 4 so `GAMEPLAY_UAT_PUBLISHABLE_KEY` is set only for the guarded command.

- [ ] **Step 6: Run hosted bidding-hand UAT**

Create a fresh private table:

```text
Name: Solo UAT Bidding Hand Retest 6
Turn timer: 45 seconds
Disconnect grace: 60 seconds
```

Without refreshing, stop at the first human estimate turn and verify:

```text
13 viewer cards visible
all 13 cards disabled
2 of spades and Ace of spades present in the viewer hand
estimate control usable
no other private hand visible
no legal-card styling before playing phase
```

Submit one estimate and confirm the hand remains visible while waiting. Continue only to the first human card turn and confirm legal-card interaction still works.
