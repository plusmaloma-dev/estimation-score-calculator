# Estimation Score Calculator

For the shared Supabase/Vercel acceptance environment, use the [online UAT deployment runbook](docs/UAT_DEPLOYMENT.md).

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
- Game-level selection between House Rules V1 and Federation 2026

## Rule-Set Selection

Select one scoring rule set when creating a game. The selection is stored on `MvpGameInput`, used for every round, and preserved by score-sheet repositories and JSON backups.

```ts
import {
  EstimationMvpService,
  FEDERATION_2026,
  HOUSE_RULES_V1,
} from './src/index.js';

const houseGame = new EstimationMvpService().calculateGame({
  ruleSet: HOUSE_RULES_V1,
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [],
});

const federationGame = new EstimationMvpService().calculateGame({
  ruleSet: FEDERATION_2026,
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [],
});

console.log(houseGame.ruleSet);
console.log(federationGame.ruleSet);
```

Games and imported backups without a stored selection resolve to `HOUSE_RULES_V1`. Browser-created score sheets always store the resolved selection, and later round saves keep it locked for the game.

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
  HOUSE_RULES_V1,
  InMemoryScoreSheetRepository,
} from './src/index.js';

const service = new EstimationMvpService();
const repository = new InMemoryScoreSheetRepository();

const gameInput = {
  ruleSet: HOUSE_RULES_V1,
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
- Game-level scoring rule-set selection.
- Draft score-sheet creation through a `ScoreSheetRepository`.
- Round preview through `EstimationMvpService` before saving.
- Valid-round save flow with updated game result and leaderboard.
- Round-history projection for score-sheet screens.
- JSON backup export through `ScoreSheetBackupService`.

```ts
import {
  BrowserUiShellService,
  FEDERATION_2026,
  LocalStorageScoreSheetRepository,
} from './src/index.js';

const ui = new BrowserUiShellService(
  new LocalStorageScoreSheetRepository(window.localStorage),
);

const created = ui.createScoreSheet({
  name: 'Friday Game',
  ruleSet: FEDERATION_2026,
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
console.log(created.scoreSheet?.gameInput.ruleSet);
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

## Player Analytics

Use `PlayerAnalyticsService` for dashboard-ready player performance summaries. It consumes an already calculated game result and does not recalculate scores or change Egyptian Estimation rules.

```ts
import {
  EstimationMvpService,
  PlayerAnalyticsCsvExportService,
  PlayerAnalyticsMarkdownExportService,
  PlayerAnalyticsService,
} from './src/index.js';

const gameResult = new EstimationMvpService().calculateGame(gameInput);
const analytics = new PlayerAnalyticsService().summarizeGame(gameResult, {
  playerOrder: gameInput.playerOrder,
});

const markdown = new PlayerAnalyticsMarkdownExportService().exportSummary(analytics, {
  title: 'Friday Game Analytics',
  generatedAt: new Date(),
});

const csv = new PlayerAnalyticsCsvExportService().exportSummary(analytics, {
  includeSummaryRows: true,
});

console.log(analytics.players);
console.log(markdown);
console.log(csv);
```

Player analytics include ranking, exact-bid rate, failure rate, Dash/Dash Call success rates, risk and double-risk success rates, WITH/high-contract counts, all-loser counts, leader, and most-consistent player metadata. The Markdown and CSV formatters are presentation/export adapters only.

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

Markdown score-sheet exports include final standings, invalid-round notes, per-round deltas, and running scores. JSON backup remains the machine-readable import/export format and preserves the game rule-set selection.

## Score-Sheet CSV Export

Use `ScoreSheetCsvExportService` when a UI or API needs spreadsheet-friendly round rows for a calculated score sheet. It consumes the existing `MvpGameInput` and `MvpGameResult`; it does not recalculate scores or introduce new Egyptian Estimation rules.

```ts
import { ScoreSheetCsvExportService } from './src/index.js';

const csv = new ScoreSheetCsvExportService().exportScoreSheet({
  title: 'Friday Game',
  gameInput,
  gameResult,
  includeMetadataRows: true,
  generatedAt: new Date(),
});

console.log(csv);
```

Score-sheet CSV exports include round number, Over/Under type, player bid type, bid/actual/delta/score, status, role, risk metadata, cumulative running score, notes, and invalid-round validation notes. JSON backup remains the machine-readable import/export format and preserves the game rule-set selection.

## Federation All-Pass Auction Flow

Federation auction resolution happens before trick entry and scoring. Four unique passes cancel the current deal and return a redeal instruction with the same dealer and the same round number.

```ts
const playerIds = ['A', 'B', 'C', 'D'];
const auction = ui.resolveFederationAuction(scoreSheetId, {
  roundNumber: 5,
  dealerPlayerId: 'A',
  actions: playerIds.map((playerId) => ({
    playerId,
    actionType: 'pass' as const,
  })),
});

if (auction.status === 'redeal-required') {
  console.log(auction.roundNumber); // 5
  console.log(auction.nextDealerPlayerId); // A
  // Shuffle and deal again, then begin a fresh auction.
}
```

The cancelled deal is not written to the score sheet. Round history, balances, leaderboard, timestamps, Risk, bonuses, penalties, and multipliers remain unchanged. The method is available only for score sheets locked to `FEDERATION_2026`.
