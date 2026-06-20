import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TrickValidationService } from '../src/services/TrickValidationService.js';
import type { Card } from '../src/domain/card.js';
import type { Trick } from '../src/domain/trick.js';

const service = new TrickValidationService();
const activePlayerIds = ['player-1', 'player-2', 'player-3', 'player-4'];

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

function trick(entries: Trick['entries']): Trick {
  return {
    roundNumber: 1,
    trickNumber: 1,
    entries,
  };
}

describe('TrickValidationService', () => {
  it('accepts a valid partial trick', () => {
    const result = service.validateTrick(
      trick([
        { playerId: 'player-1', card: card('A', 'spades') },
        { playerId: 'player-2', card: card('K', 'spades') },
      ]),
      { activePlayerIds },
    );

    assert.deepEqual(result, {
      valid: true,
      errors: [],
    });
  });

  it('rejects duplicate cards in the same trick', () => {
    const result = service.validateTrick(
      trick([
        { playerId: 'player-1', card: card('A', 'spades') },
        { playerId: 'player-2', card: card('A', 'spades') },
      ]),
      { activePlayerIds },
    );

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /Duplicate card/);
  });

  it('rejects duplicate player entries in the same trick', () => {
    const result = service.validateTrick(
      trick([
        { playerId: 'player-1', card: card('A', 'spades') },
        { playerId: 'player-1', card: card('K', 'hearts') },
      ]),
      { activePlayerIds },
    );

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /cannot play more than one card/);
  });

  it('rejects tricks with more cards than active players', () => {
    const result = service.validateTrick(
      trick([
        { playerId: 'player-1', card: card('A', 'spades') },
        { playerId: 'player-2', card: card('K', 'spades') },
        { playerId: 'player-3', card: card('Q', 'spades') },
      ]),
      { activePlayerIds: ['player-1', 'player-2'] },
    );

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /cannot exceed active player count/);
  });

  it('rejects entries for inactive players', () => {
    const result = service.validateTrick(
      trick([{ playerId: 'player-9', card: card('A', 'clubs') }]),
      { activePlayerIds },
    );

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /not active/);
  });
});
