import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BrowserUiShellService,
  InMemoryScoreSheetRepository,
  houseRulesV1ScoringProfile,
  type UiRoundEntryInput,
} from '../../index.js';
import { ScoreSheetScreen } from './ScoreSheetScreen.js';

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Bassem' },
  { id: 'C', name: 'Cairo' },
  { id: 'D', name: 'Dina' },
] as const;

const allLoserRound: UiRoundEntryInput = {
  roundNumber: 1,
  bidOwnerPlayerId: 'A',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
    { playerId: 'B', bidType: 'normal', tricks: 4 },
    { playerId: 'C', bidType: 'normal', tricks: 2 },
    { playerId: 'D', bidType: 'normal', tricks: 1 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 4 },
    { playerId: 'B', actualTricks: 3 },
    { playerId: 'C', actualTricks: 3 },
    { playerId: 'D', actualTricks: 3 },
  ],
};

const scoredRound: UiRoundEntryInput = {
  roundNumber: 2,
  bidOwnerPlayerId: 'A',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
    { playerId: 'B', bidType: 'normal', tricks: 4 },
    { playerId: 'C', bidType: 'normal', tricks: 2 },
    { playerId: 'D', bidType: 'normal', tricks: 0 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 5 },
    { playerId: 'B', actualTricks: 4 },
    { playerId: 'C', actualTricks: 2 },
    { playerId: 'D', actualTricks: 2 },
  ],
};

describe('ScoreSheetScreen all-loser carry integration', () => {
  it('keeps skipped totals unchanged and renders the next multiplied round in the existing table', () => {
    const shell = new BrowserUiShellService(new InMemoryScoreSheetRepository());
    const created = shell.createScoreSheet({ name: 'Carry Table', players });
    const id = created.scoreSheet?.id ?? '';

    shell.saveRound(id, allLoserRound);
    const afterSkipped = shell.openSession(id);
    expect(afterSkipped.leaderboard?.map((entry) => entry.totalScore)).toEqual([0, 0, 0, 0]);

    shell.saveRound(id, scoredRound);
    const opened = shell.openSession(id);
    const multipliedScores = opened.scoreSheet?.gameResult?.rounds[1]?.scoreResult?.playerScores.map((score) => score.score) ?? [];
    expect(opened.scoreSheet?.gameResult?.rounds[1]?.carriedAllLoserMultiplier).toBe(2);

    render(<ScoreSheetScreen scoreSheetId={id} shell={shell} />);
    const table = screen.getByRole('table', { name: 'Carry Table score sheet' });
    expect(within(table).getAllByText('Round', { selector: '.column-label-full' })).toHaveLength(4);
    for (const score of multipliedScores) {
      const label = score > 0 ? `+${score}` : String(score);
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});
