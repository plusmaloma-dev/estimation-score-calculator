import { cardId } from '../domain/card.js';
import type { ValidationResult } from '../domain/bid.js';
import type { Trick, TrickValidationOptions } from '../domain/trick.js';

export class TrickValidationService {
  validateTrick(trick: Trick, options: TrickValidationOptions): ValidationResult {
    const errors: string[] = [];
    const activePlayerIds = new Set(options.activePlayerIds);
    const playedCards = new Set<string>();
    const playersInTrick = new Set<string>();

    if (!Number.isInteger(trick.roundNumber) || trick.roundNumber < 1) {
      errors.push('Round number must be a positive integer.');
    }

    if (!Number.isInteger(trick.trickNumber) || trick.trickNumber < 1) {
      errors.push('Trick number must be a positive integer.');
    }

    if (activePlayerIds.size === 0) {
      errors.push('At least one active player is required to validate a trick.');
    }

    if (trick.entries.length > activePlayerIds.size) {
      errors.push('Trick card count cannot exceed active player count.');
    }

    for (const entry of trick.entries) {
      const playerId = entry.playerId.trim();

      if (!playerId) {
        errors.push('Trick entry player id is required.');
      } else if (!activePlayerIds.has(playerId)) {
        errors.push(`Player ${playerId} is not active in this trick.`);
      }

      if (playersInTrick.has(playerId)) {
        errors.push(`Player ${playerId} cannot play more than one card in the same trick.`);
      }
      playersInTrick.add(playerId);

      const currentCardId = cardId(entry.card);
      if (playedCards.has(currentCardId)) {
        errors.push(`Duplicate card in trick: ${currentCardId}.`);
      }
      playedCards.add(currentCardId);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
