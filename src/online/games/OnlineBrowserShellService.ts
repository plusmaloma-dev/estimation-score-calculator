import type { EstimationBid } from '../../domain/bid.js';
import type { PersistedScoreSheet, ScoreOverrideAuditRecord } from '../../persistence/types.js';
import { houseRulesV1ScoringProfile } from '../../scoring/houseRulesV1Profile.js';
import { FEDERATION_2026, HOUSE_RULES_V1, resolveScoringRuleSetId, type ScoringRuleSetId } from '../../scoring/ruleSets.js';
import type { PlayerRoundScore, RiskType, ScoringProfile } from '../../scoring/types.js';
import { EstimationMvpService, type MvpGameInput, type MvpGameResult, type MvpRoundInput } from '../../services/EstimationMvpService.js';
import { LeaderboardService } from '../../services/LeaderboardService.js';
import type {
  UiCreateScoreSheetInput,
  UiCreateScoreSheetResult,
  UiOpenSessionResult,
  UiOverrideRoundScoresInput,
  UiOverrideRoundScoresResult,
  UiRoundEntryInput,
  UiRoundHistoryEntry,
  UiSaveRoundResult,
} from '../../ui/BrowserUiShellService.js';
import type { UiGameLifecycleResult } from '../../ui/LifecycleBrowserUiShellService.js';
import type { AppSessionHistoryResult } from '../../app/AppContext.js';
import type { AuthSessionState } from '../auth/types.js';
import { OnlineGameService, type OnlineGameDatabase } from './OnlineGameService.js';

export interface OnlineShellDatabase extends OnlineGameDatabase {
  from(table: string): any;
}

interface GameHistoryRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'draft' | 'finalized';
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly game_players?: readonly { readonly seat_number: number; readonly player_name_snapshot: string }[];
  readonly rounds?: readonly { readonly count: number }[];
}

interface SnapshotGameRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'draft' | 'finalized';
  readonly rule_set: ScoringRuleSetId;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly finalized_at: string | null;
  readonly finalized_by: string | null;
}

interface SnapshotPlayerRow {
  readonly player_id: string;
  readonly seat_number: number;
  readonly player_name_snapshot: string;
}

interface SnapshotBidRow {
  readonly player_id: string;
  readonly bid_type: EstimationBid['bidType'];
  readonly tricks: number;
  readonly trump_suit: EstimationBid['trumpSuit'] | null;
  readonly with_target_player_id: string | null;
}

interface SnapshotActualRow {
  readonly player_id: string;
  readonly actual_tricks: number;
}

interface SnapshotScoreRow {
  readonly player_id: string;
  readonly bid_tricks: number;
  readonly actual_tricks: number;
  readonly delta: number;
  readonly did_match_bid: boolean;
  readonly role: PlayerRoundScore['role'];
  readonly risk_type: RiskType;
  readonly is_risk_taker: boolean;
  readonly risk_modifier: number;
  readonly is_high_contract: boolean;
  readonly is_only_winner: boolean;
  readonly is_only_loser: boolean;
  readonly status: PlayerRoundScore['status'];
  readonly calculated_score: number;
  readonly applied_score: number;
  readonly notes: readonly string[];
}

interface SnapshotRoundRow {
  readonly id: string;
  readonly round_number: number;
  readonly round_type: 'over' | 'under';
  readonly bid_owner_player_id: string;
  readonly risk_player_id: string | null;
  readonly trump_suit: NonNullable<EstimationBid['trumpSuit']>;
  readonly is_all_loser_round: boolean;
  readonly consecutive_all_loser_count_before_round: number;
  readonly carried_all_loser_multiplier: number;
  readonly carry_consumed: boolean;
  readonly multiple_with_multiplier: 1 | 2;
  readonly bids: readonly SnapshotBidRow[];
  readonly actuals: readonly SnapshotActualRow[];
  readonly scores: readonly SnapshotScoreRow[];
}

interface SnapshotOverrideRow {
  readonly id: string;
  readonly round_number: number;
  readonly player_id: string;
  readonly calculated_score: number;
  readonly previous_applied_score: number;
  readonly new_applied_score: number;
  readonly reason: string;
  readonly changed_at: string;
  readonly changed_by: string;
}

interface GameSnapshot {
  readonly game: SnapshotGameRow;
  readonly players: readonly SnapshotPlayerRow[];
  readonly rounds: readonly SnapshotRoundRow[];
  readonly overrides?: readonly SnapshotOverrideRow[];
}

const federationProfile: ScoringProfile = {
  id: 'federation-2026',
  name: 'Federation 2026',
  type: 'standard',
  ruleSet: FEDERATION_2026,
  highContractThreshold: 8,
};

export class OnlineBrowserShellService {
  private readonly gameService: OnlineGameService;
  private readonly mvpService = new EstimationMvpService();
  private readonly leaderboardService = new LeaderboardService();
  private readonly versions = new Map<string, number>();

  constructor(
    private readonly client: OnlineShellDatabase,
    private readonly session: AuthSessionState,
  ) {
    this.gameService = new OnlineGameService(client, session);
  }

  async getSessionHistory(): Promise<AppSessionHistoryResult> {
    const { data, error } = await this.client
      .from('games')
      .select('id, name, status, version, created_at, updated_at, game_players(seat_number, player_name_snapshot), rounds(count)')
      .eq('workspace_id', this.session.membership.workspaceId)
      .order('updated_at', { ascending: false }) as {
        data: readonly GameHistoryRow[] | null;
        error: { readonly message: string } | null;
      };
    if (error !== null) throw new Error(error.message);

    return {
      sessions: (data ?? []).map((row) => {
        this.versions.set(row.id, row.version);
        const players = [...(row.game_players ?? [])]
          .sort((left, right) => left.seat_number - right.seat_number)
          .map((player) => player.player_name_snapshot);
        return {
          id: row.id,
          name: row.name,
          status: row.status,
          players,
          roundCount: row.rounds?.[0]?.count ?? 0,
          createdAtIso: row.created_at,
          createdAtLabel: this.formatCreatedAtLabel(row.created_at),
          updatedAtIso: row.updated_at,
          updatedAtLabel: this.formatDateLabel(row.updated_at),
        };
      }),
    };
  }

  async createScoreSheet(input: UiCreateScoreSheetInput): Promise<UiCreateScoreSheetResult> {
    const ruleSet = resolveScoringRuleSetId(input.ruleSet);
    const result = await this.gameService.createGame({
      name: input.name,
      ruleSet,
      players: input.players,
    });
    if (!result.valid || result.value === undefined) return { valid: false, errors: result.errors };

    const nowIso = input.nowIso ?? new Date().toISOString();
    const scoreSheet = this.emptyScoreSheet(result.value.gameId, input, ruleSet, nowIso);
    this.versions.set(scoreSheet.id, 1);
    return { valid: true, errors: [], scoreSheet };
  }

  async openSession(scoreSheetId: string): Promise<UiOpenSessionResult> {
    const { data, error } = await this.client.rpc('get_game_snapshot', {
      p_game_id: scoreSheetId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
    });
    if (error !== null) return { valid: false, errors: [error.message] };
    const snapshot = this.readSnapshot(data);
    if (snapshot === undefined) return { valid: false, errors: ['Game snapshot was not returned.'] };
    this.versions.set(scoreSheetId, snapshot.game.version);
    return this.mapSnapshot(snapshot);
  }

  async saveRound(scoreSheetId: string, input: UiRoundEntryInput): Promise<UiSaveRoundResult> {
    const calculated = this.mvpService.calculateRound(input);
    if (!calculated.valid || calculated.scoreResult === undefined) {
      return { valid: false, errors: calculated.errors };
    }
    const version = await this.requireVersion(scoreSheetId);
    if (version === undefined) return { valid: false, errors: ['Game version could not be resolved.'] };

    const saved = await this.gameService.saveRound(scoreSheetId, {
      roundNumber: input.roundNumber,
      roundInput: input,
      roundResult: calculated,
      expectedVersion: version,
    });
    if (!saved.valid || saved.value === undefined) return { valid: false, errors: saved.errors };
    this.versions.set(scoreSheetId, saved.value.version);
    const opened = await this.openSession(scoreSheetId);
    return opened.valid
      ? { valid: true, errors: [], scoreSheet: opened.scoreSheet, gameResult: opened.scoreSheet?.gameResult }
      : { valid: false, errors: opened.errors };
  }

  async overrideRoundScores(
    scoreSheetId: string,
    input: UiOverrideRoundScoresInput,
  ): Promise<UiOverrideRoundScoresResult> {
    const version = await this.requireVersion(scoreSheetId);
    if (version === undefined) return { valid: false, errors: ['Game version could not be resolved.'] };
    const result = await this.gameService.overrideRoundScores(scoreSheetId, version, input);
    if (!result.valid || result.value === undefined) return { valid: false, errors: result.errors };
    this.versions.set(scoreSheetId, result.value.version);
    const opened = await this.openSession(scoreSheetId);
    return opened.valid
      ? { valid: true, errors: [], scoreSheet: opened.scoreSheet, gameResult: opened.scoreSheet?.gameResult }
      : { valid: false, errors: opened.errors };
  }

  async finalizeGame(scoreSheetId: string, actorId: string): Promise<UiGameLifecycleResult> {
    if (actorId !== this.session.user.id) return { valid: false, errors: ['Authenticated actor mismatch.'] };
    const version = await this.requireVersion(scoreSheetId);
    if (version === undefined) return { valid: false, errors: ['Game version could not be resolved.'] };
    const result = await this.gameService.finalizeGame(scoreSheetId, version);
    if (!result.valid || result.value === undefined) return { valid: false, errors: result.errors };
    this.versions.set(scoreSheetId, result.value.version ?? version + 1);
    const opened = await this.openSession(scoreSheetId);
    return opened.valid ? { valid: true, errors: [], scoreSheet: opened.scoreSheet } : { valid: false, errors: opened.errors };
  }

  async reopenGame(scoreSheetId: string, actorId: string): Promise<UiGameLifecycleResult> {
    if (actorId !== this.session.user.id) return { valid: false, errors: ['Authenticated actor mismatch.'] };
    const version = await this.requireVersion(scoreSheetId);
    if (version === undefined) return { valid: false, errors: ['Game version could not be resolved.'] };
    const result = await this.gameService.reopenGame(scoreSheetId, version);
    if (!result.valid || result.value === undefined) return { valid: false, errors: result.errors };
    this.versions.set(scoreSheetId, result.value.version ?? version + 1);
    const opened = await this.openSession(scoreSheetId);
    return opened.valid ? { valid: true, errors: [], scoreSheet: opened.scoreSheet } : { valid: false, errors: opened.errors };
  }

  private async requireVersion(gameId: string): Promise<number | undefined> {
    const cached = this.versions.get(gameId);
    if (cached !== undefined) return cached;
    const opened = await this.openSession(gameId);
    return opened.valid ? this.versions.get(gameId) : undefined;
  }

  private emptyScoreSheet(
    id: string,
    input: UiCreateScoreSheetInput,
    ruleSet: ScoringRuleSetId,
    nowIso: string,
  ): PersistedScoreSheet {
    const playerOrder = input.players.map((player) => player.id);
    return {
      id,
      name: input.name.trim(),
      status: 'draft',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      playerOrder,
      playerNamesById: Object.fromEntries(input.players.map((player) => [player.id, player.name.trim()])),
      roundCount: 0,
      gameInput: { playerOrder, rounds: [], ruleSet },
    };
  }

  private mapSnapshot(snapshot: GameSnapshot): UiOpenSessionResult {
    const players = [...snapshot.players].sort((left, right) => left.seat_number - right.seat_number);
    const playerOrder = players.map((player) => player.player_id);
    const playerNamesById = Object.fromEntries(players.map((player) => [player.player_id, player.player_name_snapshot]));
    const ruleSet = snapshot.game.rule_set;
    const profile = ruleSet === FEDERATION_2026 ? federationProfile : houseRulesV1ScoringProfile;
    const orderedRounds = [...snapshot.rounds].sort((left, right) => left.round_number - right.round_number);
    const gameInput: MvpGameInput = {
      playerOrder,
      ruleSet,
      rounds: orderedRounds.map((round): MvpRoundInput => ({
        roundNumber: round.round_number,
        bids: round.bids.map((bid): EstimationBid => ({
          playerId: bid.player_id,
          bidType: bid.bid_type,
          tricks: bid.tricks,
          ...(bid.trump_suit === null ? {} : { trumpSuit: bid.trump_suit }),
          ...(bid.with_target_player_id === null ? {} : { withTargetPlayerId: bid.with_target_player_id }),
        })),
        actualResults: round.actuals.map((actual) => ({
          playerId: actual.player_id,
          actualTricks: actual.actual_tricks,
        })),
        profile,
        ruleSet,
        bidOwnerPlayerId: round.bid_owner_player_id,
        ...(round.risk_player_id === null ? {} : { riskPlayerId: round.risk_player_id }),
        multipleWithMultiplier: round.multiple_with_multiplier,
      })),
    };
    const calculatedGame = this.mvpService.calculateGame(gameInput);
    const roundHistory = orderedRounds.map((round): UiRoundHistoryEntry => ({
      roundNumber: round.round_number,
      roundType: round.round_type,
      valid: true,
      errors: [],
      bids: gameInput.rounds.find((input) => input.roundNumber === round.round_number)?.bids ?? [],
      actualResults: gameInput.rounds.find((input) => input.roundNumber === round.round_number)?.actualResults ?? [],
      playerScores: round.scores.map((score) => this.mapPlayerScore(score, score.applied_score)),
      riskTypes: [...new Set(round.scores.map((score) => score.risk_type).filter((riskType) => riskType !== 'none'))],
      ...(round.is_all_loser_round || round.carried_all_loser_multiplier > 1
        ? { nextRoundMultiplier: round.carried_all_loser_multiplier }
        : {}),
    }));
    const leaderboard = this.leaderboardService.aggregate(
      roundHistory.map((round) => ({ roundNumber: round.roundNumber, playerScores: round.playerScores })),
      { playerOrder },
    );
    const scoreOverrides: readonly ScoreOverrideAuditRecord[] = (snapshot.overrides ?? []).map((override) => ({
      id: override.id,
      roundNumber: override.round_number,
      playerId: override.player_id,
      calculatedScore: override.calculated_score,
      previousAppliedScore: override.previous_applied_score,
      newAppliedScore: override.new_applied_score,
      reason: override.reason,
      changedAtIso: override.changed_at,
      actorId: override.changed_by,
    }));
    const scoreSheet: PersistedScoreSheet = {
      id: snapshot.game.id,
      name: snapshot.game.name,
      status: snapshot.game.status,
      createdAtIso: snapshot.game.created_at,
      updatedAtIso: snapshot.game.updated_at,
      playerOrder,
      playerNamesById,
      roundCount: orderedRounds.length,
      gameInput,
      gameResult: calculatedGame,
      scoreOverrides,
      ...(snapshot.game.finalized_at === null ? {} : { finalizedAtIso: snapshot.game.finalized_at }),
      ...(snapshot.game.finalized_by === null ? {} : { finalizedBy: snapshot.game.finalized_by }),
    };
    return { valid: true, errors: [], scoreSheet, leaderboard, roundHistory };
  }

  private mapPlayerScore(score: SnapshotScoreRow, appliedScore: number): PlayerRoundScore {
    return {
      playerId: score.player_id,
      bidTricks: score.bid_tricks,
      actualTricks: score.actual_tricks,
      delta: score.delta,
      didMatchBid: score.did_match_bid,
      role: score.role,
      riskType: score.risk_type,
      isRiskTaker: score.is_risk_taker,
      riskModifier: score.risk_modifier,
      isHighContract: score.is_high_contract,
      isOnlyWinner: score.is_only_winner,
      isOnlyLoser: score.is_only_loser,
      status: score.status,
      score: appliedScore,
      notes: score.notes,
    };
  }

  private readSnapshot(data: unknown): GameSnapshot | undefined {
    const candidate = Array.isArray(data) ? data[0] : data;
    if (typeof candidate !== 'object' || candidate === null) return undefined;
    const value = candidate as Partial<GameSnapshot>;
    return value.game !== undefined && Array.isArray(value.players) && Array.isArray(value.rounds)
      ? value as GameSnapshot
      : undefined;
  }

  private formatCreatedAtLabel(iso: string): string {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
    return `Created ${formatted.replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM')}`;
  }

  private formatDateLabel(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
  }
}
