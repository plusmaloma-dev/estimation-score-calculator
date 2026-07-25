import {
  CARD_SUITS,
  cardId,
  type Card,
  type CardSuit,
  type ContractSuit,
  type Rank,
} from '../../domain/card.js';
import type { TrickProbability } from './types.js';

const HONOUR_VALUES: Readonly<Record<Rank, number>> = {
  '2': 0,
  '3': 0,
  '4': 0,
  '5': 0,
  '6': 0,
  '7': 0,
  '8': 0,
  '9': 0,
  '10': 0.05,
  J: 0.15,
  Q: 0.3,
  K: 0.5,
  A: 0.8,
};

const DISTRIBUTION_SIGMA = 1.45;

export class HandStrengthEvaluator {
  evaluate(
    hand: readonly Card[],
    contractSuit: ContractSuit,
  ): readonly TrickProbability[] {
    this.validateHand(hand);

    const centre = this.estimateCentre(hand, contractSuit);
    const rawWeights = Array.from({ length: 14 }, (_, tricks) => {
      const distance = tricks - centre;
      return Math.exp(-(distance * distance) / (2 * DISTRIBUTION_SIGMA * DISTRIBUTION_SIGMA));
    });
    const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);

    return rawWeights.map((weight, tricks) => ({
      tricks,
      probability: weight / totalWeight,
    }));
  }

  private validateHand(hand: readonly Card[]): void {
    if (hand.length !== 13 || new Set(hand.map(cardId)).size !== 13) {
      throw new Error('Standard bot hand evaluation requires exactly thirteen unique cards.');
    }
  }

  private estimateCentre(
    hand: readonly Card[],
    contractSuit: ContractSuit,
  ): number {
    const suitCards = this.cardsBySuit(hand);
    let centre = hand.reduce((total, card) => total + HONOUR_VALUES[card.rank], 0);

    if (contractSuit === 'no-trump') {
      centre += this.noTrumpStopperValue(suitCards);
      centre -= this.noTrumpShortSuitPenalty(suitCards);
    } else {
      const trumpCards = suitCards[contractSuit];
      centre += trumpCards.length * 0.15;
      centre += Math.max(0, trumpCards.length - 4) * 0.45;
      centre += this.ruffingPotential(suitCards, contractSuit);
    }

    return Math.min(13, Math.max(0, centre));
  }

  private cardsBySuit(hand: readonly Card[]): Record<CardSuit, readonly Card[]> {
    return Object.fromEntries(
      CARD_SUITS.map((suit) => [suit, hand.filter((card) => card.suit === suit)]),
    ) as Record<CardSuit, readonly Card[]>;
  }

  private noTrumpStopperValue(
    suitCards: Readonly<Record<CardSuit, readonly Card[]>>,
  ): number {
    return CARD_SUITS.reduce((total, suit) => {
      const ranks = new Set(suitCards[suit].map((card) => card.rank));
      if (ranks.has('A')) {
        return total + 0.35;
      }
      if (ranks.has('K') && (ranks.has('Q') || suitCards[suit].length >= 3)) {
        return total + 0.2;
      }
      return total;
    }, 0);
  }

  private noTrumpShortSuitPenalty(
    suitCards: Readonly<Record<CardSuit, readonly Card[]>>,
  ): number {
    return CARD_SUITS.reduce((penalty, suit) => {
      const length = suitCards[suit].length;
      if (length === 0) return penalty + 0.35;
      if (length === 1) return penalty + 0.15;
      return penalty;
    }, 0);
  }

  private ruffingPotential(
    suitCards: Readonly<Record<CardSuit, readonly Card[]>>,
    trumpSuit: CardSuit,
  ): number {
    if (suitCards[trumpSuit].length < 2) {
      return 0;
    }

    return CARD_SUITS.reduce((bonus, suit) => {
      if (suit === trumpSuit) return bonus;
      const length = suitCards[suit].length;
      if (length === 0) return bonus + 0.35;
      if (length === 1) return bonus + 0.15;
      return bonus;
    }, 0);
  }
}
