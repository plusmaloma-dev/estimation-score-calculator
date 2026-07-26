import assert from 'node:assert/strict';
import test from 'node:test';
import type { Card } from '../src/domain/card.js';
import { HouseRulesRoundEngine } from '../src/gameplay/HouseRulesRoundEngine.js';
import type {
  GameplayRoundScoringInput,
  GameplayRoundScoringResult,
  RoundScoringPort,
} from '../src/gameplay/scoring/RoundScoringPort.js';
import type { CompletedGameplayTrick, HouseRulesRoundState } from '../src/gameplay/types.js';

const finalCards: readonly Card[] = [
  { suit: 'spades', rank: 'A' },
  { suit: 'spades', rank: 'K' },
  { suit: 'spades', rank: 'Q' },
  { suit: 'spades', rank: 'J' },
];

const completedTricks: readonly CompletedGameplayTrick[] = Array.from({ length: 12 }, (_, index) => ({
  trickNumber: index + 1,
  leaderSeat: 0,
  entries: [
    { seat: 0, card: { suit: 'clubs', rank: '2' } },
    { seat: 1, card: { suit: 'clubs', rank: '3' } },
    { seat: 2, card: { suit: 'clubs', rank: '4' } },
    { seat: 3, card: { suit: 'clubs', rank: '5' } },
  ],
  winnerSeat: index % 4 as 0 | 1 | 2 | 3,
}));

const fakeResult: GameplayRoundScoringResult = {
  roundNumber: 1,
  valid: true,
  errors: [],
  bidValidation: {
    valid: true,
    errors: [],
    totalEstimatedTricks: 10,
    roundType: 'under',
  },
  scoreResult: {
    valid: true,
    errors: [],
    playerScores: [
      {
        playerId: 'p1', bidTricks: 4, actualTricks: 4, delta: 0, didMatchBid: true,
        role: 'bid-owner', riskType: 'none', isRiskTaker: false, riskModifier: 0,
        isHighContract: false, isOnlyWinner: false, isOnlyLoser: false,
        status: 'success', score: 14, notes: [],
      },
      {
        playerId: 'p2', bidTricks: 3, actualTricks: 3, delta: 0, didMatchBid: true,
        role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0,
        isHighContract: false, isOnlyWinner: false, isOnlyLoser: false,
        status: 'success', score: 13, notes: [],
      },
      {
        playerId: 'p3', bidTricks: 2, actualTricks: 2, delta: 0, didMatchBid: true,
        role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0,
        isHighContract: false, isOnlyWinner: false, isOnlyLoser: false,
        status: 'success', score: 12, notes: [],
      },
      {
        playerId: 'p4', bidTricks: 1, actualTricks: 4, delta: 3, didMatchBid: false,
        role: 'risk-taker', riskType: 'round-risk', isRiskTaker: true, riskModifier: -10,
        isHighContract: false, isOnlyWinner: false, isOnlyLoser: true,
        status: 'failed', score: -13, notes: [],
      },
    ],
  },
  isAllLoserRound: false,
  consecutiveAllLoserCountBeforeRound: 0,
  carriedAllLoserMultiplier: 1,
  carryConsumed: false,
};

test('HouseRulesRoundEngine delegates final scoring through the injected port', () => {
  let received: GameplayRoundScoringInput | undefined;
  const scoringPort: RoundScoringPort = {
    validateBids: () => ({
      valid: true,
      errors: [],
      totalEstimatedTricks: 10,
      roundType: 'under',
    }),
    scoreRound: (input) => {
      received = input;
      return fakeResult;
    },
  };
  const engine = new HouseRulesRoundEngine(scoringPort);
  let state: HouseRulesRoundState = {
    roundNumber: 1,
    phase: 'playing',
    players: [
      { seat: 0, playerId: 'p1' },
      { seat: 1, playerId: 'p2' },
      { seat: 2, playerId: 'p3' },
      { seat: 3, playerId: 'p4' },
    ],
    hands: [
      { seat: 0, cards: [finalCards[0]!] },
      { seat: 1, cards: [finalCards[1]!] },
      { seat: 2, cards: [finalCards[2]!] },
      { seat: 3, cards: [finalCards[3]!] },
    ],
    bidOrder: [0, 1, 2, 3],
    playOrder: [0, 1, 2, 3],
    bidOwnerSeat: 0,
    firstLeadSeat: 0,
    currentBidIndex: 4,
    currentTurnSeat: 0,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'p2', bidType: 'normal', tricks: 3 },
      { playerId: 'p3', bidType: 'normal', tricks: 2 },
      { playerId: 'p4', bidType: 'normal', tricks: 1 },
    ],
    currentTrick: [],
    completedTricks,
    actualTricksBySeat: [3, 3, 2, 4],
    roundMultiplier: 2,
    multipleWithMultiplier: 1,
  };

  for (const [seat, card] of finalCards.entries()) {
    const transition = engine.playCard(state, seat as 0 | 1 | 2 | 3, card);
    assert.equal(transition.valid, true);
    state = transition.state;
  }

  assert.equal(state.phase, 'scored');
  assert.equal(state.scoreResult, fakeResult);
  assert.deepEqual(received, {
    roundNumber: 1,
    bids: state.bids,
    actualResults: [
      { playerId: 'p1', actualTricks: 4 },
      { playerId: 'p2', actualTricks: 3 },
      { playerId: 'p3', actualTricks: 2 },
      { playerId: 'p4', actualTricks: 4 },
    ],
    bidOwnerPlayerId: 'p1',
    riskPlayerId: 'p4',
    roundMultiplier: 2,
    multipleWithMultiplier: 1,
  });
});
