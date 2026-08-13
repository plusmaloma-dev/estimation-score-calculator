import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LegalCardPlayService,
  type Card,
  type GameplayTrickEntry,
} from '../src/index.js';

const twoClubs: Card = { suit: 'clubs', rank: '2' };
const aceClubs: Card = { suit: 'clubs', rank: 'A' };
const kingHearts: Card = { suit: 'hearts', rank: 'K' };
const threeSpades: Card = { suit: 'spades', rank: '3' };

const ledHearts: readonly GameplayTrickEntry[] = [
  { seat: 0, card: { suit: 'hearts', rank: '4' } },
];

test('leading player may choose any card in hand', () => {
  const hand = [twoClubs, kingHearts, threeSpades];

  assert.deepEqual(new LegalCardPlayService().legalCards(hand, []), hand);
});

test('player must follow the led suit when holding that suit', () => {
  const hand = [twoClubs, kingHearts, threeSpades];

  assert.deepEqual(
    new LegalCardPlayService().legalCards(hand, ledHearts),
    [kingHearts],
  );
});

test('player may discard or trump when void in the led suit', () => {
  const hand = [twoClubs, aceClubs, threeSpades];

  assert.deepEqual(new LegalCardPlayService().legalCards(hand, ledHearts), hand);
});

test('validation rejects an off-suit card when the player can follow suit', () => {
  const hand = [twoClubs, kingHearts, threeSpades];

  const result = new LegalCardPlayService().validate(twoClubs, hand, ledHearts);

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Player must follow the led suit when possible.']);
});

test('validation rejects a card that is not in the player hand', () => {
  const hand = [twoClubs, kingHearts];

  const result = new LegalCardPlayService().validate(threeSpades, hand, []);

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Selected card is not in the player hand.']);
});
