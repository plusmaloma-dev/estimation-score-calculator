import { describe, expect, it } from 'vitest';
import { createCurrentRoundDraft, currentRoundReducer, validateCurrentRoundDraft } from './currentRoundReducer.js';

describe('currentRoundReducer', () => {
  it('derives O/U and validates estimates and actual tricks', () => {
    let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
    const estimates = { A: 4, B: 3, C: 3, D: 4 };
    const actuals = { A: 4, B: 2, C: 3, D: 4 };

    for (const playerId of draft.playerOrder) {
      draft = currentRoundReducer(draft, { type: 'set-estimate', playerId, value: estimates[playerId as keyof typeof estimates] });
      draft = currentRoundReducer(draft, { type: 'set-actual', playerId, value: actuals[playerId as keyof typeof actuals] });
    }
    draft = currentRoundReducer(draft, { type: 'set-bid-owner', playerId: 'A' });
    draft = currentRoundReducer(draft, { type: 'set-trump', suit: 'spades' });

    expect(draft.overUnder).toBe(1);
    expect(validateCurrentRoundDraft(draft)).toEqual([]);
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
