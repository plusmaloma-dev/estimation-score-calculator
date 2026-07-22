import { describe, expect, it } from 'vitest';
import {
  createCurrentRoundDraft,
  currentRoundReducer,
  resolveHighestEstimatePlayerId,
  validateAcceptedEstimates,
  validateActualTricks,
} from './currentRoundReducer.js';

describe('currentRoundReducer', () => {
  it('treats blank estimates as zero and exposes the first unique highest estimator', () => {
    let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);

    draft = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'A', value: 5 });

    expect(resolveHighestEstimatePlayerId(draft)).toBe('A');
    expect(draft.overUnder).toBe(-8);
    expect(validateAcceptedEstimates(draft)).toContain('Trump suit is required.');
  });

  it('accepts and freezes estimates before actual tricks can be entered', () => {
    let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
    draft = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'A', value: 5 });
    draft = currentRoundReducer(draft, { type: 'set-trump', suit: 'spades' });

    expect(validateAcceptedEstimates(draft)).toEqual([]);
    draft = currentRoundReducer(draft, { type: 'accept-estimates' });

    expect(draft.phase).toBe('actuals');
    expect(draft.estimates).toEqual({ A: 5, B: 0, C: 0, D: 0 });

    const frozen = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'A', value: 6 });
    expect(frozen.estimates.A).toBe(5);

    let completed = frozen;
    for (const [playerId, value] of Object.entries({ A: 5, B: 3, C: 3, D: 2 })) {
      completed = currentRoundReducer(completed, { type: 'set-actual', playerId, value });
    }
    expect(validateActualTricks(completed)).toEqual([]);
  });

  it('rejects any individual estimate of 13 and total estimates of 13', () => {
    let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
    draft = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'A', value: 13 });
    expect(validateAcceptedEstimates(draft)).toContain('Each estimate must be between 0 and 12.');

    draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
    for (const [playerId, value] of Object.entries({ A: 5, B: 3, C: 3, D: 2 })) {
      draft = currentRoundReducer(draft, { type: 'set-estimate', playerId, value });
    }
    expect(validateAcceptedEstimates(draft)).toContain('Total estimates cannot equal 13.');
  });

  it('requires one unique highest estimate before estimates can be accepted', () => {
    let draft = createCurrentRoundDraft(['A', 'B', 'C', 'D']);
    draft = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'A', value: 5 });
    draft = currentRoundReducer(draft, { type: 'set-estimate', playerId: 'B', value: 5 });

    expect(resolveHighestEstimatePlayerId(draft)).toBeUndefined();
    expect(validateAcceptedEstimates(draft)).toContain('A unique highest estimate is required.');
  });
});
