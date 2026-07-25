import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FairDealService,
  HouseRulesRoundEngine,
  type CreateHouseRulesRoundInput,
  type EstimationBid,
  type GameplayStateTransition,
  type HouseRulesRoundState,
} from '../src/index.js';

const players = [
  { seat: 0, playerId: 'p0' },
  { seat: 1, playerId: 'p1' },
  { seat: 2, playerId: 'p2' },
  { seat: 3, playerId: 'p3' },
] as const;

async function fixture(): Promise<CreateHouseRulesRoundInput> {
  const deal = await new FairDealService().deal({
    gameId: 'game-round-engine',
    dealId: 'deal-round-engine',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'round-engine-nonce',
    seedHex: '42'.repeat(32),
    firstSeat: 1,
  });

  return {
    roundNumber: 1,
    players,
    hands: deal.hands,
    bidOrder: [2, 3, 0, 1],
    playOrder: [0, 1, 2, 3],
    bidOwnerSeat: 2,
    firstLeadSeat: 0,
  };
}

function bidFor(playerId: string, tricks: number): EstimationBid {
  return {
    playerId,
    bidType: 'normal',
    tricks,
  };
}

function ownerBid(playerId: string, tricks: number): EstimationBid {
  return {
    playerId,
    bidType: 'normal',
    tricks,
    trumpSuit: 'spades',
  };
}

function accepted(result: GameplayStateTransition): HouseRulesRoundState {
  assert.equal(result.valid, true, result.errors.join('\n'));
  return result.state;
}

function completeValidBidding(
  engine: HouseRulesRoundEngine,
  initial: HouseRulesRoundState,
): HouseRulesRoundState {
  let state = initial;
  state = accepted(engine.submitBid(state, 2, ownerBid('p2', 5)));
  state = accepted(engine.submitBid(state, 3, bidFor('p3', 3)));
  state = accepted(engine.submitBid(state, 0, bidFor('p0', 2)));
  state = accepted(engine.submitBid(state, 1, bidFor('p1', 1)));
  return state;
}

test('round starts with the first seat in the explicit bidding order', async () => {
  const state = new HouseRulesRoundEngine().create(await fixture());

  assert.equal(state.phase, 'bidding');
  assert.equal(state.bidOrder[state.currentBidIndex], 2);
  assert.equal(state.bids.length, 0);
  assert.equal(state.currentTurnSeat, undefined);
});

test('out-of-turn estimate is rejected without changing state', async () => {
  const engine = new HouseRulesRoundEngine();
  const state = engine.create(await fixture());

  const result = engine.submitBid(state, 1, bidFor('p1', 2));

  assert.equal(result.valid, false);
  assert.equal(result.state, state);
  assert.ok(result.errors.includes('Seat 2 must submit the next estimate.'));
});

test('fourth estimate that makes total thirteen is rejected without committing it', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = engine.create(await fixture());
  state = accepted(engine.submitBid(state, 2, ownerBid('p2', 5)));
  state = accepted(engine.submitBid(state, 3, bidFor('p3', 3)));
  state = accepted(engine.submitBid(state, 0, bidFor('p0', 2)));

  const result = engine.submitBid(state, 1, bidFor('p1', 3));

  assert.equal(result.valid, false);
  assert.equal(result.state, state);
  assert.equal(result.state.bids.length, 3);
  assert.ok(result.errors.includes('Total estimates cannot equal 13. The round must be Over or Under.'));
});

test('valid fourth estimate moves the round to card play', async () => {
  const engine = new HouseRulesRoundEngine();
  const state = completeValidBidding(engine, engine.create(await fixture()));

  assert.equal(state.phase, 'playing');
  assert.equal(state.currentTurnSeat, 0);
  assert.equal(state.bids.length, 4);
});

test('only the current play seat can act and accepted play does not mutate prior state', async () => {
  const engine = new HouseRulesRoundEngine();
  const playing = completeValidBidding(engine, engine.create(await fixture()));
  const originalFirstHand = playing.hands[0].cards;

  const wrongSeatResult = engine.playCard(
    playing,
    1,
    engine.legalCards(playing, 1)[0]!,
  );
  assert.equal(wrongSeatResult.valid, false);
  assert.equal(wrongSeatResult.state, playing);
  assert.ok(wrongSeatResult.errors.includes('Seat 0 must play the next card.'));

  const selectedCard = engine.legalCards(playing, 0)[0]!;
  const result = engine.playCard(playing, 0, selectedCard);

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(playing.hands[0].cards, originalFirstHand);
  assert.equal(playing.hands[0].cards.length, 13);
  assert.equal(result.state.hands[0].cards.length, 12);
  assert.equal(result.state.currentTurnSeat, 1);
  assert.equal(result.state.currentTrick.length, 1);
});

test('completed trick increments winner count and winner leads the next trick', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = completeValidBidding(engine, engine.create(await fixture()));

  for (let index = 0; index < 4; index += 1) {
    const seat = state.currentTurnSeat!;
    const card = engine.legalCards(state, seat)[0]!;
    state = accepted(engine.playCard(state, seat, card));
  }

  const completed = state.completedTricks[0]!;
  assert.equal(state.currentTrick.length, 0);
  assert.equal(state.actualTricksBySeat[completed.winnerSeat], 1);
  assert.equal(state.currentTurnSeat, completed.winnerSeat);
  assert.equal(completed.entries.length, 4);
});

test('thirteen completed tricks hand actual results to House Rules scoring', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = completeValidBidding(engine, engine.create(await fixture()));
  let actions = 0;

  while (state.phase !== 'scored') {
    assert.ok(actions < 52, 'Round did not finish within fifty-two card plays.');
    const seat = state.currentTurnSeat!;
    const legalCard = engine.legalCards(state, seat)[0]!;
    state = accepted(engine.playCard(state, seat, legalCard));
    actions += 1;
  }

  assert.equal(actions, 52);
  assert.equal(state.completedTricks.length, 13);
  assert.equal(state.actualTricksBySeat.reduce((sum, value) => sum + value, 0), 13);
  assert.deepEqual(state.hands.map((hand) => hand.cards.length), [0, 0, 0, 0]);
  assert.equal(state.scoreResult?.valid, true);
  assert.equal(state.scoreResult?.scoreResult?.playerScores.length, 4);

  const riskTaker = state.scoreResult?.scoreResult?.playerScores.find(
    (score) => score.playerId === 'p1',
  );
  assert.equal(riskTaker?.isRiskTaker, true);
});
