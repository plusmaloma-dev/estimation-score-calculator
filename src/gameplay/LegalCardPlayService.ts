import { cardId, type Card } from '../domain/card.js';
import type { ValidationResult } from '../domain/bid.js';
import type { GameplayTrickEntry } from './types.js';

export class LegalCardPlayService {
  legalCards(
    hand: readonly Card[],
    trickEntries: readonly GameplayTrickEntry[],
  ): readonly Card[] {
    const leadSuit = trickEntries[0]?.card.suit;
    if (leadSuit === undefined) {
      return hand;
    }

    const matchingSuit = hand.filter((card) => card.suit === leadSuit);
    return matchingSuit.length > 0 ? matchingSuit : hand;
  }

  validate(
    selectedCard: Card,
    hand: readonly Card[],
    trickEntries: readonly GameplayTrickEntry[],
  ): ValidationResult {
    const selectedCardId = cardId(selectedCard);
    const handContainsCard = hand.some((card) => cardId(card) === selectedCardId);

    if (!handContainsCard) {
      return {
        valid: false,
        errors: ['Selected card is not in the player hand.'],
      };
    }

    const legal = this.legalCards(hand, trickEntries);
    const isLegal = legal.some((card) => cardId(card) === selectedCardId);

    return {
      valid: isLegal,
      errors: isLegal ? [] : ['Player must follow the led suit when possible.'],
    };
  }
}
