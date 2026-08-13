import type { PersistedScoreSheet, ScoreOverrideAuditRecord } from '../persistence/types.js';
import type { MvpGameResult, MvpRoundResult } from './EstimationMvpService.js';
import { EstimationMvpService } from './EstimationMvpService.js';
import { LeaderboardService } from './LeaderboardService.js';

export interface ScoreOverrideInput {
  readonly roundNumber: number;
  readonly overridesByPlayerId: Readonly<Record<string, number>>;
  readonly reason: string;
  readonly changedAtIso?: string;
  readonly actorId?: string;
}

export interface ScoreOverrideResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly scoreOverrides?: readonly ScoreOverrideAuditRecord[];
  readonly appliedGameResult?: MvpGameResult;
}

export class ScoreOverrideService {
  constructor(
    private readonly mvpService = new EstimationMvpService(),
    private readonly leaderboardService = new LeaderboardService(),
  ) {}

  apply(scoreSheet: PersistedScoreSheet, input: ScoreOverrideInput): ScoreOverrideResult {
    const errors: string[] = [];
    const reason = input.reason.trim();
    if (reason.length === 0) errors.push('Override reason is required.');
    if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) {
      errors.push('Override round number must be a positive integer.');
    }

    const calculatedGameResult = scoreSheet.gameResult ?? this.mvpService.calculateGame(scoreSheet.gameInput);
    const calculatedRound = calculatedGameResult.rounds.find((round) => round.roundNumber === input.roundNumber);
    if (calculatedRound?.scoreResult === undefined) {
      errors.push(`Completed round not found: ${input.roundNumber}.`);
    }

    const requestedEntries = Object.entries(input.overridesByPlayerId);
    if (requestedEntries.length === 0) errors.push('At least one applied score must change.');

    for (const [playerId, value] of requestedEntries) {
      if (!Number.isInteger(value)) errors.push(`Override score for player ${playerId} must be an integer.`);
      if (calculatedRound?.scoreResult?.playerScores.some((score) => score.playerId === playerId) !== true) {
        errors.push(`Player ${playerId} was not scored in round ${input.roundNumber}.`);
      }
    }

    if (errors.length > 0) return { valid: false, errors };

    const existingOverrides = scoreSheet.scoreOverrides ?? [];
    const currentAppliedGameResult = this.buildAppliedGameResult(
      calculatedGameResult,
      existingOverrides,
      scoreSheet.playerOrder,
    );
    const currentRound = currentAppliedGameResult.rounds.find((round) => round.roundNumber === input.roundNumber);
    const changedEntries = requestedEntries.filter(([playerId, value]) => {
      const currentAppliedScore = currentRound?.scoreResult?.playerScores.find((score) => score.playerId === playerId)?.score;
      return currentAppliedScore !== value;
    });

    if (changedEntries.length === 0) {
      return { valid: false, errors: ['At least one applied score must change.'] };
    }

    const changedAtIso = input.changedAtIso ?? new Date().toISOString();
    const actorId = input.actorId?.trim() || 'local-user';
    const appendedRecords = changedEntries.map(([playerId, newAppliedScore], index): ScoreOverrideAuditRecord => {
      const calculatedScore = calculatedRound?.scoreResult?.playerScores.find((score) => score.playerId === playerId)?.score ?? 0;
      const previousAppliedScore = currentRound?.scoreResult?.playerScores.find((score) => score.playerId === playerId)?.score ?? calculatedScore;
      return {
        id: `score-override-${existingOverrides.length + index + 1}`,
        roundNumber: input.roundNumber,
        playerId,
        calculatedScore,
        previousAppliedScore,
        newAppliedScore,
        reason,
        changedAtIso,
        actorId,
      };
    });
    const scoreOverrides = [...existingOverrides, ...appendedRecords];
    const appliedGameResult = this.buildAppliedGameResult(
      calculatedGameResult,
      scoreOverrides,
      scoreSheet.playerOrder,
    );

    return { valid: true, errors: [], scoreOverrides, appliedGameResult };
  }

  buildAppliedGameResult(
    calculatedGameResult: MvpGameResult,
    scoreOverrides: readonly ScoreOverrideAuditRecord[],
    playerOrder?: readonly string[],
  ): MvpGameResult {
    const latestScoreByRoundPlayer = new Map<string, number>();
    for (const override of scoreOverrides) {
      latestScoreByRoundPlayer.set(this.key(override.roundNumber, override.playerId), override.newAppliedScore);
    }

    const rounds = calculatedGameResult.rounds.map((round): MvpRoundResult => {
      if (round.scoreResult === undefined) return round;
      return {
        ...round,
        scoreResult: {
          ...round.scoreResult,
          playerScores: round.scoreResult.playerScores.map((playerScore) => {
            const appliedScore = latestScoreByRoundPlayer.get(this.key(round.roundNumber, playerScore.playerId));
            if (appliedScore === undefined) return playerScore;
            return {
              ...playerScore,
              score: appliedScore,
              notes: [...playerScore.notes, 'Applied score override.'],
            };
          }),
        },
      };
    });

    const leaderboard = this.leaderboardService.aggregate(
      rounds
        .filter((round): round is MvpRoundResult & { readonly scoreResult: NonNullable<MvpRoundResult['scoreResult']> } =>
          round.scoreResult !== undefined && round.scoreResult.valid)
        .map((round) => ({
          roundNumber: round.roundNumber,
          playerScores: round.scoreResult.playerScores,
        })),
      { playerOrder },
    );

    return {
      ...calculatedGameResult,
      rounds,
      leaderboard,
    };
  }

  private key(roundNumber: number, playerId: string): string {
    return `${roundNumber}:${playerId}`;
  }
}
