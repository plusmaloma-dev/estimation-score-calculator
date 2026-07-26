import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayRoundResultPanel } from './GameplayRoundResultPanel.js';

function snapshot(): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'scored',
    version: 56,
    viewerSeat: 0,
    bidOwnerSeat: 0,
    players: [
      {
        seat: 0,
        playerId: 'p0',
        cardCount: 0,
        bid: { playerId: 'p0', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        actualTricks: 4,
      },
      {
        seat: 1,
        playerId: 'p1',
        cardCount: 0,
        bid: { playerId: 'p1', bidType: 'normal', tricks: 3 },
        actualTricks: 2,
      },
      {
        seat: 2,
        playerId: 'p2',
        cardCount: 0,
        bid: { playerId: 'p2', bidType: 'dash', tricks: 0 },
        actualTricks: 0,
      },
      {
        seat: 3,
        playerId: 'p3',
        cardCount: 0,
        bid: { playerId: 'p3', bidType: 'normal', tricks: 4 },
        actualTricks: 7,
      },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
    scoreResult: {
      roundNumber: 1,
      valid: true,
      errors: [],
      bidValidation: {
        valid: true,
        errors: [],
        totalEstimatedTricks: 11,
        roundType: 'under',
      },
      scoreResult: {
        valid: true,
        errors: [],
        ownerOutcome: 'owner-won',
        playerScores: [
          {
            playerId: 'p0', bidTricks: 4, actualTricks: 4, delta: 0,
            didMatchBid: true, role: 'bid-owner', riskType: 'none',
            isRiskTaker: false, riskModifier: 0, isHighContract: false,
            isOnlyWinner: false, isOnlyLoser: false, status: 'success',
            score: 14, notes: [],
          },
          {
            playerId: 'p1', bidTricks: 3, actualTricks: 2, delta: 1,
            didMatchBid: false, role: 'other-player', riskType: 'none',
            isRiskTaker: false, riskModifier: 0, isHighContract: false,
            isOnlyWinner: false, isOnlyLoser: false, status: 'failed',
            score: -1, notes: [],
          },
          {
            playerId: 'p2', bidTricks: 0, actualTricks: 0, delta: 0,
            didMatchBid: true, role: 'other-player', riskType: 'dash',
            isRiskTaker: false, riskModifier: 0, isHighContract: false,
            isOnlyWinner: false, isOnlyLoser: false, status: 'success',
            score: 25, notes: ['Dash completed.'],
          },
          {
            playerId: 'p3', bidTricks: 4, actualTricks: 7, delta: 3,
            didMatchBid: false, role: 'risk-taker', riskType: 'round-risk',
            isRiskTaker: true, riskModifier: -10, isHighContract: false,
            isOnlyWinner: false, isOnlyLoser: false, status: 'failed',
            score: -13, notes: ['Risk failed.'],
          },
        ],
      },
    },
  };
}

describe('GameplayRoundResultPanel', () => {
  it('shows authoritative estimate, actual, score, outcome, and risk classification by seat', () => {
    render(
      <I18nProvider>
        <GameplayRoundResultPanel snapshot={snapshot()} />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Round 1 results' })).toBeVisible();
    expect(screen.getByText('Under · 11 estimated tricks')).toBeVisible();
    const table = screen.getByRole('table', { name: 'Round scores' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(5);
    expect(rows[1]).toHaveTextContent('Seat 1');
    expect(rows[1]).toHaveTextContent('4');
    expect(rows[1]).toHaveTextContent('+14');
    expect(rows[1]).toHaveTextContent('Success');
    expect(rows[3]).toHaveTextContent('Dash');
    expect(rows[3]).toHaveTextContent('+25');
    expect(rows[4]).toHaveTextContent('Round risk');
    expect(rows[4]).toHaveTextContent('-13');
  });

  it('renders nothing unless a valid authoritative scored result is present', () => {
    const { container } = render(
      <I18nProvider>
        <GameplayRoundResultPanel snapshot={{ ...snapshot(), scoreResult: undefined }} />
      </I18nProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
