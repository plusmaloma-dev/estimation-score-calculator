import { describe, expect, it } from 'vitest';
import {
  createCurrentRoundDraft,
  currentRoundReducer,
  resolveHighestEstimatePlayerId,
  validateCurrentRoundDraft,
} from './currentRoundReducer.js';

describe('currentRoundReducer', () => {
  it('derives O/U and the unique highest-estimate player', () => {
    let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
    const estimates = { A: 3, B: 2, C: 4, D: 5 };
    const actuals = { A: 3, B: 2, C: 4, D: 4 };

    for (const playerId of draft.playerOrder) {
      draft = currentRoundReducer(draft, { type: 'set-estimate', playerId, value: estimates[playerId as keyof typeof estimates] });
      draft = currentRoundReducer(draft, { type: 'set-actual', playerId, value: actuals[playerId as keyof typeof actuals] });
    }
    draft = currentRoundReducer(draft, { type: 'set-trump', suit: 'hearts' });

    expect(draft.overUnder).toBe(1);
    expect(resolveHighestEstimatePlayerId(draft)).toBe('D');
    expect(validateCurrentRoundDraft(draft)).toEqual([]);
  });

  it('requires a unique highest estimate before trump can be selected', () => {
    let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
    for (const [playerId, value] of Object.entries({ A: 4, B: 3, C: 3, D: 4 })) {
      draft = currentRoundReducer(draft, { type: 'set-estimate', playerId, value });
    }

    expect(resolveHighestEstimatePlayerId(draft)).toBeUndefined();
    expect(validateCurrentRoundDraft(draft)).toContain('A unique highest estimate is required.');
  });

  it('rejects estimate total 13 and incomplete actual totals', () => {
    let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
    for (const [playerId, value] of Object.entries({ A: 4, B: 3, C: 3, D: 3 })) {
      draft = currentRoundReducer(draft, { type: 'set-estimate', playerId, value });
    }

    expect(validateCurrentRoundDraft(draft)).toContain('Total estimates cannot equal 13.');
    expect(validateCurrentRoundDraft(draft)).toContain('Actual tricks must total 13.');
  });
});