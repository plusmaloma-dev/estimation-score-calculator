import type { PlayerScoreResult, ScoreContext, ScoringStrategy } from './types.js';

export class ConfigurableScoringStrategy implements ScoringStrategy {
  calculatePlayerScore(context: ScoreContext): PlayerScoreResult {
    const notes: string[] = [];
    const { playerBid, actualResult, evaluation, profile } = context;

    if (playerBid.bidType === 'dash') {
      if (context.roundType === 'under' && profile.underDashSuccessBonus !== undefined && profile.underDashFailurePenalty !== undefined) {
        return this.result(
          context,
          evaluation.didMatchBid ? profile.underDashSuccessBonus : -profile.underDashFailurePenalty,
          evaluation.didMatchBid ? 'success' : 'failed',
          [`Dash Under ${evaluation.didMatchBid ? 'successful' : 'failed'}.`],
        );
      }

      return this.calculateSpecialBidScore(context, profile.dashSuccessScore, profile.dashFailureScore, 'Dash');
    }

    if (playerBid.bidType === 'dash-call') {
      return this.calculateSpecialBidScore(context, profile.dashCallSuccessScore, profile.dashCallFailureScore, 'Dash Call');
    }

    const highContractThreshold = profile.highContractThreshold ?? Number.POSITIVE_INFINITY;
    const isHighContract = playerBid.tricks >= highContractThreshold;

    if (isHighContract && evaluation.riskType === 'high-contract') {
      const highContractScore = this.calculateHighContractScore(context);
      if (highContractScore !== undefined) {
        return highContractScore;
      }
    }

    const winnerBaseBonus = profile.winnerBaseBonus ?? profile.normalBidSuccessBase;
    if (winnerBaseBonus === undefined) {
      return this.pendingResult(context, 'Winner base bonus is not configured.');
    }

    const ownerWinBonus = profile.bidOwnerWinBonus ?? 0;
    const ownerLossPenalty = profile.bidOwnerLossPenalty ?? 10;
    const failurePenaltyPerDelta = profile.normalBidFailurePenaltyPerTrickDifference ?? 1;
    const followsOwnerScoring = evaluation.role === 'bid-owner' || evaluation.role === 'with-player';

    let score: number;
    if (evaluation.didMatchBid) {
      score = playerBid.tricks + winnerBaseBonus;
      notes.push('Normal bid successful: actual tricks matched estimated tricks.');

      if (followsOwnerScoring) {
        score += ownerWinBonus;
        notes.push(`${evaluation.role === 'with-player' ? 'With player' : 'Bid owner'} win bonus applied: ${ownerWinBonus}.`);
      }

      if (evaluation.isOnlyWinner) {
        const onlyWinnerBonus = profile.onlyWinnerBonus ?? 10;
        score += onlyWinnerBonus;
        notes.push(`Only winner bonus applied: ${onlyWinnerBonus}.`);
      }
    } else {
      score = -evaluation.delta * failurePenaltyPerDelta;
      notes.push('Normal bid failed: actual tricks did not match estimated tricks.');
      notes.push(`Difference from bid: ${evaluation.delta}.`);

      if (followsOwnerScoring) {
        score -= ownerLossPenalty;
        notes.push(`${evaluation.role === 'with-player' ? 'With player' : 'Bid owner'} loss penalty applied: ${ownerLossPenalty}.`);
      }

      if (evaluation.isOnlyLoser) {
        const onlyLoserPenalty = profile.onlyLoserPenalty ?? 10;
        score -= onlyLoserPenalty;
        notes.push(`Only loser penalty applied: ${onlyLoserPenalty}.`);
      }
    }

    return this.result(context, score, evaluation.didMatchBid ? 'success' : 'failed', notes);
  }

  private calculateHighContractScore(context: ScoreContext): PlayerScoreResult | undefined {
    const { playerBid, evaluation, profile } = context;
    const highContractThreshold = profile.highContractThreshold ?? Number.POSITIVE_INFINITY;

    if (evaluation.didMatchBid) {
      if (profile.highContractWinBase === undefined || profile.highContractWinStep === undefined) {
        return undefined;
      }

      const score = profile.highContractWinBase + (playerBid.tricks - highContractThreshold) * profile.highContractWinStep;
      return this.result(context, score, 'success', ['High contract successful: fixed high-contract winner formula applied.']);
    }

    if (profile.highContractLossBasePenalty === undefined || profile.highContractLossStepPenalty === undefined) {
      return undefined;
    }

    const basePenalty = profile.highContractLossBasePenalty + (playerBid.tricks - highContractThreshold) * profile.highContractLossStepPenalty;
    const score = -evaluation.delta + basePenalty;
    return this.result(context, score, 'failed', [
      'High contract failed: high-contract base penalty plus delta applied.',
      `Difference from bid: ${evaluation.delta}.`,
    ]);
  }

  private calculateSpecialBidScore(
    context: ScoreContext,
    successScore: number | undefined,
    failureScore: number | undefined,
    label: string,
  ): PlayerScoreResult {
    const { evaluation } = context;

    if (successScore === undefined || failureScore === undefined) {
      return this.pendingResult(context, `${label} scoring is not confirmed yet.`);
    }

    return this.result(
      context,
      evaluation.didMatchBid ? successScore : failureScore,
      evaluation.didMatchBid ? 'success' : 'failed',
      [`${label} ${evaluation.didMatchBid ? 'successful' : 'failed'}.`],
    );
  }

  private result(
    context: ScoreContext,
    score: number,
    status: PlayerScoreResult['status'],
    notes: readonly string[],
  ): PlayerScoreResult {
    const { playerBid, actualResult, evaluation } = context;

    return {
      playerId: playerBid.playerId,
      bidTricks: playerBid.tricks,
      actualTricks: actualResult.actualTricks,
      delta: evaluation.delta,
      didMatchBid: evaluation.didMatchBid,
      role: evaluation.role,
      riskType: evaluation.riskType,
      isOnlyWinner: evaluation.isOnlyWinner,
      isOnlyLoser: evaluation.isOnlyLoser,
      status,
      score,
      notes,
    };
  }

  private pendingResult(context: ScoreContext, note: string): PlayerScoreResult {
    return this.result(context, 0, 'pending-rule', [note]);
  }
}
