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
    riskSeat: 3,
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
      carriedAllLoserMultiplier: 2,
      carryConsumed: true,
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
  it('shows responsive labelled result cards with viewer, caller, score, outcome, and Risk', () => {
    render(
      <I18nProvider>
        <GameplayRoundResultPanel snapshot={snapshot()} />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Round 1 results' })).toBeVisible();
    expect(screen.getByText('Under · 11 estimated tricks')).toBeVisible();
    expect(screen.getByText('Score multiplier ×2')).toBeVisible();
    const list = screen.getByRole('list', { name: 'Round scores' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveTextContent('Seat 1');
    expect(cards[0]).toHaveTextContent('You');
    expect(cards[0]).toHaveTextContent('Caller');
    expect(cards[0]).toHaveTextContent('Estimate');
    expect(cards[0]).toHaveTextContent('Actual tricks');
    expect(cards[0]).toHaveTextContent('Made');
    expect(cards[0]).toHaveTextContent('+14');
    expect(cards[2]).toHaveTextContent('Dash');
    expect(cards[2]).toHaveTextContent('+25');
    expect(cards[3]).toHaveTextContent('Round risk');
    expect(cards[3]).toHaveTextContent('Lost');
    expect(cards[3]).toHaveTextContent('-13');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
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
