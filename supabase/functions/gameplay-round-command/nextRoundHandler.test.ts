import assert from 'node:assert/strict';

import {
  GameplayRoundSnapshotProjector,
} from '../../../src/gameplay/GameplayRoundSnapshotProjector.ts';
import { HouseRulesBidOptionsService } from '../../../src/gameplay/HouseRulesBidOptionsService.ts';
import { HouseRulesRoundEngine } from '../../../src/gameplay/HouseRulesRoundEngine.ts';
import { GameplaySessionBootstrapService } from '../../../src/gameplay/session/GameplaySessionBootstrapService.ts';
import type {
  GameplaySessionBootstrapRequest,
  HouseRulesRoundState,
} from '../../../src/gameplay/types.ts';
import {
  handleStartNextRound,
  type NextRoundBootstrapInput,
  type NextRoundCommandPorts,
} from './nextRoundHandler.ts';

const seats = [
  { seat: 0, playerId: 'host' },
  { seat: 1, playerId: 'bot-1' },
  { seat: 2, playerId: 'bot-2' },
  { seat: 3, playerId: 'bot-3' },
] as const;

async function scoredRoundOne(): Promise<HouseRulesRoundState> {
  const engine = new HouseRulesRoundEngine();
  const bootstrap = await new GameplaySessionBootstrapService().bootstrap({
    tableId: 'table-1',
    roundNumber: 1,
    seats,
    seedHex: '42'.repeat(32),
    dealId: 'round-1-deal',
    nonce: 'round-1-nonce',
    initialization: { kind: 'first-round' },
  });
  let state = bootstrap.state;

  const caller = state.auctionActiveSeat!;
  let transition = engine.submitAuctionAction(state, caller, {
    type: 'contract',
    tricks: 4,
    trumpSuit: 'clubs',
  });
  assert.equal(transition.valid, true, transition.errors.join('\n'));
  state = transition.state;
  while (state.phase === 'auction') {
    transition = engine.submitAuctionAction(state, state.auctionActiveSeat!, { type: 'pass' });
    assert.equal(transition.valid, true, transition.errors.join('\n'));
    state = transition.state;
  }

  for (const tricks of [3, 3, 2]) {
    const seat = state.estimateOrder[state.currentEstimateIndex]!;
    transition = engine.submitBid(state, seat, {
      playerId: seats[seat].playerId,
      bidType: 'normal',
      tricks,
    });
    assert.equal(transition.valid, true, transition.errors.join('\n'));
    state = transition.state;
  }
  while (state.phase === 'playing') {
    const seat = state.currentTurnSeat!;
    transition = engine.playCard(state, seat, engine.legalCards(state, seat)[0]!);
    assert.equal(transition.valid, true, transition.errors.join('\n'));
    state = transition.state;
  }
  assert.equal(state.phase, 'scored');
  return state;
}

Deno.test('the authoritative next-round handler rotates the dealer, opens Round 2 to the right, and preserves caller-first trick lead', async () => {
  const roundOne = await scoredRoundOne();
  const bootstrapService = new GameplaySessionBootstrapService();
  const engine = new HouseRulesRoundEngine();
  const bidOptions = new HouseRulesBidOptionsService();
  let generatedRound: HouseRulesRoundState | undefined;
  let receivedBootstrap: NextRoundBootstrapInput | undefined;

  const ports: NextRoundCommandPorts = {
    resolveActor: async () => ({ userId: 'host' }),
    loadCommand: async () => undefined,
    loadCurrentRound: async () => ({
      tableLifecycle: 'active',
      controlLifecycle: 'active',
      hostUserId: 'host',
      controlVersion: 9,
      turnId: null,
      roundNumber: roundOne.roundNumber,
      roundVersion: 59,
      phase: roundOne.phase,
      dealerSeat: roundOne.dealerSeat,
      players: seats,
    }),
    randomBytes: () => new Uint8Array(32).fill(7),
    randomUuid: () => 'round-2-private-id',
    bootstrap: async (input) => {
      receivedBootstrap = input;
      const result = await bootstrapService.bootstrap({
        ...input,
        seats: input.seats as GameplaySessionBootstrapRequest['seats'],
      } as GameplaySessionBootstrapRequest);
      generatedRound = result.state;
      return { aggregate: result.state, firstBidSeat: result.firstTurn.seat };
    },
    validateAggregate: () => [],
    startNextRound: async () => ({ valid: true, errors: [] }),
    projectViewer: async () => {
      assert.notEqual(generatedRound, undefined);
      return {
        valid: true,
        errors: [],
        value: new GameplayRoundSnapshotProjector().project(
          'table-1',
          generatedRound!,
          0,
          0,
        ) as unknown as Readonly<Record<string, unknown>>,
      };
    },
  };

  const result = await handleStartNextRound({
    tableId: 'table-1',
    commandId: 'next-round-1',
    expectedRoundNumber: 1,
    expectedRoundVersion: 59,
    expectedControlVersion: 9,
  }, ports);

  assert.equal(result.valid, true, result.errors.join('\n'));
  const expectedDealer = ((roundOne.dealerSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const expectedFirstAuctionSeat = ((expectedDealer + 1) % 4) as 0 | 1 | 2 | 3;
  assert.equal(receivedBootstrap?.initialization.dealerSeat, expectedDealer);
  assert.equal(generatedRound?.roundNumber, 2);
  assert.equal(generatedRound?.dealerSeat, expectedDealer);
  assert.equal(generatedRound?.auctionActiveSeat, expectedFirstAuctionSeat);

  let roundTwo = generatedRound!;
  let transition = engine.submitAuctionAction(roundTwo, roundTwo.auctionActiveSeat!, { type: 'pass' });
  assert.equal(transition.valid, true, transition.errors.join('\n'));
  roundTwo = transition.state;
  const caller = roundTwo.auctionActiveSeat!;
  transition = engine.submitAuctionAction(roundTwo, caller, {
    type: 'contract',
    tricks: 4,
    trumpSuit: 'clubs',
  });
  assert.equal(transition.valid, true, transition.errors.join('\n'));
  roundTwo = transition.state;
  while (roundTwo.phase === 'auction') {
    transition = engine.submitAuctionAction(roundTwo, roundTwo.auctionActiveSeat!, { type: 'pass' });
    assert.equal(transition.valid, true, transition.errors.join('\n'));
    roundTwo = transition.state;
  }

  for (const tricks of [3, 3]) {
    const seat = roundTwo.estimateOrder[roundTwo.currentEstimateIndex]!;
    transition = engine.submitBid(roundTwo, seat, {
      playerId: seats[seat].playerId,
      bidType: 'normal',
      tricks,
    });
    assert.equal(transition.valid, true, transition.errors.join('\n'));
    roundTwo = transition.state;
  }
  const finalEstimator = roundTwo.estimateOrder[roundTwo.currentEstimateIndex]!;
  assert.equal(bidOptions.legalOptions(roundTwo, finalEstimator).some((option) => option.tricks === 3), false);
  transition = engine.submitBid(roundTwo, finalEstimator, {
    playerId: seats[finalEstimator].playerId,
    bidType: 'normal',
    tricks: 2,
  });
  assert.equal(transition.valid, true, transition.errors.join('\n'));
  roundTwo = transition.state;

  assert.equal(roundTwo.phase, 'playing');
  assert.equal(roundTwo.currentTurnSeat, caller);
});
