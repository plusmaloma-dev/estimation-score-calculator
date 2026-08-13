import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card.js';
import type { CompletedGameplayTrick, GameplayTrickEntry, SeatIndex } from '../../gameplay/types.js';
import type {
  OnlineActiveGameControlSnapshot,
  OnlineActiveSeatControl,
} from '../../online/gameplay/activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import type { PlayerScoreResult } from '../../scoring/types.js';
import type { MvpRoundResult } from '../../services/EstimationMvpService.js';
import { createActiveRoundPresentation } from './ActiveRoundPresentation.js';

const NOW = Date.parse('2026-07-29T10:00:00.000Z');
const ownHand: readonly Card[] = [
  { suit: 'clubs', rank: '2' },
  { suit: 'diamonds', rank: 'K' },
  { suit: 'spades', rank: 'A' },
];

function seat(
  seatIndex: SeatIndex,
  overrides: Partial<OnlineActiveSeatControl> = {},
): OnlineActiveSeatControl {
  return {
    seat: seatIndex,
    seatKind: 'human',
    humanUserId: `user-${seatIndex}`,
    joinedAt: '2026-07-29T09:00:00.000Z',
    connectedAt: '2026-07-29T09:00:00.000Z',
    connection: 'connected',
    controlOwner: 'human',
    reclaimPending: false,
    ...overrides,
  };
}

function activeControl(
  overrides: Partial<OnlineActiveGameControlSnapshot> = {},
): OnlineActiveGameControlSnapshot {
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'user-0',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 11,
    turn: {
      turnId: 'round-2:bid:7:2',
      seat: 2,
      actionKind: 'bid',
      startedAt: '2026-07-29T09:59:30.000Z',
      deadlineAt: '2026-07-29T10:00:10.001Z',
      status: 'running',
    },
    seats: [
      seat(0),
      seat(1, {
        connection: 'disconnected',
        connectedAt: undefined,
        disconnectedAt: '2026-07-29T09:58:00.000Z',
      }),
      seat(2),
      seat(3, {
        seatKind: 'bot',
        humanUserId: undefined,
        botId: 'standard-bot:table-1:3',
        connectedAt: undefined,
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
      }),
    ],
    events: [],
    directives: [],
    ...overrides,
  };
}

function roundSnapshot(
  overrides: Partial<OnlineGameplayRoundSnapshot> = {},
): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 2,
    phase: 'estimate',
    version: 7,
    viewerSeat: 2,
    bidOwnerSeat: 0,
    riskSeat: 2,
    nextBidSeat: 2,
    players: [
      {
        seat: 0,
        playerId: 'p0',
        cardCount: 13,
        bid: { playerId: 'p0', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        actualTricks: 0,
      },
      {
        seat: 1,
        playerId: 'p1',
        cardCount: 13,
        bid: { playerId: 'p1', bidType: 'normal', tricks: 2 },
        actualTricks: 0,
      },
      { seat: 2, playerId: 'p2', cardCount: 13, actualTricks: 0 },
      {
        seat: 3,
        playerId: 'p3',
        cardCount: 13,
        bid: { playerId: 'p3', bidType: 'normal', tricks: 3 },
        actualTricks: 0,
      },
    ],
    ownHand,
    legalNormalEstimates: [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
    ...overrides,
  };
}

function playerScore(
  playerId: string,
  bidTricks: number,
  actualTricks: number,
  overrides: Partial<PlayerScoreResult> = {},
): PlayerScoreResult {
  return {
    playerId,
    bidTricks,
    actualTricks,
    delta: actualTricks - bidTricks,
    didMatchBid: actualTricks === bidTricks,
    role: 'other-player',
    riskType: 'none',
    isRiskTaker: false,
    riskModifier: 0,
    isHighContract: false,
    isOnlyWinner: false,
    isOnlyLoser: false,
    status: actualTricks === bidTricks ? 'success' : 'failed',
    score: 0,
    notes: [],
    ...overrides,
  };
}

function scoredRoundResult(): MvpRoundResult {
  return {
    roundNumber: 2,
    valid: true,
    errors: [],
    bidValidation: {
      valid: true,
      errors: [],
      totalEstimatedTricks: 14,
      roundType: 'over',
    },
    isAllLoserRound: false,
    consecutiveAllLoserCountBeforeRound: 0,
    carriedAllLoserMultiplier: 1,
    carryConsumed: false,
    scoreResult: {
      valid: true,
      errors: [],
      playerScores: [
        playerScore('p0', 4, 4, { role: 'bid-owner', score: 14 }),
        playerScore('p1', 3, 2, { score: -1 }),
        playerScore('p2', 2, 2, {
          role: 'risk-taker',
          riskType: 'round-risk',
          isRiskTaker: true,
          riskModifier: 10,
          score: 22,
        }),
        playerScore('p3', 5, 5, { score: 20 }),
      ],
    },
  };
}

function completedTrick(trickNumber: number): CompletedGameplayTrick {
  return {
    trickNumber,
    leaderSeat: 3,
    entries: [
      { seat: 3, card: { suit: 'hearts', rank: '2' } },
      { seat: 0, card: { suit: 'hearts', rank: 'A' } },
      { seat: 1, card: { suit: 'hearts', rank: 'Q' } },
      { seat: 2, card: { suit: 'hearts', rank: 'K' } },
    ],
    winnerSeat: 0,
  };
}

describe('createActiveRoundPresentation', () => {
  it('keeps controls neutral while either authoritative snapshot is loading', () => {
    const presentation = createActiveRoundPresentation({
      activeControl: undefined,
      round: roundSnapshot(),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation.phase).toBe('loading');
    expect(presentation.viewerActionRequired).toBe(false);
    expect(presentation.isSynchronizing).toBe(false);
  });

  it('derives a compatible estimate action, seat estimates, caller, trump, total, Risk, and connection state', () => {
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl(),
      round: roundSnapshot(),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation).toMatchObject({
      phase: 'estimate',
      roundNumber: 2,
      viewerSeat: 2,
      viewerActionRequired: true,
      activeSeat: 2,
      actionKind: 'bid',
      activeTurnStatus: 'running',
      countdownSeconds: 11,
      callerSeat: 0,
      callerEstimate: 4,
      trump: 'spades',
      totalEstimatedTricks: 9,
      estimateStatus: 'under',
      estimateDistanceFrom13: 4,
      estimatesComplete: false,
      risk: { seat: 2, type: 'pending' },
      canStartNextRound: false,
      isSynchronizing: false,
    });
    expect(presentation.estimatesBySeat.map(({ seat, estimate, isViewer, isCaller }) => ({
      seat,
      estimate,
      isViewer,
      isCaller,
    }))).toEqual([
      { seat: 0, estimate: 4, isViewer: false, isCaller: true },
      { seat: 1, estimate: 2, isViewer: false, isCaller: false },
      { seat: 2, estimate: undefined, isViewer: true, isCaller: false },
      { seat: 3, estimate: 3, isViewer: false, isCaller: false },
    ]);
    expect(presentation.seatControls[1]).toMatchObject({
      seat: 1,
      connection: 'disconnected',
      controlOwner: 'human',
    });
    expect(presentation.ownHand).toEqual(ownHand);
    expect(presentation.legalNormalEstimates).not.toContain(4);
  });

  it('rejects the same seat and action when the deterministic turn ID names another round version', () => {
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl({
        turn: {
          turnId: 'round-2:bid:6:2',
          seat: 2,
          actionKind: 'bid',
          startedAt: '2026-07-29T09:59:30.000Z',
          deadlineAt: '2026-07-29T10:00:10.001Z',
          status: 'running',
        },
      }),
      round: roundSnapshot(),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation.phase).toBe('synchronizing');
    expect(presentation.isSynchronizing).toBe(true);
    expect(presentation.viewerActionRequired).toBe(false);
    expect(presentation.synchronizationReason).toBe('turn-mismatch');
    expect(presentation.synchronizationKey).toContain('round-2:bid:6:2');
  });

  it('keeps a bot-owned compatible card turn non-actionable and exposes active round Risk', () => {
    const currentTrick: readonly GameplayTrickEntry[] = [
      { seat: 3, card: { suit: 'clubs', rank: '10' } },
    ];
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl({
        turn: {
          turnId: 'round-2:card:8:3',
          seat: 3,
          actionKind: 'card',
          startedAt: '2026-07-29T09:59:30.000Z',
          deadlineAt: '2026-07-29T10:00:10.001Z',
          status: 'bot-processing',
        },
      }),
      round: roundSnapshot({
        phase: 'playing',
        version: 8,
        nextBidSeat: undefined,
        currentTurnSeat: 3,
        players: [
          {
            seat: 0,
            playerId: 'p0',
            cardCount: 13,
            bid: { playerId: 'p0', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
            actualTricks: 0,
          },
          { seat: 1, playerId: 'p1', cardCount: 13, bid: { playerId: 'p1', bidType: 'normal', tricks: 3 }, actualTricks: 0 },
          { seat: 2, playerId: 'p2', cardCount: 13, bid: { playerId: 'p2', bidType: 'normal', tricks: 2 }, actualTricks: 0 },
          { seat: 3, playerId: 'p3', cardCount: 13, bid: { playerId: 'p3', bidType: 'normal', tricks: 5 }, actualTricks: 0 },
        ],
        legalNormalEstimates: [],
        currentTrick,
      }),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation.phase).toBe('playing');
    expect(presentation.viewerActionRequired).toBe(false);
    expect(presentation.activeControlOwner).toBe('permanent-bot');
    expect(presentation.activeTurnStatus).toBe('bot-processing');
    expect(presentation.risk).toEqual({ seat: 2, type: 'pending' });
    expect(presentation.totalEstimatedTricks).toBe(14);
    expect(presentation.estimateStatus).toBe('over');
    expect(presentation.estimateDistanceFrom13).toBe(1);
    expect(presentation.currentTrick).toEqual(currentTrick);
  });

  it('uses the frozen active-control remaining time while paused and never enables the viewer', () => {
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl({
        lifecycle: 'paused',
        turn: {
          turnId: 'round-2:bid:7:2',
          seat: 2,
          actionKind: 'bid',
          startedAt: '2026-07-29T09:59:30.000Z',
          remainingMs: 5_500,
          status: 'running',
        },
        pausedAt: '2026-07-29T09:59:54.500Z',
      }),
      round: roundSnapshot(),
      viewerUserId: 'user-2',
      nowMs: NOW + 60_000,
    });

    expect(presentation.phase).toBe('paused');
    expect(presentation.countdownSeconds).toBe(6);
    expect(presentation.viewerActionRequired).toBe(false);
  });

  it('lets the terminated lifecycle own the terminal phase without exposing an action', () => {
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl({
        lifecycle: 'terminated',
        terminatedAt: '2026-07-29T10:00:00.000Z',
        terminatedBy: 'user-0',
      }),
      round: roundSnapshot(),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation.phase).toBe('terminated');
    expect(presentation.viewerActionRequired).toBe(false);
    expect(presentation.canStartNextRound).toBe(false);
  });

  it('retains the final completed trick and scored results for a compatible host snapshot', () => {
    const trick13 = completedTrick(13);
    const scoreResult = scoredRoundResult();
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl({
        hostUserId: 'user-2',
        turn: undefined,
      }),
      round: roundSnapshot({
        phase: 'scored',
        version: 61,
        nextBidSeat: undefined,
        currentTurnSeat: undefined,
        players: [
          { seat: 0, playerId: 'p0', cardCount: 0, bid: { playerId: 'p0', bidType: 'normal', tricks: 4, trumpSuit: 'spades' }, actualTricks: 4 },
          { seat: 1, playerId: 'p1', cardCount: 0, bid: { playerId: 'p1', bidType: 'normal', tricks: 3 }, actualTricks: 2 },
          { seat: 2, playerId: 'p2', cardCount: 0, bid: { playerId: 'p2', bidType: 'normal', tricks: 2 }, actualTricks: 2 },
          { seat: 3, playerId: 'p3', cardCount: 0, bid: { playerId: 'p3', bidType: 'normal', tricks: 5 }, actualTricks: 5 },
        ],
        ownHand: [],
        legalNormalEstimates: [],
        completedTricks: [completedTrick(12), trick13],
        scoreResult,
      }),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation.phase).toBe('scored');
    expect(presentation.lastCompletedTrick).toEqual(trick13);
    expect(presentation.scoredResults).toEqual(scoreResult);
    expect(presentation.risk).toEqual({ seat: 2, type: 'round-risk' });
    expect(presentation.canStartNextRound).toBe(true);
  });

  it('treats a scored round with a stale active turn as synchronizing', () => {
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl(),
      round: roundSnapshot({
        phase: 'scored',
        nextBidSeat: undefined,
        currentTurnSeat: undefined,
        scoreResult: scoredRoundResult(),
      }),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation.phase).toBe('synchronizing');
    expect(presentation.synchronizationReason).toBe('scored-turn-present');
  });

  it('marks an interim total of thirteen without accepting it as a completed estimate set', () => {
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl(),
      round: roundSnapshot({
        players: [
          { seat: 0, playerId: 'p0', cardCount: 13, bid: { playerId: 'p0', bidType: 'normal', tricks: 5, trumpSuit: 'spades' }, actualTricks: 0 },
          { seat: 1, playerId: 'p1', cardCount: 13, bid: { playerId: 'p1', bidType: 'normal', tricks: 4 }, actualTricks: 0 },
          { seat: 2, playerId: 'p2', cardCount: 13, actualTricks: 0 },
          { seat: 3, playerId: 'p3', cardCount: 13, bid: { playerId: 'p3', bidType: 'normal', tricks: 4 }, actualTricks: 0 },
        ],
      }),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation.totalEstimatedTricks).toBe(13);
    expect(presentation.estimatesComplete).toBe(false);
    expect(presentation.estimateStatus).toBe('at-13');
    expect(presentation.estimateDistanceFrom13).toBe(0);
    expect(presentation.viewerActionRequired).toBe(true);
  });

  it.each([
    [10_001, 11],
    [10_000, 10],
    [1, 1],
    [-1, 0],
  ])('rounds an active deadline with %i ms remaining to %i seconds', (remainingMs, expected) => {
    const presentation = createActiveRoundPresentation({
      activeControl: activeControl({
        turn: {
          turnId: 'round-2:bid:7:2',
          seat: 2,
          actionKind: 'bid',
          startedAt: '2026-07-29T09:59:30.000Z',
          deadlineAt: new Date(NOW + remainingMs).toISOString(),
          status: 'running',
        },
      }),
      round: roundSnapshot(),
      viewerUserId: 'user-2',
      nowMs: NOW,
    });

    expect(presentation.countdownSeconds).toBe(expected);
  });
});
