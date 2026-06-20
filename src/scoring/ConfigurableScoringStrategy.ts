import type { PlayerScoreResult, ScoreContext, ScoringStrategy } from './types.js';

export class ConfigurableScoringStrategy implements ScoringStrategy {
  calculatePlayerScore(context: ScoreContext): PlayerScoreResult {
    const notes: string[] = [];
    const { playerBid, actualResult, evaluation, profile } = context;

    if (playerBid.bidType === 'dash') {
      if (context.roundType === 'under' && profile.underDashSuccessBonus !== undefined && profile.underDashFailurePenalty !== undefined) {
        let score = evaluation.didMatchBid
          ? profile.underDashSuccessBonus
          : -evaluation.delta - profile.underDashFailurePenalty;

        notes.push(`Dash Under ${evaluation.didMatchBid ? 'successful' : 'failed'}.`);
        notes.push(`Dash delta: ${evaluation.delta}.`);

        score = this.applyRisk(score, context, notes);
        score = this.applyOnlyWinnerLoser(score, context, notes);
        score = this.applyRoundMultiplier(score, context, notes);

        return this.result(context, score, evaluation.didMatchBid ? 'success' : 'failed', notes);
      }

      return this.calculateDashScore(context);
    }

    if (playerBid.bidType === 'dash-call') {
      return this.calculateDashCallScore(context);
    }

    if (evaluation.isHighContract && evaluation.riskType === 'high-contract') {
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
    } else {
      score = -evaluation.delta * failurePenaltyPerDelta;
      notes.push('Normal bid failed: actual tricks did not match estimated tricks.');
      notes.push(`Difference from bid: ${evaluation.delta}.`);

      if (followsOwnerScoring) {
        score -= ownerLossPenalty;
        notes.push(`${evaluation.role === 'with-player' ? 'With player' : 'Bid owner'} loss penalty applied: ${ownerLossPenalty}.`);
      }
    }

    score = this.applyRisk(score, context, notes);
    score = this.applyOnlyWinnerLoser(score, context, notes);
    score = this.applyRoundMultiplier(score, context, notes);

    return this.result(context, score, evaluation.didMatchBid ? 'success' : 'failed', notes);
  }

  private calculateHighContractScore(context: ScoreContext): PlayerScoreResult | undefined {
    const { playerBid, evaluation, profile } = context;
    const highContractThreshold = profile.highContractThreshold ?? Number.POSITIVE_INFINITY;
    const notes: string[] = [];

    if (evaluation.didMatchBid) {
      if (profile.highContractWinBase === undefined || profile.highContractWinStep === undefined) {
        return undefined;
      }

      let score = profile.highContractWinBase + (playerBid.tricks - highContractThreshold) * profile.highContractWinStep;
      notes.push('High contract successful: fixed high-contract winner formula applied.');
      score = this.applyRisk(score, context, notes);
      score = this.applyOnlyWinnerLoser(score, context, notes);
      // x2 deliberately not applied to high contracts.
      return this.result(context, score, 'success', notes);
    }

    if (profile.highContractLossBasePenalty === undefined || profile.highContractLossStepPenalty === undefined) {
      return undefined;
    }

    const basePenalty = profile.highContractLossBasePenalty + (playerBid.tricks - highContractThreshold) * profile.highContractLossStepPenalty;
    let score = -evaluation.delta + basePenalty;
    notes.push('High contract failed: high-contract base penalty plus delta applied.');
    notes.push(`Difference from bid: ${evaluation.delta}.`);
    score = this.applyRisk(score, context, notes);
    score = this.applyOnlyWinnerLoser(score, context, notes);
    // x2 deliberately not applied to high contracts.
    return this.result(context, score, 'failed', notes);
  }

  private calculateDashScore(context: ScoreContext): PlayerScoreResult {
    const { evaluation, profile } = context;
    const notes: string[] = [];
    let score: number;

    if (evaluation.didMatchBid) {
      score = profile.dashSuccessScore ?? 10;
      notes.push('Dash successful.');
    } else {
      score = -evaluation.delta;
      notes.push('Dash failed.');
      notes.push(`Dash delta: ${evaluation.delta}.`);
    }

    score = this.applyRisk(score, context, notes);
    score = this.applyOnlyWinnerLoser(score, context, notes);
    score = this.applyRoundMultiplier(score, context, notes);

    return this.result(context, score, evaluation.didMatchBid ? 'success' : 'failed', notes);
  }

  private calculateDashCallScore(context: ScoreContext): PlayerScoreResult {
    const { evaluation, profile } = context;
    const notes: string[] = [];
    let score: number;

    if (evaluation.didMatchBid) {
      score = profile.dashCallSuccessScore ?? 35;
      notes.push('Dash Call successful.');
    } else {
      score = -evaluation.delta - 25;
      notes.push('Dash Call failed.');
      notes.push(`Dash Call delta: ${evaluation.delta}.`);
    }

    score = this.applyRisk(score, context, notes);
    score = this.applyOnlyWinnerLoser(score, context, notes);
    score = this.applyRoundMultiplier(score, context, notes);

    return this.result(context, score, evaluation.didMatchBid ? 'success' : 'failed', notes);
  }

  private applyRisk(score: number, context: ScoreContext, notes: string[]): number {
    const { evaluation } = context;
    if (!evaluation.isRiskTaker || evaluation.riskModifier === 0) {
      return score;
    }

    const modifier = evaluation.didMatchBid ? evaluation.riskModifier : -evaluation.riskModifier;
    notes.push(`Risk ${evaluation.didMatchBid ? 'bonus' : 'penalty'} applied: ${modifier}.`);
    return score + modifier;
  }

  private applyOnlyWinnerLoser(score: number, context: ScoreContext, notes: string[]): number {
    const { evaluation, profile } = context;

    if (evaluation.didMatchBid && evaluation.isOnlyWinner) {
      const onlyWinnerBonus = profile.onlyWinnerBonus ?? 10;
      notes.push(`Only winner bonus applied: ${onlyWinnerBonus}.`);
      return score + onlyWinnerBonus;
    }

    if (!evaluation.didMatchBid && evaluation.isOnlyLoser) {
      const onlyLoserPenalty = profile.onlyLoserPenalty ?? 10;
      notes.push(`Only loser penalty applied: ${onlyLoserPenalty}.`);
      return score - onlyLoserPenalty;
    }

    return score;
  }

  private applyRoundMultiplier(score: number, context: ScoreContext, notes: string[]): number {
    const multiplier = context.roundMultiplier ?? 1;
    if (multiplier === 1 || context.evaluation.isHighContract) {
      return score;
    }

    notes.push(`Round multiplier applied: x${multiplier}.`);
    return score * multiplier;
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
      isRiskTaker: evaluation.isRiskTaker,
      riskModifier: evaluation.riskModifier,
      isHighContract: evaluation.isHighContract,
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
