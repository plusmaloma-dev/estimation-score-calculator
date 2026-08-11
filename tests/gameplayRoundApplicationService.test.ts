import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FairDealService,
  GameplayRoundApplicationService,
  HouseRulesRoundEngine,
  type CreateHouseRulesRoundInput,
  type EstimationBid,
  type GameplayAuctionAction,
  type GameplayRoundActor,
  type GameplayRoundAggregate,
  type GameplayRoundCommitInput,
  type GameplayRoundCommitResult,
  type GameplayRoundRepository,
} from '../src/index.js';

const players = [
  { seat: 0, playerId: 'p0' },
  { seat: 1, playerId: 'p1' },
  { seat: 2, playerId: 'p2' },
  { seat: 3, playerId: 'p3' },
] as const;

async function roundInput(): Promise<CreateHouseRulesRoundInput> {
  const deal = await new FairDealService().deal({
    gameId: 'application-game',
    dealId: 'application-deal',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'application-nonce',
    seedHex: '82'.repeat(32),
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

async function aggregate(
  overrides: Partial<GameplayRoundAggregate> = {},
): Promise<GameplayRoundAggregate> {
  const state = new HouseRulesRoundEngine().create(await roundInput());
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    state,
    version: 0,
    records: [],
    seatControls: [
      { seat: 0, humanUserId: 'user-0', controlOwner: 'human' },
      { seat: 1, humanUserId: 'user-1', controlOwner: 'human' },
      { seat: 2, humanUserId: 'user-2', controlOwner: 'human' },
      { seat: 3, botId: 'standard-bot:table-1:3', controlOwner: 'permanent-bot' },
    ],
    ...overrides,
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

const actor = (userId: string): GameplayRoundActor => ({ userId });
const openingContract = (tricks = 5): GameplayAuctionAction => ({
  type: 'contract',
  tricks,
  trumpSuit: 'spades',
});

const estimateFor = (playerId: string, tricks: number): EstimationBid => ({
  playerId,
  bidType: 'normal',
  tricks,
});

async function resolvedEstimateState() {
  const engine = new HouseRulesRoundEngine();
  let state = engine.create(await roundInput());
  for (const [seat, action] of [
    [2, openingContract()],
    [3, { type: 'pass' }],
    [0, { type: 'pass' }],
    [1, { type: 'pass' }],
  ] as const) {
    const result = engine.submitAuctionAction(state, seat, action);
    assert.equal(result.valid, true, result.errors.join('\n'));
    state = result.state;
  }
  return state;
}

test('authorized actor receives only their seat-scoped snapshot', async () => {
  const initial = await aggregate();
  const repository = new MemoryRoundRepository(initial);
  const service = new GameplayRoundApplicationService(repository);

  const result = await service.getSnapshot('table-1', actor('user-2'));

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.value?.viewerSeat, 2);
  assert.deepEqual(result.value?.ownHand, initial.state.hands[2].cards);
  assert.equal(JSON.stringify(result.value).includes('"hands"'), false);
  assert.equal(repository.commits.length, 0);
});

test('accepted auction action is processed by the round engine and committed once', async () => {
  const repository = new MemoryRoundRepository(await aggregate());
  const service = new GameplayRoundApplicationService(repository);

  const result = await service.submitAuctionAction(
    'table-1', actor('user-2'), 'auction-command-1', 0, openingContract(),
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.duplicate, false);
  assert.equal(result.value?.version, 1);
  assert.equal(result.value?.callerSeat, undefined);
  assert.deepEqual(result.value?.currentHighestContract, {
    seat: 2,
    playerId: 'p2',
    tricks: 5,
    trumpSuit: 'spades',
  });
  assert.equal(repository.commits.length, 1);
  assert.equal(repository.commits[0]?.record.accepted, true);
  assert.equal(repository.commits[0]?.record.command.type, 'SUBMIT_AUCTION_ACTION');
});

test('same auction command retry is deterministic and does not create a second commit', async () => {
  const repository = new MemoryRoundRepository(await aggregate());
  const service = new GameplayRoundApplicationService(repository);

  const first = await service.submitAuctionAction(
    'table-1', actor('user-2'), 'auction-command-1', 0, openingContract(),
  );
  const retry = await service.submitAuctionAction(
    'table-1', actor('user-2'), 'auction-command-1', 0, openingContract(),
  );

  assert.equal(first.valid, true);
  assert.equal(retry.valid, true, retry.errors.join('\n'));
  assert.equal(retry.duplicate, true);
  assert.equal(retry.value?.version, 1);
  assert.equal(repository.commits.length, 1);
});

test('stale version rejection is recorded without changing round version', async () => {
  const repository = new MemoryRoundRepository(await aggregate());
  const service = new GameplayRoundApplicationService(repository);

  const result = await service.submitAuctionAction(
    'table-1', actor('user-2'), 'stale-command', 4, openingContract(),
  );

  assert.equal(result.valid, false);
  assert.equal(result.value?.version, 0);
  assert.ok(result.errors.includes('Expected game version 4 does not match current version 0.'));
  assert.equal(repository.commits.length, 1);
  assert.equal(repository.commits[0]?.record.accepted, false);
  assert.equal(repository.commits[0]?.resultingVersion, 0);
});

test('conflicting reuse of a command id is rejected without another commit', async () => {
  const repository = new MemoryRoundRepository(await aggregate());
  const service = new GameplayRoundApplicationService(repository);
  await service.submitAuctionAction('table-1', actor('user-2'), 'shared-id', 0, openingContract(5));

  const conflict = await service.submitAuctionAction(
    'table-1', actor('user-2'), 'shared-id', 0, openingContract(6),
  );

  assert.equal(conflict.valid, false);
  assert.ok(conflict.errors.includes('Command id shared-id was already used with a different payload.'));
  assert.equal(repository.commits.length, 1);
});

test('missing seat, temporary bot ownership, paused lifecycle, and player spoofing are rejected', async () => {
  const initial = await aggregate({
    seatControls: [
      { seat: 0, humanUserId: 'user-0', controlOwner: 'human' },
      { seat: 1, humanUserId: 'user-1', controlOwner: 'human' },
      { seat: 2, humanUserId: 'user-2', controlOwner: 'temporary-bot' },
      { seat: 3, botId: 'standard-bot:table-1:3', controlOwner: 'permanent-bot' },
    ],
  });
  const repository = new MemoryRoundRepository(initial);
  const service = new GameplayRoundApplicationService(repository);

  const missing = await service.getSnapshot('table-1', actor('unknown-user'));
  const takeover = await service.submitAuctionAction(
    'table-1', actor('user-2'), 'takeover-command', 0, openingContract(),
  );
  repository.value = await aggregate({ lifecycle: 'paused' });
  const paused = await service.submitAuctionAction(
    'table-1', actor('user-2'), 'paused-command', 0, openingContract(),
  );
  repository.value = await aggregate({
    state: await resolvedEstimateState(),
    seatControls: [
      { seat: 0, humanUserId: 'user-0', controlOwner: 'human' },
      { seat: 1, humanUserId: 'user-1', controlOwner: 'human' },
      { seat: 2, humanUserId: 'user-2', controlOwner: 'human' },
      { seat: 3, humanUserId: 'user-3', controlOwner: 'human' },
    ],
  });
  const spoofed = await service.submitBid(
    'table-1', actor('user-3'), 'spoof-command', 0,
    estimateFor('p1', 3),
  );

  assert.deepEqual(missing.errors, ['Authenticated user does not occupy a human seat at this table.']);
  assert.deepEqual(takeover.errors, ['Seat 2 is currently controlled by a temporary bot.']);
  assert.deepEqual(paused.errors, ['Gameplay commands are only accepted while the table is active.']);
  assert.ok(spoofed.errors.includes('Seat 3 is assigned to player p3.'));
  assert.equal(repository.commits.length, 1, 'Only the domain-rejected spoof command should be recorded.');
});
