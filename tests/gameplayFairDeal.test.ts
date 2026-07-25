import assert from 'node:assert/strict';
import test from 'node:test';

import { cardId, FairDealService, type FairDealInput } from '../src/index.js';

const input: FairDealInput = {
  gameId: 'game-1',
  dealId: 'deal-1',
  ruleSet: 'HOUSE_RULES_V1',
  nonce: 'nonce-1',
  seedHex: '00'.repeat(32),
  firstSeat: 1,
};

test('fair deal gives four seats thirteen unique cards each', () => {
  const result = new FairDealService().deal(input);
  const cards = result.hands.flatMap((hand) => hand.cards);

  assert.deepEqual(result.hands.map((hand) => hand.cards.length), [13, 13, 13, 13]);
  assert.equal(new Set(cards.map(cardId)).size, 52);
  assert.equal(result.hands[1]!.cards[0], result.shuffledDeck[0]);
  assert.equal(result.hands[2]!.cards[0], result.shuffledDeck[1]);
  assert.equal(result.hands[3]!.cards[0], result.shuffledDeck[2]);
  assert.equal(result.hands[0]!.cards[0], result.shuffledDeck[3]);
});

test('same seed and deal metadata reproduce the same commitment, deck, and hands', () => {
  const service = new FairDealService();

  assert.deepEqual(service.deal(input), service.deal(input));
});

test('different seed changes the shuffled deck', () => {
  const service = new FairDealService();
  const first = service.deal(input);
  const second = service.deal({ ...input, seedHex: '01'.repeat(32) });

  assert.notDeepEqual(first.shuffledDeck, second.shuffledDeck);
});

test('verification rejects altered recorded hands', () => {
  const service = new FairDealService();
  const result = service.deal(input);
  const firstHand = result.hands[0]!;
  const secondHand = result.hands[1]!;
  const altered = {
    ...result,
    hands: result.hands.map((hand, index) => {
      if (index === 0) {
        return { ...hand, cards: [secondHand.cards[0]!, ...hand.cards.slice(1)] };
      }
      if (index === 1) {
        return { ...hand, cards: [firstHand.cards[0]!, ...hand.cards.slice(1)] };
      }
      return hand;
    }),
  };

  const verification = service.verify(altered);
  assert.equal(verification.valid, false);
  assert.ok(verification.errors.includes('Recorded hands do not match the deterministic deal.'));
});

test('verification rejects altered commitment metadata', () => {
  const service = new FairDealService();
  const result = service.deal(input);

  const verification = service.verify({ ...result, commitment: '0'.repeat(64) });
  assert.equal(verification.valid, false);
  assert.ok(verification.errors.includes('Deal commitment does not match the revealed seed and metadata.'));
});

test('seed must contain exactly 256 bits encoded as hexadecimal', () => {
  const service = new FairDealService();

  assert.throws(
    () => service.deal({ ...input, seedHex: '00' }),
    /Seed must be exactly 32 bytes encoded as 64 hexadecimal characters\./,
  );
});

test('first seat must be one of the four table seats', () => {
  const service = new FairDealService();

  assert.throws(
    () => service.deal({ ...input, firstSeat: 4 as 0 }),
    /First seat must be 0, 1, 2, or 3\./,
  );
});
