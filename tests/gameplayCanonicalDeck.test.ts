import assert from 'node:assert/strict';
import test from 'node:test';

import { cardId, createCanonicalDeck } from '../src/index.js';

test('canonical deck contains each of the 52 cards exactly once', () => {
  const deck = createCanonicalDeck();

  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(cardId)).size, 52);
});

test('canonical deck order is stable by suit then rank', () => {
  const deck = createCanonicalDeck();

  assert.equal(cardId(deck[0]!), '2-spades');
  assert.equal(cardId(deck[12]!), 'A-spades');
  assert.equal(cardId(deck[13]!), '2-hearts');
  assert.equal(cardId(deck[51]!), 'A-clubs');
});
