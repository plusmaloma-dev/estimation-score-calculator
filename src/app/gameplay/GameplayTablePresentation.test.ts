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

  it('projects authoritative auction history and active contract separately from estimates', () => {
    const auctionSnapshot = {
      ...snapshot,
      phase: 'auction',
      version: 2,
      dealerSeat: 0,
      auctionActiveSeat: 3,
      nextBidSeat: 3,
      passedAuctionSeats: [1],
      consecutiveAuctionPasses: 1,
      currentHighestContract: { seat: 2, playerId: 'internal-2', tricks: 4, trumpSuit: 'hearts' },
      auctionHistory: [
        { seat: 2, playerId: 'internal-2', action: { type: 'contract', tricks: 4, trumpSuit: 'hearts' } },
        { seat: 1, playerId: 'internal-1', action: { type: 'pass' } },
      ],
      players: snapshot.players.map((player) => ({ ...player, bid: undefined })),
    } as unknown as OnlineGameplayRoundSnapshot;
    const auctionPresentation = { ...compatible, phase: 'auction', activeSeat: 3, viewerActionRequired: false } as ActiveRoundPresentation;
    const model = createGameplayTablePresentation(auctionPresentation, auctionSnapshot);

    expect(model.auctionHistory).toHaveLength(2);
    expect(model.auctionActiveSeat).toBe(3);
    expect(model.currentHighestContract).toMatchObject({ seat: 2, tricks: 4, trumpSuit: 'hearts' });
    expect(model.passedAuctionSeats).toEqual([1]);
    expect(model.seats.every((seat) => seat.bid === undefined)).toBe(true);
  });

  it('projects final WITH roles from authoritative player bids without auction history', () => {
    const scoredSnapshot = {
      ...snapshot,
      phase: 'playing',
      callerSeat: 0,
      players: snapshot.players.map((player) => player.seat === 1
        ? { ...player, bid: { playerId: player.playerId, bidType: 'with', tricks: 4, withTargetPlayerId: 'internal-0' } }
        : player),
      auctionHistory: [],
    } as unknown as OnlineGameplayRoundSnapshot;

    const model = createGameplayTablePresentation(compatible, scoredSnapshot);

    expect(model.seats.find((seat) => seat.seat === 1)?.isWith).toBe(true);
  });
});
