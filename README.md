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

## Usage Example

```ts
import {
  EstimationMvpService,
  type RoundScoreInput,
} from './src/index.js';

const service = new EstimationMvpService();

const result = service.calculateRound({
  roundNumber: 1,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 4 },
    { playerId: 'B', bidType: 'normal', tricks: 3 },
    { playerId: 'C', bidType: 'normal', tricks: 3 },
    { playerId: 'D', bidType: 'normal', tricks: 4 },
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
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4 },
        { playerId: 'B', bidType: 'normal', tricks: 3 },
        { playerId: 'C', bidType: 'normal', tricks: 3 },
        { playerId: 'D', bidType: 'normal', tricks: 4 },
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

## Project Rules

This repository follows Egyptian Estimation rules only and intentionally does not implement Planning Poker concepts.
