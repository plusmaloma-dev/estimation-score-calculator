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
  { seat: 0, playerId: 'p0' }, { seat: 1, playerId: 'p1' },
  { seat: 2, playerId: 'p2' }, { seat: 3, playerId: 'p3' },
] as const;

async function fixture(): Promise<CreateHouseRulesRoundInput> {
  const deal = await new FairDealService().deal({
    gameId: 'game-round-engine', dealId: 'deal-round-engine', ruleSet: 'HOUSE_RULES_V1',
    nonce: 'round-engine-nonce', seedHex: '42'.repeat(32), firstSeat: 1,
  });
  return {
    roundNumber: 1, players, hands: deal.hands, bidOrder: [2, 3, 0, 1], playOrder: [0, 1, 2, 3],
    dealerSeat: 1, firstLeadSeat: 0,
  };
}

function estimate(playerId: string, tricks: number): EstimationBid { return { playerId, bidType: 'normal', tricks }; }
function accepted(result: GameplayStateTransition): HouseRulesRoundState { assert.equal(result.valid, true, result.errors.join('\n')); return result.state; }

function resolveAuction(engine: HouseRulesRoundEngine, initial: HouseRulesRoundState): HouseRulesRoundState {
  let state = accepted(engine.submitAuctionAction(initial, 2, { type: 'contract', tricks: 5, trumpSuit: 'spades' }));
  state = accepted(engine.submitAuctionAction(state, 3, { type: 'pass' }));
  state = accepted(engine.submitAuctionAction(state, 0, { type: 'pass' }));
  return accepted(engine.submitAuctionAction(state, 1, { type: 'pass' }));
}

function completeValidEstimates(engine: HouseRulesRoundEngine, initial: HouseRulesRoundState): HouseRulesRoundState {
  let state = resolveAuction(engine, initial);
  state = accepted(engine.submitBid(state, 3, estimate('p3', 3)));
  state = accepted(engine.submitBid(state, 0, estimate('p0', 2)));
  return accepted(engine.submitBid(state, 1, estimate('p1', 1)));
}

test('round starts with the second player from dealer in auction and no caller', async () => {
  const state = new HouseRulesRoundEngine().create(await fixture());
  assert.equal(state.phase, 'auction');
  assert.equal(state.auctionActiveSeat, 2);
  assert.equal(state.callerSeat, undefined);
});

test('out-of-turn auction action is rejected without changing state', async () => {
  const engine = new HouseRulesRoundEngine();
  const state = engine.create(await fixture());
  const result = engine.submitAuctionAction(state, 1, { type: 'pass' });
  assert.equal(result.valid, false);
  assert.equal(result.state, state);
  assert.ok(result.errors.includes('Seat 2 must take the next auction action.'));
});

test('final estimate that makes total thirteen is rejected without committing it', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = resolveAuction(engine, engine.create(await fixture()));
  state = accepted(engine.submitBid(state, 3, estimate('p3', 3)));
  state = accepted(engine.submitBid(state, 0, estimate('p0', 2)));
  const result = engine.submitBid(state, 1, estimate('p1', 3));
  assert.equal(result.valid, false);
  assert.equal(result.state, state);
  assert.equal(result.state.bids.length, 3);
  assert.ok(result.errors.includes('Total estimates cannot equal 13. The round must be Over or Under.'));
});

test('three estimates after caller fixed contract move the round to card play with the caller leading trick one', async () => {
  const state = completeValidEstimates(new HouseRulesRoundEngine(), new HouseRulesRoundEngine().create(await fixture()));
  assert.equal(state.phase, 'playing');
  assert.equal(state.currentTurnSeat, 2);
  assert.equal(state.bids.length, 4);
  assert.equal(state.bids.find((bid) => bid.playerId === 'p2')?.tricks, 5);
});

test('only current play seat can act and accepted play does not mutate prior state', async () => {
  const engine = new HouseRulesRoundEngine();
  const playing = completeValidEstimates(engine, engine.create(await fixture()));
  const activeSeat = playing.currentTurnSeat!;
  const wrongSeat = ((activeSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const originalActiveHand = playing.hands[activeSeat].cards;
  const wrongSeatResult = engine.playCard(playing, wrongSeat, engine.legalCards(playing, wrongSeat)[0]!);
  assert.equal(wrongSeatResult.valid, false);
  assert.equal(wrongSeatResult.state, playing);
  const selectedCard = engine.legalCards(playing, activeSeat)[0]!;
  const result = engine.playCard(playing, activeSeat, selectedCard);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(playing.hands[activeSeat].cards, originalActiveHand);
  assert.equal(result.state.hands[activeSeat].cards.length, 12);
  assert.equal(result.state.currentTurnSeat, 3);
});

test('completed trick increments winner count and winner leads next trick', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = completeValidEstimates(engine, engine.create(await fixture()));
  for (let index = 0; index < 4; index += 1) state = accepted(engine.playCard(state, state.currentTurnSeat!, engine.legalCards(state, state.currentTurnSeat!)[0]!));
  const completed = state.completedTricks[0]!;
  assert.equal(state.currentTrick.length, 0);
  assert.equal(state.actualTricksBySeat[completed.winnerSeat], 1);
  assert.equal(state.currentTurnSeat, completed.winnerSeat);
});

test('thirteen completed tricks hand exact estimates and caller/Risk identity to House Rules scoring', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = completeValidEstimates(engine, engine.create(await fixture()));
  let actions = 0;
  while (state.phase !== 'scored') {
    assert.ok(actions < 52, 'Round did not finish within fifty-two card plays.');
    state = accepted(engine.playCard(state, state.currentTurnSeat!, engine.legalCards(state, state.currentTurnSeat!)[0]!));
    actions += 1;
  }
  assert.equal(actions, 52);
  assert.equal(state.completedTricks.length, 13);
  assert.equal(state.scoreResult?.valid, true);
  const riskTaker = state.scoreResult?.scoreResult?.playerScores.find((score) => score.playerId === 'p1');
  assert.equal(riskTaker?.isRiskTaker, true);
});
