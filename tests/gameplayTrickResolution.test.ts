import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TrickResolutionService,
  type GameplayTrickEntry,
} from '../src/index.js';

const noTrumpEntries: readonly GameplayTrickEntry[] = [
  { seat: 0, card: { suit: 'hearts', rank: '10' } },
  { seat: 1, card: { suit: 'clubs', rank: 'A' } },
  { seat: 2, card: { suit: 'hearts', rank: 'K' } },
  { seat: 3, card: { suit: 'hearts', rank: '3' } },
];

test('no-trump trick is won by the highest card of the led suit', () => {
  assert.equal(new TrickResolutionService().resolve(noTrumpEntries, 'no-trump'), 2);
});

test('a trump card beats every non-trump card', () => {
  const entries: readonly GameplayTrickEntry[] = [
    { seat: 0, card: { suit: 'hearts', rank: 'A' } },
    { seat: 1, card: { suit: 'clubs', rank: '2' } },
    { seat: 2, card: { suit: 'hearts', rank: 'K' } },
    { seat: 3, card: { suit: 'diamonds', rank: 'A' } },
  ];

  assert.equal(new TrickResolutionService().resolve(entries, 'clubs'), 1);
});

test('highest trump wins when more than one trump is played', () => {
  const entries: readonly GameplayTrickEntry[] = [
    { seat: 0, card: { suit: 'diamonds', rank: 'A' } },
    { seat: 1, card: { suit: 'spades', rank: '7' } },
    { seat: 2, card: { suit: 'spades', rank: 'Q' } },
    { seat: 3, card: { suit: 'diamonds', rank: 'K' } },
  ];

  assert.equal(new TrickResolutionService().resolve(entries, 'spades'), 2);
});

test('preserves the confirmed mixed-suit trick winner regression', () => {
  const entries: readonly GameplayTrickEntry[] = [
    { seat: 2, card: { suit: 'hearts', rank: '4' } },
    { seat: 3, card: { suit: 'hearts', rank: '8' } },
    { seat: 0, card: { suit: 'spades', rank: 'K' } },
    { seat: 1, card: { suit: 'hearts', rank: '9' } },
  ];

  assert.equal(new TrickResolutionService().resolve(entries, 'clubs'), 1);
});

test('trick resolution requires exactly four unique seats', () => {
  const service = new TrickResolutionService();

  assert.throws(
    () => service.resolve(noTrumpEntries.slice(0, 3), 'no-trump'),
    /A completed Estimation trick requires exactly four cards\./,
  );
  assert.throws(
    () => service.resolve([
      noTrumpEntries[0]!,
      noTrumpEntries[1]!,
      noTrumpEntries[2]!,
      { seat: 2, card: { suit: 'clubs', rank: '2' } },
    ], 'no-trump'),
    /A completed Estimation trick requires four unique seats\./,
  );
});
