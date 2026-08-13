import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FairDealService,
  GameplayRoundSnapshotProjector,
  HouseRulesRoundEngine,
  type Card,
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
    gameId: 'snapshot-game',
    dealId: 'snapshot-deal',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'snapshot-nonce',
    seedHex: '71'.repeat(32),
    firstSeat: 1,
  });

  return {
    roundNumber: 1,
    players,
    hands: deal.hands,
    bidOrder: [2, 3, 0, 1],
    playOrder: [0, 1, 2, 3],
    dealerSeat: 1,
    firstLeadSeat: 0,
  };
}

function accepted(result: GameplayStateTransition): HouseRulesRoundState {
  assert.equal(result.valid, true, result.errors.join('\n'));
  return result.state;
}

function bid(playerId: string, tricks: number): EstimationBid {
  return { playerId, bidType: 'normal', tricks };
}

function resolvedAuction(engine: HouseRulesRoundEngine, state: HouseRulesRoundState): HouseRulesRoundState {
  state = accepted(engine.submitAuctionAction(state, 2, { type: 'contract', tricks: 5, trumpSuit: 'spades' }));
  state = accepted(engine.submitAuctionAction(state, 3, { type: 'pass' }));
  state = accepted(engine.submitAuctionAction(state, 0, { type: 'pass' }));
  return accepted(engine.submitAuctionAction(state, 1, { type: 'pass' }));
}

function cardsIn(value: unknown): Card[] {
  const cards: Card[] = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (typeof candidate !== 'object' || candidate === null) return;
    const record = candidate as Readonly<Record<string, unknown>>;
    if (
      typeof record.suit === 'string'
      && typeof record.rank === 'string'
      && Object.keys(record).every((key) => key === 'suit' || key === 'rank')
    ) {
      cards.push(record as unknown as Card);
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return cards;
}

test('auction snapshot exposes only the viewer hand and allow-listed public state', async () => {
  const engine = new HouseRulesRoundEngine();
  const state = engine.create(await fixture());
  const snapshot = new GameplayRoundSnapshotProjector().project('table-1', state, 0, 2);

  assert.equal(snapshot.tableId, 'table-1');
  assert.equal(snapshot.roundNumber, 1);
  assert.equal(snapshot.phase, 'auction');
  assert.equal(snapshot.version, 0);
  assert.equal(snapshot.viewerSeat, 2);
  assert.equal(snapshot.nextBidSeat, 2);
  assert.equal(snapshot.riskSeat, undefined);
  assert.deepEqual(snapshot.ownHand, state.hands[2].cards);
  assert.deepEqual(snapshot.players.map((player) => player.cardCount), [13, 13, 13, 13]);
  assert.deepEqual(snapshot.legalNormalEstimates, []);
  assert.ok(snapshot.legalAuctionActions);
  assert.deepEqual(snapshot.legalAuctionActions[0], { action: { type: 'pass' } });
  assert.ok(snapshot.legalAuctionActions.some((option) => option.action.type === 'contract'
    && option.action.tricks === 4 && option.action.trumpSuit === 'clubs'));
  assert.deepEqual(snapshot.legalCards, []);

  const exposedCards = cardsIn(snapshot);
  assert.deepEqual(exposedCards, state.hands[2].cards);
  const serialized = JSON.stringify(snapshot);
  for (const prohibited of ['"hands"', 'seedHex', 'nonce', 'shuffledDeck', 'commitment']) {
    assert.equal(serialized.includes(prohibited), false, `Snapshot leaked ${prohibited}.`);
  }
});

test('only the acting bidder receives legal estimates and the fourth bidder cannot make total thirteen', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = engine.create(await fixture());
  state = resolvedAuction(engine, state);
  state = accepted(engine.submitBid(state, 3, bid('p3', 3)));
  state = accepted(engine.submitBid(state, 0, bid('p0', 2)));

  const acting = new GameplayRoundSnapshotProjector().project('table-1', state, 3, 1);
  const waiting = new GameplayRoundSnapshotProjector().project('table-1', state, 3, 0);

  assert.equal(acting.nextBidSeat, 1);
  assert.equal(acting.legalNormalEstimates.includes(3), false);
  assert.equal(acting.legalNormalEstimates.includes(2), true);
  assert.equal(acting.legalNormalEstimates.includes(4), true);
  assert.equal(acting.estimateOptions?.find((option) => option.value === 3)?.enabled, false);
  assert.equal(acting.estimateOptions?.find((option) => option.value === 3)?.reason, 'would_total_13');
  assert.deepEqual(waiting.legalNormalEstimates, []);
});

test('snapshot projects safe seat names and seat-owned cumulative score history', async () => {
  const engine = new HouseRulesRoundEngine();
  const state = engine.create(await fixture());
  const snapshot = new GameplayRoundSnapshotProjector().project('table-1', state, 0, 2, {
    seatControls: [
      { seat: 0, seatKind: 'human', displayName: 'Rami', controlOwner: 'human' },
      { seat: 1, seatKind: 'bot', displayName: 'Standard Bot 2', controlOwner: 'permanent-bot' },
      { seat: 2, seatKind: 'human', displayName: 'You', controlOwner: 'human' },
      { seat: 3, seatKind: 'bot', displayName: 'Standard Bot 4', controlOwner: 'permanent-bot' },
    ],
    scoreHistory: [
      { roundNumber: 1, deltasBySeat: [20, -10, 30, 0] },
      { roundNumber: 2, deltasBySeat: [-5, 5, 10, -10] },
    ],
  });

  assert.deepEqual(snapshot.players.map((player) => [player.displayName, player.isBot, player.cumulativeScore]), [
    ['Rami', false, 15],
    ['Standard Bot 2', true, -5],
    ['You', false, 40],
    ['Standard Bot 4', true, -10],
  ]);
  assert.deepEqual(snapshot.cumulativeScoresBySeat, [15, -5, 40, -10]);
  assert.deepEqual(snapshot.scoreHistory, [
    { roundNumber: 1, deltasBySeat: [20, -10, 30, 0] },
    { roundNumber: 2, deltasBySeat: [-5, 5, 10, -10] },
  ]);
  assert.equal(JSON.stringify(snapshot.players).includes('standard-bot:'), false);
});

test('playing snapshot exposes legal cards only to the current seat and keeps played cards public', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = engine.create(await fixture());
  state = resolvedAuction(engine, state);
  state = accepted(engine.submitBid(state, 3, bid('p3', 3)));
  state = accepted(engine.submitBid(state, 0, bid('p0', 2)));
  state = accepted(engine.submitBid(state, 1, bid('p1', 1)));

  const caller = new GameplayRoundSnapshotProjector(engine).project('table-1', state, 4, 2);
  const nonCaller = new GameplayRoundSnapshotProjector(engine).project('table-1', state, 4, 0);

  assert.equal(caller.phase, 'playing');
  assert.equal(caller.currentTurnSeat, 2);
  assert.deepEqual(caller.legalCards, engine.legalCards(state, 2));
  assert.deepEqual(nonCaller.legalCards, []);

  const playedCard = caller.legalCards[0]!;
  state = accepted(engine.playCard(state, 2, playedCard));
  const afterPlay = new GameplayRoundSnapshotProjector(engine).project('table-1', state, 5, 2);

  assert.deepEqual(afterPlay.currentTrick, [{ seat: 2, card: playedCard }]);
  assert.equal(afterPlay.currentWinningSeat, 2);
  assert.equal(afterPlay.players[2]?.cardCount, 12);
  assert.equal(afterPlay.players[0]?.cardCount, 13);
  assert.deepEqual(afterPlay.ownHand, state.hands[2].cards);
  assert.deepEqual(afterPlay.legalCards, []);
});
