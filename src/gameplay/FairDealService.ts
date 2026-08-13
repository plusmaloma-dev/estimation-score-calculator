import { cardId, type Card } from '../domain/card.js';
import { createCanonicalDeck } from './CanonicalDeck.js';
import { DeterministicRandomSource } from './DeterministicRandomSource.js';
import {
  SEAT_INDICES,
  type DealVerificationResult,
  type FairDealInput,
  type FairDealResult,
  type FairDealVerificationInput,
  type SeatHands,
  type SeatIndex,
} from './types.js';

const SEED_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

export class FairDealService {
  async deal(input: FairDealInput): Promise<FairDealResult> {
    this.validateInput(input);

    const normalizedSeedHex = input.seedHex.toLowerCase();
    const shuffledDeck = await this.shuffle(this.hexToBytes(normalizedSeedHex));
    const hands = this.distribute(shuffledDeck, input.firstSeat);
    const normalizedInput: FairDealInput = {
      ...input,
      seedHex: normalizedSeedHex,
    };

    return {
      ...normalizedInput,
      commitment: await this.commitment(normalizedInput),
      shuffledDeck,
      hands,
    };
  }

  async verify(record: FairDealVerificationInput): Promise<DealVerificationResult> {
    const errors: string[] = [];
    let expected: FairDealResult;

    try {
      expected = await this.deal({
        gameId: record.gameId,
        dealId: record.dealId,
        ruleSet: record.ruleSet,
        nonce: record.nonce,
        seedHex: record.seedHex,
        firstSeat: record.firstSeat,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Deal metadata is invalid.');
      return { valid: false, errors };
    }

    if (record.commitment !== expected.commitment) {
      errors.push('Deal commitment does not match the revealed seed and metadata.');
    }

    if (record.shuffledDeck.length !== 52 || new Set(record.shuffledDeck.map(cardId)).size !== 52) {
      errors.push('Recorded shuffled deck must contain 52 unique cards.');
    }

    if (!this.sameCardSequence(record.shuffledDeck, expected.shuffledDeck)) {
      errors.push('Recorded shuffled deck does not match the deterministic shuffle.');
    }

    if (record.hands.length !== 4 || record.hands.some((hand) => hand.cards.length !== 13)) {
      errors.push('Recorded deal must contain four hands of thirteen cards.');
    }

    if (!this.sameHands(record.hands, expected.hands)) {
      errors.push('Recorded hands do not match the deterministic deal.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateInput(input: FairDealInput): void {
    if (!input.gameId.trim()) {
      throw new Error('Game id is required.');
    }
    if (!input.dealId.trim()) {
      throw new Error('Deal id is required.');
    }
    if (!input.nonce.trim()) {
      throw new Error('Deal nonce is required.');
    }
    if (!SEED_HEX_PATTERN.test(input.seedHex)) {
      throw new Error('Seed must be exactly 32 bytes encoded as 64 hexadecimal characters.');
    }
    if (!(SEAT_INDICES as readonly number[]).includes(input.firstSeat)) {
      throw new Error('First seat must be 0, 1, 2, or 3.');
    }
  }

  private async commitment(input: FairDealInput): Promise<string> {
    if (globalThis.crypto?.subtle === undefined) {
      throw new Error('Web Crypto is required for deal commitments.');
    }

    const payload = [
      input.seedHex,
      input.dealId,
      input.gameId,
      input.ruleSet,
      input.nonce,
    ].join('|');
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload),
    );

    return this.bytesToHex(new Uint8Array(digest));
  }

  private async shuffle(seed: Uint8Array): Promise<readonly Card[]> {
    const deck = [...createCanonicalDeck()];
    const random = new DeterministicRandomSource(seed);

    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = await random.nextInt(index + 1);
      [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
    }

    return deck;
  }

  private distribute(deck: readonly Card[], firstSeat: SeatIndex): SeatHands {
    const cardsBySeat: [Card[], Card[], Card[], Card[]] = [[], [], [], []];

    deck.forEach((card, index) => {
      const seat = ((firstSeat + index) % 4) as SeatIndex;
      cardsBySeat[seat].push(card);
    });

    return SEAT_INDICES.map((seat) => ({
      seat,
      cards: cardsBySeat[seat],
    })) as unknown as SeatHands;
  }

  private hexToBytes(value: string): Uint8Array {
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(value.slice(index * 2, (index * 2) + 2), 16);
    }
    return bytes;
  }

  private bytesToHex(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private sameCardSequence(left: readonly Card[], right: readonly Card[]): boolean {
    return left.length === right.length
      && left.every((card, index) => cardId(card) === cardId(right[index]!));
  }

  private sameHands(
    left: FairDealVerificationInput['hands'],
    right: FairDealResult['hands'],
  ): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((hand, index) => {
      const expectedHand = right[index];
      return expectedHand !== undefined
        && hand.seat === expectedHand.seat
        && this.sameCardSequence(hand.cards, expectedHand.cards);
    });
  }
}
