# Federation All-Pass Round Design

## Goal

Model the Federation 2026 all-pass outcome before trick scoring begins.

When all four players pass during the auction:

- The current deal is cancelled.
- No tricks are played.
- No score, bonus, penalty, Risk, Double Risk, or multiplier is applied.
- No completed round is added to game history.
- The cards are reshuffled and dealt again.
- The same dealer deals again.
- The same round number is reused.
- A fresh auction starts.

House Rules V1 remains unchanged.

## Scope

This slice adds a small Federation auction-resolution boundary and exposes it through the framework-neutral browser application shell.

It does not implement a full auction engine. The following remain outside this slice:

- Auction turn-order enforcement.
- Bid ranking and auction-winner resolution.
- WITH ownership created during the auction.
- Frontend screens or controls.
- Card shuffling or dealing logic.

## Architecture

### Federation auction service

Add a dedicated `FederationAuctionService` under `src/auction/`.

The service receives:

- The current round number.
- The current dealer player id.
- The four game player ids.
- Auction actions recorded for the current deal.

For this slice, an auction action only needs to distinguish `pass` from `bid`. Bid details are not needed to decide whether an all-pass redeal is required.

The service validates that:

- The round number is a positive integer.
- Exactly four unique game players are supplied.
- The dealer belongs to the game.
- Each auction action belongs to a game player.
- A player appears at most once in the current auction attempt.
- No more than four actions are supplied.

It returns one of three outcomes:

```ts
type FederationAuctionResolution =
  | {
      readonly valid: true;
      readonly errors: readonly [];
      readonly status: 'continue-auction';
      readonly roundNumber: number;
      readonly dealerPlayerId: string;
    }
  | {
      readonly valid: true;
      readonly errors: readonly [];
      readonly status: 'redeal-required';
      readonly reason: 'all-pass';
      readonly roundNumber: number;
      readonly dealerPlayerId: string;
      readonly nextDealerPlayerId: string;
    }
  | {
      readonly valid: false;
      readonly errors: readonly string[];
      readonly status: 'invalid';
    };
```

Exactly four unique `pass` actions produce `redeal-required`.

Any partial auction, or any auction containing a bid, produces `continue-auction`.

For `redeal-required`:

```ts
nextDealerPlayerId === dealerPlayerId
```

and the returned `roundNumber` is unchanged.

### Browser application shell

Add a method to `BrowserUiShellService` that resolves a Federation auction attempt for an existing score sheet.

The method will:

1. Load the score sheet.
2. Reject a missing score sheet.
3. Reject score sheets whose locked rule set is not `FEDERATION_2026`.
4. Pass the score sheet player order and the supplied auction attempt to `FederationAuctionService`.
5. Return the auction resolution without saving the score sheet.

Because the method performs no repository write:

- `gameInput.rounds` remains unchanged.
- `gameResult.rounds` remains unchanged.
- The leaderboard remains unchanged.
- The score-sheet update timestamp remains unchanged.

The replacement deal begins outside the scoring engine using the returned same dealer and same round number.

## Data Flow

```text
Federation score sheet
  → auction actions collected
  → BrowserUiShellService.resolveFederationAuction(...)
  → FederationAuctionService.resolve(...)

Four passes
  → redeal-required
  → same dealer
  → same round number
  → no persistence mutation
  → reshuffle/redeal externally
  → fresh auction

Any bid or fewer than four actions
  → continue-auction
```

The scoring services are not called for an all-pass attempt.

## Error Handling

Validation uses result objects rather than exceptions, following the existing service style.

Representative errors include:

- `Round number must be a positive integer.`
- `Exactly four unique players are required for a Federation auction.`
- `Dealer must be one of the game players.`
- `Auction action player is not part of the game: <id>.`
- `Player <id> cannot act more than once in the same auction attempt.`
- `A Federation auction cannot contain more than four actions.`
- `Federation auction resolution is only available for FEDERATION_2026 score sheets.`

Invalid attempts do not modify persistence.

## Testing

### Core service tests

Cover:

- Four unique passes return `redeal-required`.
- The same dealer is returned as `nextDealerPlayerId`.
- The same round number is returned.
- One bid among four actions returns `continue-auction`.
- Fewer than four passes return `continue-auction`.
- Duplicate actions are rejected.
- Unknown players are rejected.
- Invalid dealer and round number are rejected.

### Browser-shell integration tests

Cover:

- A Federation score sheet returns `redeal-required` after four passes.
- The score sheet has the same round count before and after resolution.
- No score, leaderboard, or timestamp change occurs.
- A House Rules V1 score sheet rejects Federation auction resolution.
- Invalid auction input does not mutate the score sheet.

### Regression verification

Run the complete project CI command:

```bash
npm run ci
```

All existing House Rules V1 and Federation scoring tests must remain green.

## Acceptance Criteria

The feature is complete when:

1. Four Federation auction passes return a redeal-required outcome.
2. The same dealer is retained.
3. The same round number is retained.
4. No scoring engine call or score-sheet mutation occurs.
5. No round-history, balance, leaderboard, Risk, bonus, penalty, or multiplier change occurs.
6. A fresh auction can begin using the returned context.
7. House Rules V1 behavior is unchanged.
