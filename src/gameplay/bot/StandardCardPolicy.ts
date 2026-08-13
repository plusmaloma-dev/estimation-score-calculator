import { cardId, compareRanks, type Card } from '../../domain/card.js';
import {
  STANDARD_BOT_POLICY_VERSION,
  type BotCardDecision,
  type BotCardMode,
  type BotCardObservation,
  type BotReasonCode,
} from './types.js';

export class StandardCardPolicy {
  decide(observation: BotCardObservation): BotCardDecision {
    this.validateObservation(observation);

    const mode = this.resolveMode(observation);
    const onlyLegalAction = observation.legalCards.length === 1;
    const card = onlyLegalAction
      ? observation.legalCards[0]!
      : this.selectForMode(observation, mode);
    const reasonCode = onlyLegalAction
      ? 'FOLLOW_SUIT_ONLY_ACTION'
      : this.reasonForMode(mode);

    return {
      policyVersion: STANDARD_BOT_POLICY_VERSION,
      mode,
      reasonCode,
      card,
      legalCardIds: observation.legalCards.map(cardId),
    };
  }

  private validateObservation(observation: BotCardObservation): void {
    if (observation.policyVersion !== STANDARD_BOT_POLICY_VERSION) {
      throw new Error(`Unsupported Standard bot policy version: ${observation.policyVersion}.`);
    }
    if (observation.legalCards.length === 0) {
      throw new Error('Standard card policy requires at least one legal card.');
    }
    if (observation.cardsRemaining !== observation.hand.length) {
      throw new Error('Bot cardsRemaining must match the private hand length.');
    }
    if (!Number.isInteger(observation.estimate) || observation.estimate < 0 || observation.estimate > 13) {
      throw new Error('Bot estimate must be an integer between 0 and 13.');
    }
    if (!Number.isInteger(observation.tricksWon) || observation.tricksWon < 0 || observation.tricksWon > 13) {
      throw new Error('Bot tricks won must be an integer between 0 and 13.');
    }

    const handIds = new Set(observation.hand.map(cardId));
    if (observation.legalCards.some((card) => !handIds.has(cardId(card)))) {
      throw new Error('Every legal bot card must exist in the private hand.');
    }
  }

  private resolveMode(observation: BotCardObservation): BotCardMode {
    const needed = observation.estimate - observation.tricksWon;

    if (needed <= 0) {
      return 'dump';
    }
    if (needed > observation.cardsRemaining) {
      return 'recovery';
    }
    if (observation.cardsRemaining <= 3) {
      return 'endgame';
    }
    if (needed === observation.cardsRemaining) {
      return 'acquire';
    }
    return 'control';
  }

  private selectForMode(
    observation: BotCardObservation,
    mode: BotCardMode,
  ): Card {
    const needed = observation.estimate - observation.tricksWon;

    if (mode === 'acquire') {
      return this.highestCard(observation.legalCards);
    }
    if (mode === 'dump' || mode === 'recovery') {
      return this.lowestCard(observation.legalCards);
    }
    if (mode === 'endgame') {
      return needed > 0
        ? this.highestCard(observation.legalCards)
        : this.lowestCard(observation.legalCards);
    }

    return needed * 2 >= observation.cardsRemaining
      ? this.highestCard(observation.legalCards)
      : this.lowestCard(observation.legalCards);
  }

  private reasonForMode(mode: BotCardMode): BotReasonCode {
    switch (mode) {
      case 'acquire':
        return 'ACQUIRE_REQUIRED_TRICK';
      case 'control':
        return 'CONTROL_EXACT_TARGET';
      case 'dump':
        return 'AVOID_OVERTRICK';
      case 'recovery':
        return 'MINIMIZE_DAMAGE';
      case 'endgame':
        return 'ENDGAME_EXACT_SEARCH';
    }
  }

  private lowestCard(cards: readonly Card[]): Card {
    return this.extremeCard(cards, 'lowest');
  }

  private highestCard(cards: readonly Card[]): Card {
    return this.extremeCard(cards, 'highest');
  }

  private extremeCard(cards: readonly Card[], direction: 'lowest' | 'highest'): Card {
    let extremeRank = cards[0]!.rank;

    for (const card of cards.slice(1)) {
      const comparison = compareRanks(card.rank, extremeRank);
      if ((direction === 'lowest' && comparison < 0) || (direction === 'highest' && comparison > 0)) {
        extremeRank = card.rank;
      }
    }

    return cards
      .filter((card) => card.rank === extremeRank)
      .slice()
      .sort((left, right) => cardId(left).localeCompare(cardId(right)))[0]!;
  }
}
