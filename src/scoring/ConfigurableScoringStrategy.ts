import type { PlayerScoreResult, ScoreContext, ScoringStrategy } from './types.js';

export class ConfigurableScoringStrategy implements ScoringStrategy {
  calculatePlayerScore(context: ScoreContext): PlayerScoreResult {
    const notes: string[] = [];
    const { playerBid, actualResult, evaluation, profile } = context;

    if (playerBid.bidType === 'dash') {
      return this.calculateSpecialBidScore(context, profile.dashSuccessScore, profile.dashFailureScore, 'Dash');
    }

    if (playerBid.bidType === 'dash-call') {
      return this.calculateSpecialBidScore(context, profile.dashCallSuccessScore, profile.dashCallFailureScore, 'Dash Call');
    }

    const highContractThreshold = profile.highContractThreshold ?? Number.POSITIVE_INFINITY;
    const highContractMultiplier = playerBid.tricks >= highContractThreshold
      ? (profile.highContractMultiplier ?? 1)
      : 1;

    if (evaluation.didMatchBid) {
      const base = profile.normalBidSuccessBase ?? 0;
      const perTrick = profile.normalBidSuccessPerTrick;

      if (perTrick === undefined) {
        return this.pendingResult(context, 'Normal bid success formula is not confirmed yet.');
      }

      const score = (base + playerBid.tricks * perTrick) * highContractMultiplier;
      notes.push('Normal bid successful: actual tricks matched estimated tricks.');
      if (highContractMultiplier !== 1) {
        notes.push(`High contract multiplier applied: ${highContractMultiplier}.`);
      }

      return {
        playerId: playerBid.playerId,
        bidTricks: playerBid.tricks,
        actualTricks: actualResult.actualTricks,
        delta: evaluation.delta,
        didMatchBid: evaluation.didMatchBid,
        role: evaluation.role,
        riskType: evaluation.riskType,
        status: 'success',
        score,
        notes,
      };
    }

    const penaltyPerDifference = profile.normalBidFailurePenaltyPerTrickDifference;
    if (penaltyPerDifference === undefined) {
      return this.pendingResult(context, 'Normal bid failure formula is not confirmed yet.');
    }

    const score = -evaluation.delta * penaltyPerDifference * highContractMultiplier;
    notes.push('Normal bid failed: actual tricks did not match estimated tricks.');
    notes.push(`Difference from bid: ${evaluation.delta}.`);
    if (highContractMultiplier !== 1) {
      notes.push(`High contract multiplier applied: ${highContractMultiplier}.`);
    }

    return {
      playerId: playerBid.playerId,
      bidTricks: playerBid.tricks,
      actualTricks: actualResult.actualTricks,
      delta: evaluation.delta,
      didMatchBid: evaluation.didMatchBid,
      role: evaluation.role,
      riskType: evaluation.riskType,
      status: 'failed',
      score,
      notes,
    };
  }

  private calculateSpecialBidScore(
    context: ScoreContext,
    successScore: number | undefined,
    failureScore: number | undefined,
    label: string,
  ): PlayerScoreResult {
    const { playerBid, actualResult, evaluation } = context;

    if (successScore === undefined || failureScore === undefined) {
      return this.pendingResult(context, `${label} scoring is not confirmed yet.`);
    }

    return {
      playerId: playerBid.playerId,
      bidTricks: playerBid.tricks,
      actualTricks: actualResult.actualTricks,
      delta: evaluation.delta,
      didMatchBid: evaluation.didMatchBid,
      role: evaluation.role,
      riskType: evaluation.riskType,
      status: evaluation.didMatchBid ? 'success' : 'failed',
      score: evaluation.didMatchBid ? successScore : failureScore,
      notes: [`${label} ${evaluation.didMatchBid ? 'successful' : 'failed'}.`],
    };
  }

  private pendingResult(context: ScoreContext, note: string): PlayerScoreResult {
    const { playerBid, actualResult, evaluation } = context;

    return {
      playerId: playerBid.playerId,
      bidTricks: playerBid.tricks,
      actualTricks: actualResult.actualTricks,
      delta: evaluation.delta,
      didMatchBid: evaluation.didMatchBid,
      role: evaluation.role,
      riskType: evaluation.riskType,
      status: 'pending-rule',
      score: 0,
      notes: [note],
    };
  }
}
