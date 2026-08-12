import { describe, expect, it } from 'vitest';
import type { ActiveRoundPresentation } from './ActiveRoundPresentation.js';
import { createGameplayTablePresentation } from './GameplayTablePresentation.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';

const snapshot = {
  tableId: 'table-1', roundNumber: 3, phase: 'playing', version: 4, viewerSeat: 2,
  dealerSeat: 1, callerSeat: 0, trumpSuit: 'spades', currentTurnSeat: 2,
  players: [0, 1, 2, 3].map((seat) => ({
    seat, playerId: `internal-${seat}`, displayName: seat === 0 ? 'Rami' : `Standard Bot ${seat + 1}`,
    isBot: seat !== 0, cardCount: 13, actualTricks: seat, cumulativeScore: [42, 55, 31, 38][seat],
  })),
  ownHand: [], legalNormalEstimates: [], estimateOptions: [], legalAuctionActions: [], legalCards: [],
  currentTrick: [], completedTricks: [], cumulativeScoresBySeat: [42, 55, 31, 38], scoreHistory: [],
} as unknown as OnlineGameplayRoundSnapshot;

const compatible = {
  phase: 'playing', roundNumber: 3, viewerSeat: 2, viewerActionRequired: true, activeSeat: 2,
  actionKind: 'card', totalEstimatedTricks: 13, estimateStatus: 'at-13', estimateDistanceFrom13: 0,
  estimatesComplete: true, seatControls: [], currentTrick: [], ownHand: [], legalNormalEstimates: [],
  legalCards: [], isSynchronizing: false,
} as unknown as ActiveRoundPresentation;

describe('createGameplayTablePresentation', () => {
  it('maps seats relative to the viewer and keeps Bid/Won/Score semantics', () => {
    const model = createGameplayTablePresentation(compatible, snapshot);
    expect(model.seats.map((seat) => [seat.seat, seat.position, seat.displayName, seat.bid, seat.won, seat.score])).toEqual([
      [0, 'top', 'Rami', undefined, 0, 42],
      [1, 'left', 'Standard Bot 2', undefined, 1, 55],
      [2, 'bottom', 'You', undefined, 2, 31],
      [3, 'right', 'Standard Bot 4', undefined, 3, 38],
    ]);
  });

  it('passes synchronization through and does not calculate trick winners', () => {
    const model = createGameplayTablePresentation({ ...compatible, phase: 'synchronizing', viewerActionRequired: false, isSynchronizing: true }, snapshot);
    expect(model.isSynchronizing).toBe(true);
    expect(model.currentWinningSeat).toBeUndefined();
  });
});
