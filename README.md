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

if (result.valid) {
  console.log(result.playerScores);
}
```

## Project Rules

This repository follows Egyptian Estimation rules only and intentionally does not implement Planning Poker concepts.