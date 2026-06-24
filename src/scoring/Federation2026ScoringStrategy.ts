import type { PlayerScoreResult, ScoreContext, ScoringStrategy } from './types.js';
import { FEDERATION_2026, federation2026ScoringTable } from './ruleSets.js';

export class Federation2026ScoringStrategy implements ScoringStrategy {
  calculatePlayerScore(context: ScoreContext): PlayerScoreResult {
    const { playerBid, actualResult, evaluation } = context;
    const table = federation2026ScoringTable;
    const notes: string[] = [`${FEDERATION_2026} scoring table applied.`];

    let score: number;

    if (playerBid.bidType === 'dash') {
      if (evaluation.didMatchBid) {
        score = context.roundType === 'under' ? table.dashUnderSuccess : table.dashOverSuccess;
        notes.push(`Federation Dash ${context.roundType} success score applied.`);
      } else {
        const basePenalty = context.roundType === 'under' ? table.dashUnderFailureBasePenalty : table.dashOverFailureBasePenalty;
        score = -evaluation.delta - basePenalty;
        notes.push(`Federation Dash ${context.roundType} failure score applied.`);
      }
    } else if (evaluation.isHighContract && playerBid.tricks >= 8 && playerBid.tricks <= 10) {
      if (evaluation.didMatchBid) {
        score = table.superBidSuccess[playerBid.tricks as 8 | 9 | 10];
        notes.push(`Federation Super ${playerBid.tricks} success score applied.`);
      } else {
        score = -evaluation.delta - table.superBidFailureBasePenalty;
        notes.push(`Federation Super ${playerBid.tricks} failure penalty applied.`);
      }
    } else if (evaluation.didMatchBid) {
      const followsOwnerScoring = evaluation.role === 'bid-owner' || evaluation.role === 'with-player';
      score = playerBid.tricks + (followsOwnerScoring ? table.ownerSuccessBase : table.normalSuccessBase);
      notes.push(`Federation ${followsOwnerScoring ? 'owner/WITH' : 'normal'} success score applied.`);
    } else {
      const followsOwnerScoring = evaluation.role === 'bid-owner' || evaluation.role === 'with-player';
      score = -evaluation.delta - (followsOwnerScoring ? table.ownerFailureBasePenalty : 0);
      notes.push(`Federation ${followsOwnerScoring ? 'owner/WITH' : 'normal'} failure score applied.`);
    }

    score = this.applyRisk(score, context, notes);
    score = this.applyOnlyWinnerLoser(score, context, notes);

    return {
      playerId: playerBid.playerId,
      bidTricks: playerBid.tricks,
      actualTricks: actualResult.actualTricks,
      delta: evaluation.delta,
      didMatchBid: evaluation.didMatchBid,
      role: evaluation.role,
      riskType: evaluation.riskType,
      isRiskTaker: evaluation.isRiskTaker,
      riskModifier: evaluation.riskModifier,
      isHighContract: evaluation.isHighContract,
      isOnlyWinner: evaluation.isOnlyWinner,
      isOnlyLoser: evaluation.isOnlyLoser,
      status: evaluation.didMatchBid ? 'success' : 'failed',
      score,
      notes,
    };
  }

  private applyRisk(score: number, context: ScoreContext, notes: string[]): number {
    const { evaluation } = context;
    if (!evaluation.isRiskTaker || evaluation.riskModifier === 0) {
      return score;
    }

    const modifier = evaluation.didMatchBid ? evaluation.riskModifier : -evaluation.riskModifier;
    notes.push(`Federation risk ${evaluation.didMatchBid ? 'bonus' : 'penalty'} applied: ${modifier}.`);
    return score + modifier;
  }

  private applyOnlyWinnerLoser(score: number, context: ScoreContext, notes: string[]): number {
    const { evaluation } = context;

    if (evaluation.didMatchBid && evaluation.isOnlyWinner) {
      notes.push(`Federation only-winner bonus applied: ${federation2026ScoringTable.onlyWinnerBonus}.`);
      return score + federation2026ScoringTable.onlyWinnerBonus;
    }

    if (!evaluation.didMatchBid && evaluation.isOnlyLoser) {
      notes.push(`Federation only-loser penalty applied: ${federation2026ScoringTable.onlyLoserPenalty}.`);
      return score - federation2026ScoringTable.onlyLoserPenalty;
    }

    return score;
  }
}
