# Estimation Score Calculator

Score calculation engine for the Egyptian Estimation card game (إستيميشن).

## MVP Capabilities

- Bid validation
- Over/Under round validation (totals must never equal 13)
- Highest-bid resolution
- Round score calculation
- Risk and Double Risk handling
- Dash and Dash Call scoring
- WITH support
- Leaderboard aggregation
- Optional score-sheet persistence boundary
- Game/player statistics summaries
- Versioned JSON backup import/export boundary

## Usage Example

```ts
import {
  EstimationMvpService,
  type RoundScoreInput,
} from './src/index.js';

const service = new EstimationMvpService();

const result = service.calculateRound({
  roundNumber: 1,
  profile: {
    id: 'standard',
    name: 'Standard',
    type: 'standard',
    winnerBaseBonus: 10,
  },
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
    { playerId: 'B', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
    { playerId: 'C', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
    { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'clubs' },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 4 },
    { playerId: 'B', actualTricks: 3 },
    { playerId: 'C', actualTricks: 2 },
    { playerId: 'D', actualTricks: 4 },
  ],
});

if (result.valid && result.scoreResult) {
  console.log(result.scoreResult.playerScores);
}
```

## Persistence Boundary

Persistence is intentionally optional and framework-agnostic. The scoring engine can run without any database, file system, browser storage, or API framework.

Use the `ScoreSheetRepository` interface when a UI/API needs to save and restore score sheets. The MVP includes `InMemoryScoreSheetRepository` for tests, demos, and future adapter development.

```ts
import {
  EstimationMvpService,
  InMemoryScoreSheetRepository,
} from './src/index.js';

const service = new EstimationMvpService();
const repository = new InMemoryScoreSheetRepository();

const gameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [
    {
      roundNumber: 1,
      profile: {
        id: 'standard',
        name: 'Standard',
        type: 'standard',
        winnerBaseBonus: 10,
      },
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
        { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'clubs' },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 2 },
        { playerId: 'D', actualTricks: 4 },
      ],
    },
  ],
};

const gameResult = service.calculateGame(gameInput);

const saved = repository.save({
  name: 'Friday Game',
  status: 'finalized',
  gameInput,
  gameResult,
});

console.log(repository.getById(saved.id));
console.log(repository.list());
```

Future storage adapters should implement `ScoreSheetRepository` and preserve the current DTO boundary instead of coupling the scoring engine to a specific database.

### Browser Local Storage Adapter

Use `LocalStorageScoreSheetRepository` for the first browser/mobile prototype. It implements the same repository interface and accepts an injected storage-like object, so tests can run without browser globals.

```ts
import { LocalStorageScoreSheetRepository } from './src/index.js';

const repository = new LocalStorageScoreSheetRepository(window.localStorage);

const saved = repository.save({
  name: 'Browser Game',
  status: 'draft',
  gameInput,
});

console.log(repository.getById(saved.id));
```

The adapter uses one namespaced key: `egyptian-estimation:score-sheets:v1`. Missing or corrupt stored data is treated as an empty repository so the UI can recover safely.

### Document Store Adapter

Use `DocumentScoreSheetRepository` when an API or database layer can provide basic document-store operations. The adapter satisfies `ScoreSheetRepository` while keeping database-specific clients outside the scoring engine.

```ts
import {
  DocumentScoreSheetRepository,
  type ScoreSheetDocumentStore,
} from './src/index.js';

const store: ScoreSheetDocumentStore = {
  upsert: (document) => database.scoreSheets.upsert(document),
  getById: (id) => database.scoreSheets.findById(id),
  list: () => database.scoreSheets.findAll(),
  deleteById: (id) => database.scoreSheets.delete(id),
};

const repository = new DocumentScoreSheetRepository(store);
```

The document-store adapter intentionally does not import database libraries. A server, IndexedDB wrapper, SQLite layer, or cloud database adapter can translate these four operations into its own persistence calls without changing Egyptian Estimation scoring services.

## Browser UI Shell

`BrowserUiShellService` is a framework-neutral application shell for the first browser/mobile UI. It keeps screens and storage outside the scoring engine while giving React, Vue, Svelte, vanilla TypeScript, or mobile wrappers one stable service to call.

The shell supports:

- Four-player score-sheet setup validation.
- Draft score-sheet creation through a `ScoreSheetRepository`.
- Round preview through `EstimationMvpService` before saving.
- Valid-round save flow with updated game result and leaderboard.
- Round-history projection for score-sheet screens.
- JSON backup export through `ScoreSheetBackupService`.

```ts
import {
  BrowserUiShellService,
  LocalStorageScoreSheetRepository,
} from './src/index.js';

const ui = new BrowserUiShellService(
  new LocalStorageScoreSheetRepository(window.localStorage),
);

const created = ui.createScoreSheet({
  name: 'Friday Game',
  players: [
    { id: 'A', name: 'Ahmed' },
    { id: 'B', name: 'Bassem' },
    { id: 'C', name: 'Cairo' },
    { id: 'D', name: 'Dina' },
  ],
});

if (!created.valid) {
  console.error(created.errors);
}

const scoreSheetId = created.scoreSheet?.id ?? '';
console.log(ui.getRoundHistory(scoreSheetId));
console.log(ui.getLeaderboard(scoreSheetId));
```

Concrete browser components should call this shell instead of importing scoring services directly. That keeps Egyptian Estimation scoring rules isolated from presentation and storage details.

## Statistics

Use `StatisticsService` after calculating a game result. Statistics are derived from score results and do not introduce new Egyptian Estimation scoring rules, UI coupling, or database coupling.

```ts
import {
  EstimationMvpService,
  StatisticsService,
} from './src/index.js';

const gameResult = new EstimationMvpService().calculateGame(gameInput);
const statistics = new StatisticsService().summarizeGame(gameResult, {
  playerOrder: gameInput.playerOrder,
});

console.log(statistics.playerStatistics);
console.log(statistics.highestScorePlayerId);
```

The player statistics DTO includes totals, rounds played, exact-bid rate, average score, best/worst round, Dash/Dash Call counters, risk counters, WITH participation, and high-contract counts.

## Rich Markdown Score-Sheet Export

Use `ScoreSheetMarkdownExportService` when a UI or API needs a human-readable score-sheet export. It consumes an already calculated `MvpGameResult`; it does not recalculate scores or introduce new Egyptian Estimation rules.

```ts
import { ScoreSheetMarkdownExportService } from './src/index.js';

const markdown = new ScoreSheetMarkdownExportService().exportScoreSheet({
  title: 'Friday Game',
  gameInput,
  gameResult,
  generatedAt: new Date(),
});

console.log(markdown);
```

The Markdown export includes final standings, per-round player bid/actual/delta/score rows, status/notes, next-round multiplier notes, and validation errors for invalid unscored rounds.

## Import/export

Use `ScoreSheetBackupService` to create or validate versioned JSON backup documents for persisted score sheets. The backup format is explicitly named for Egyptian Estimation score sheets and is not compatible with Planning Poker estimates.

```ts
import { ScoreSheetBackupService } from './src/index.js';

const backupService = new ScoreSheetBackupService();

const backup = backupService.exportScoreSheets({
  scoreSheets: [saved],
  source: 'web-ui',
});

const imported = backupService.importScoreSheets(backup);

if (imported.valid) {
  console.log(imported.document.scoreSheets);
} else {
  console.error(imported.errors);
}
```

Future adapters can serialize the backup document to a file, browser download, cloud object, or API response without changing the scoring engine.

## Validation

Run the consolidated validation command before closing implementation slices or merging changes:

```sh
npm run ci
```

The command intentionally matches the GitHub Actions workflow and runs:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`

If GitHub Actions is not visible for a commit, use a local `npm run ci` result as the acceptance evidence and record the result in `PROJECT_LOG.md` before marking backlog items complete.
