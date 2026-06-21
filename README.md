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

## Project Rules

This repository follows Egyptian Estimation rules only and intentionally does not implement Planning Poker concepts.
