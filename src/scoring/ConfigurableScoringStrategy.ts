import type { PlayerScoreResult, ScoreContext, ScoringStrategy } from './types.js';

export class ConfigurableScoringStrategy implements ScoringStrategy {
  calculatePlayerScore(context: ScoreContext): PlayerScoreResult {
    const notes: string[] = [];
    const { playerBid, actualResult, profile } = context;

    if (playerBid.bidType === 'dash') {
      return this.calculateSpecialBidScore(context, profile.dashSuccessScore, profile.dashFailureScore, 'Dash');
    }

    if (playerBid.bidType === 'dash-call') {
      return this.calculateSpecialBidScore(context, profile.dashCallSuccessScore, profile.dashCallFailureScore, 'Dash Call');
    }

    const wasSuccessful = playerBid.tricks === actualResult.actualTricks;
    const highContractThreshold = profile.highContractThreshold ?? Number.POSITIVE_INFINITY;
    const highContractMultiplier = playerBid.tricks >= highContractThreshold
      ? (profile.highContractMultiplier ?? 1)
      : 1;

    if (wasSuccessful) {
      const base = profile.normalBidSuccessBase ?? 0;
      const perTrick = profile.normalBidSuccessPerTrick;

      if (perTrick === undefined) {
        return {
          playerId: playerBid.playerId,
          bidTricks: playerBid.tricks,
          actualTricks: actualResult.actualTricks,
          status: 'pending-rule',
          score: 0,
          notes: ['Normal bid success formula is not confirmed yet.'],
        };
      }

      const score = (base + playerBid.tricks * perTrick) * highContractMultiplier;
      notes.push('Normal bid successful.');
      if (highContractMultiplier !== 1) {
        notes.push(`High contract multiplier applied: ${highContractMultiplier}.`);
      }

      return {
        playerId: playerBid.playerId,
        bidTricks: playerBid.tricks,
        actualTricks: actualResult.actualTricks,
        status: 'success',
        score,
        notes,
      };
    }

    const penaltyPerDifference = profile.normalBidFailurePenaltyPerTrickDifference;
    if (penaltyPerDifference === undefined) {
      return {
        playerId: playerBid.playerId,
        bidTricks: playerBid.tricks,
        actualTricks: actualResult.actualTricks,
        status: 'pending-rule',
        score: 0,
        notes: ['Normal bid failure formula is not confirmed yet.'],
      };
    }

    const difference = Math.abs(playerBid.tricks - actualResult.actualTricks);
    const score = -difference * penaltyPerDifference * highContractMultiplier;
    notes.push('Normal bid failed.');
    notes.push(`Difference from bid: ${difference}.`);
    if (highContractMultiplier !== 1) {
      notes.push(`High contract multiplier applied: ${highContractMultiplier}.`);
    }

    return {
      playerId: playerBid.playerId,
      bidTricks: playerBid.tricks,
      actualTricks: actualResult.actualTricks,
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
    const { playerBid, actualResult } = context;
    const wasSuccessful = actualResult.actualTricks === 0;

    if (successScore === undefined || failureScore === undefined) {
      return {
        playerId: playerBid.playerId,
        bidTricks: playerBid.tricks,
        actualTricks: actualResult.actualTricks,
        status: 'pending-rule',
        score: 0,
        notes: [`${label} scoring is not confirmed yet.`],
      };
    }

    return {
      playerId: playerBid.playerId,
      bidTricks: playerBid.tricks,
      actualTricks: actualResult.actualTricks,
      status: wasSuccessful ? 'success' : 'failed',
      score: wasSuccessful ? successScore : failureScore,
      notes: [`${label} ${wasSuccessful ? 'successful' : 'failed'}.`],
    };
  }
}
