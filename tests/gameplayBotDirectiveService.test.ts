import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FairDealService,
  GameplayBotDirectiveService,
  HouseRulesRoundEngine,
  type BotActionDirective,
  type CreateHouseRulesRoundInput,
  type GameplayRoundActor,
  type GameplayRoundAggregate,
  type GameplayRoundCommitInput,
  type GameplayRoundCommitResult,
  type GameplayRoundRepository,
  type HouseRulesRoundState,
} from '../src/index.js';

const players = [
  { seat: 0, playerId: 'human-0' },
  { seat: 1, playerId: 'bot-1' },
  { seat: 2, playerId: 'bot-2' },
  { seat: 3, playerId: 'bot-3' },
] as const;

async function roundInput(): Promise<CreateHouseRulesRoundInput> {
  const deal = await new FairDealService().deal({
    gameId: 'directive-game',
    dealId: 'directive-deal',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'directive-nonce',
    seedHex: '94'.repeat(32),
    firstSeat: 0,
  });
  return {
    roundNumber: 1,
    players,
    hands: deal.hands,
    bidOrder: [1, 2, 3, 0],
    playOrder: [0, 1, 2, 3],
    dealerSeat: 0,
    // The normal contract path must use the resolved caller instead of this
    // all-pass fallback lead. The bot caller below is seat 1.
    firstLeadSeat: 2,
  };
}

class MemoryRoundRepository implements GameplayRoundRepository {
  readonly commits: GameplayRoundCommitInput[] = [];

  constructor(public value: GameplayRoundAggregate | undefined) {}

  async load(tableId: string): Promise<GameplayRoundAggregate | undefined> {
    return this.value?.tableId === tableId ? this.value : undefined;
  }

  async commit(input: GameplayRoundCommitInput): Promise<GameplayRoundCommitResult> {
    this.commits.push(input);
    if (this.value === undefined) return { valid: false, errors: ['Round not found.'] };
    if (this.value.version !== input.baseVersion) {
      return { valid: false, errors: ['Concurrent round update detected.'] };
    }
    this.value = {
      ...this.value,
      state: input.resultingState,
      version: input.resultingVersion,
      records: [...this.value.records, input.record],
    };
    return { valid: true, errors: [], aggregate: this.value };
  }
}

async function aggregate(
  state?: HouseRulesRoundState,
  overrides: Partial<GameplayRoundAggregate> = {},
): Promise<GameplayRoundAggregate> {
  const roundState = state ?? new HouseRulesRoundEngine().create(await roundInput());
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    state: roundState,
    version: 0,
    records: [],
    seatControls: [
      { seat: 0, humanUserId: 'user-0', controlOwner: 'human' },
      { seat: 1, botId: 'standard-bot:table-1:1', controlOwner: 'permanent-bot' },
      { seat: 2, botId: 'standard-bot:table-1:2', controlOwner: 'permanent-bot' },
      { seat: 3, botId: 'standard-bot:table-1:3', controlOwner: 'permanent-bot' },
    ],
    ...overrides,
  };
}

const actor: GameplayRoundActor = { userId: 'user-0' };

function directive(
  overrides: Partial<BotActionDirective> = {},
): BotActionDirective {
  return {
    directiveId: 'bot-action:table-1:bid-1:1',
    tableId: 'table-1',
    turnId: 'bid-1',
    seat: 1,
    actionKind: 'bid',
    source: 'permanent-bot',
    issuedAt: '2026-07-26T13:40:00.000Z',
    ...overrides,
  };
}

function acceptedBid(
  engine: HouseRulesRoundEngine,
  state: HouseRulesRoundState,
  seat: 0 | 1 | 2 | 3,
  tricks: number,
): HouseRulesRoundState {
  const result = engine.submitBid(state, seat, {
    playerId: players[seat].playerId,
    bidType: 'normal',
    tricks,
  });
  assert.equal(result.valid, true, result.errors.join('\n'));
  return result.state;
}

test('permanent bot auction action is decided from private server state and committed with audit metadata', async () => {
  const repository = new MemoryRoundRepository(await aggregate());
  const service = new GameplayBotDirectiveService(repository);

  const result = await service.process('table-1', actor, directive());

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.duplicate, false);
  assert.equal(result.value?.viewerSeat, 0);
  assert.equal(result.value?.version, 1);
  assert.deepEqual(result.value?.currentHighestContract, {
    seat: 1,
    playerId: 'bot-1',
    tricks: 4,
    trumpSuit: 'clubs',
  });
  assert.equal(repository.commits.length, 1);
  const record = repository.commits[0]!.record;
  assert.equal(record.commandId, 'bot-round:bot-action:table-1:bid-1:1');
  assert.equal(record.command.type, 'SUBMIT_AUCTION_ACTION');
  assert.equal(record.transition.metadata?.directiveId, directive().directiveId);
  assert.equal(
    typeof (record.transition.metadata?.botDecisionAudit as Readonly<Record<string, unknown>> | undefined)?.policyVersion,
    'string',
  );
  assert.equal(JSON.stringify(result.value).includes('hand'), false);
});

test('same directive retry is idempotent and does not create a second commit', async () => {
  const repository = new MemoryRoundRepository(await aggregate());
  const service = new GameplayBotDirectiveService(repository);

  const first = await service.process('table-1', actor, directive());
  const retry = await service.process('table-1', actor, directive());

  assert.equal(first.valid, true);
  assert.equal(retry.valid, true, retry.errors.join('\n'));
  assert.equal(retry.duplicate, true);
  assert.equal(retry.value?.version, 1);
  assert.equal(repository.commits.length, 1);
});

test('permanent bot card uses the legal server-side observation and advances public trick state', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = engine.create(await roundInput());
  state = engine.submitAuctionAction(state, 1, { type: 'contract', tricks: 5, trumpSuit: 'spades' }).state;
  state = engine.submitAuctionAction(state, 2, { type: 'pass' }).state;
  state = engine.submitAuctionAction(state, 3, { type: 'pass' }).state;
  state = engine.submitAuctionAction(state, 0, { type: 'pass' }).state;
  state = acceptedBid(engine, state, 2, 2);
  state = acceptedBid(engine, state, 3, 1);
  state = acceptedBid(engine, state, 0, 3);
  assert.equal(state.phase, 'playing');
  assert.equal(state.currentTurnSeat, 1);
  const repository = new MemoryRoundRepository(await aggregate(state, { version: 4 }));
  const service = new GameplayBotDirectiveService(repository);

  const result = await service.process('table-1', actor, directive({
    directiveId: 'bot-action:table-1:card-1:1',
    turnId: 'card-1',
    actionKind: 'card',
  }));

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.value?.version, 5);
  assert.equal(result.value?.currentTrick.length, 1);
  assert.equal(result.value?.players[1]?.cardCount, 12);
  assert.equal(repository.commits[0]?.record.command.type, 'PLAY_CARD');
});

test('directive source must match authoritative seat ownership', async () => {
  const repository = new MemoryRoundRepository(await aggregate(undefined, {
    seatControls: [
      { seat: 0, humanUserId: 'user-0', controlOwner: 'human' },
      { seat: 1, humanUserId: 'user-1', controlOwner: 'human' },
      { seat: 2, botId: 'standard-bot:table-1:2', controlOwner: 'permanent-bot' },
      { seat: 3, botId: 'standard-bot:table-1:3', controlOwner: 'permanent-bot' },
    ],
  }));
  const service = new GameplayBotDirectiveService(repository);

  const result = await service.process('table-1', actor, directive());

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Permanent-bot directive does not match the authoritative seat owner.']);
  assert.equal(repository.commits.length, 0);
});

test('stale action kind or active seat is rejected before a bot policy decision', async () => {
  const repository = new MemoryRoundRepository(await aggregate());
  const service = new GameplayBotDirectiveService(repository);

  const wrongKind = await service.process('table-1', actor, directive({ actionKind: 'card' }));
  const wrongSeat = await service.process('table-1', actor, directive({ seat: 2 }));

  assert.deepEqual(wrongKind.errors, ['Bot directive does not match the authoritative round phase.']);
  assert.deepEqual(wrongSeat.errors, ['Bot directive does not match the authoritative active seat.']);
  assert.equal(repository.commits.length, 0);
});
