import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BotObservationService,
  FairDealService,
  HouseRulesRoundEngine,
  StandardCardPolicy,
  cardId,
  type BotCardObservation,
  type Card,
  type CreateHouseRulesRoundInput,
  type HouseRulesRoundState,
} from '../src/index.js';

async function createPlayingRound(): Promise<HouseRulesRoundState> {
  const deal = await new FairDealService().deal({
    gameId: 'bot-card-game',
    dealId: 'bot-card-deal',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'bot-card-nonce',
    seedHex: '24'.repeat(32),
    firstSeat: 1,
  });
  const input: CreateHouseRulesRoundInput = {
    roundNumber: 1,
    players: [
      { seat: 0, playerId: 'p0' },
      { seat: 1, playerId: 'p1' },
      { seat: 2, playerId: 'p2' },
      { seat: 3, playerId: 'p3' },
    ],
    hands: deal.hands,
    bidOrder: [2, 3, 0, 1],
    playOrder: [0, 1, 2, 3],
    bidOwnerSeat: 2,
    firstLeadSeat: 0,
  };

  const engine = new HouseRulesRoundEngine();
  let state = engine.create(input);
  const bids = [
    [2, { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'spades' }],
    [3, { playerId: 'p3', bidType: 'normal', tricks: 3 }],
    [0, { playerId: 'p0', bidType: 'normal', tricks: 2 }],
    [1, { playerId: 'p1', bidType: 'normal', tricks: 1 }],
  ] as const;

  for (const [seat, bid] of bids) {
    const result = engine.submitBid(state, seat, bid);
    assert.equal(result.valid, true, result.errors.join('\n'));
    state = result.state;
  }
  return state;
}

function observation(overrides: Partial<BotCardObservation> = {}): BotCardObservation {
  const hand: readonly Card[] = [
    { suit: 'clubs', rank: '2' },
    { suit: 'clubs', rank: '10' },
    { suit: 'clubs', rank: 'A' },
    { suit: 'hearts', rank: '5' },
  ];

  return {
    policyVersion: 'STANDARD_V1',
    seat: 0,
    hand,
    legalCards: hand,
    bids: [],
    contractSuit: 'spades',
    currentTrick: [],
    completedTricks: [],
    estimate: 2,
    tricksWon: 0,
    cardsRemaining: hand.length,
    ...overrides,
  };
}

test('card observation exposes only the allow-listed bot fields', async () => {
  const state = await createPlayingRound();
  const seat = state.currentTurnSeat!;

  const projected = new BotObservationService().createCardObservation(state, seat);
  const keys = Object.keys(projected).sort();

  assert.deepEqual(keys, [
    'bids',
    'cardsRemaining',
    'completedTricks',
    'contractSuit',
    'currentTrick',
    'estimate',
    'hand',
    'legalCards',
    'policyVersion',
    'seat',
    'tricksWon',
  ]);
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes('shuffledDeck'), false);
  assert.equal(serialized.includes('seedHex'), false);
  assert.equal(serialized.includes('hands'), false);
  assert.deepEqual(projected.hand, state.hands[seat].cards);
});

test('single legal card is selected with the mandatory-action reason', () => {
  const onlyCard: Card = { suit: 'hearts', rank: '7' };

  const decision = new StandardCardPolicy().decide(observation({
    hand: [onlyCard, { suit: 'clubs', rank: 'A' }],
    legalCards: [onlyCard],
    cardsRemaining: 2,
  }));

  assert.deepEqual(decision.card, onlyCard);
  assert.equal(decision.reasonCode, 'FOLLOW_SUIT_ONLY_ACTION');
});

test('bot dumps the lowest legal card after reaching its estimate', () => {
  const input = observation({ estimate: 2, tricksWon: 2 });

  const decision = new StandardCardPolicy().decide(input);

  assert.equal(decision.mode, 'dump');
  assert.equal(decision.reasonCode, 'AVOID_OVERTRICK');
  assert.equal(cardId(decision.card), '2-clubs');
});

test('bot acquires with the highest legal card when every remaining trick is required', () => {
  const input = observation({ estimate: 5, tricksWon: 1, cardsRemaining: 4 });

  const decision = new StandardCardPolicy().decide(input);

  assert.equal(decision.mode, 'acquire');
  assert.equal(decision.reasonCode, 'ACQUIRE_REQUIRED_TRICK');
  assert.equal(cardId(decision.card), 'A-clubs');
});

test('bot enters recovery and minimizes rank when target is no longer reachable', () => {
  const input = observation({ estimate: 8, tricksWon: 1, cardsRemaining: 4 });

  const decision = new StandardCardPolicy().decide(input);

  assert.equal(decision.mode, 'recovery');
  assert.equal(decision.reasonCode, 'MINIMIZE_DAMAGE');
  assert.equal(cardId(decision.card), '2-clubs');
});

test('same observation always produces the same decision', () => {
  const policy = new StandardCardPolicy();
  const input = observation();

  assert.deepEqual(policy.decide(input), policy.decide(input));
});

test('four Standard card policies complete a round with zero illegal plays', async () => {
  const engine = new HouseRulesRoundEngine();
  const projector = new BotObservationService(engine);
  const policy = new StandardCardPolicy();
  let state = await createPlayingRound();
  let actions = 0;

  while (state.phase !== 'scored') {
    assert.ok(actions < 52, 'Bot-controlled round did not finish in fifty-two plays.');
    const seat = state.currentTurnSeat!;
    const decision = policy.decide(projector.createCardObservation(state, seat));
    const result = engine.playCard(state, seat, decision.card);
    assert.equal(result.valid, true, result.errors.join('\n'));
    state = result.state;
    actions += 1;
  }

  assert.equal(actions, 52);
  assert.equal(state.completedTricks.length, 13);
  assert.equal(state.scoreResult?.valid, true);
});
