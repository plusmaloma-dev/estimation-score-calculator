import type { EstimationBid, UiOpenSessionResult } from '../../index.js';

export type RankTitle = 'KING' | 'Sub-King' | 'Sub-Kooz' | 'Kooz';

export interface ScoreSheetPlayerView {
  readonly id: string;
  readonly name: string;
  readonly rankTitle: RankTitle;
  readonly totalScore: number;
}

export interface ScoreSheetCellView {
  readonly playerId: string;
  readonly estimateLabel: string;
  readonly actualTricks: number;
  readonly roundScore: number;
  readonly cumulativeScore: number;
  readonly successful: boolean;
}

export interface ScoreSheetRoundView {
  readonly roundNumber: number;
  readonly overUnder: string;
  readonly cells: readonly ScoreSheetCellView[];
}

export interface ScoreSheetViewModel {
  readonly id: string;
  readonly name: string;
  readonly players: readonly ScoreSheetPlayerView[];
  readonly rounds: readonly ScoreSheetRoundView[];
}

const rankTitles: readonly RankTitle[] = ['KING', 'Sub-King', 'Sub-Kooz', 'Kooz'];

const suitSymbols = {
  'no-trump': 'NT',
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
} as const;

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function annotationForBid(bid: EstimationBid, riskModifier: number, riskType: string): string {
  const annotations: string[] = [];
  if (riskType === 'round-risk') annotations.push(riskModifier > 10 ? `${Math.max(2, riskModifier / 10)}R` : 'R');
  if (bid.bidType === 'with' || riskType === 'with') annotations.push('W');
  return annotations.length > 0 ? ` ${annotations.join(' ')}` : '';
}

function estimateLabel(
  bid: EstimationBid,
  isBidOwner: boolean,
  riskModifier: number,
  riskType: string,
): string {
  const trump = isBidOwner && bid.trumpSuit !== undefined ? suitSymbols[bid.trumpSuit] : '';
  return `${bid.tricks}${trump}${annotationForBid(bid, riskModifier, riskType)}`;
}

export function buildScoreSheetViewModel(opened: UiOpenSessionResult): ScoreSheetViewModel {
  if (!opened.valid || opened.scoreSheet === undefined) {
    throw new Error(opened.errors.join('; ') || 'Score sheet could not be opened.');
  }

  const playerOrder = opened.scoreSheet.playerOrder;
  const names = opened.scoreSheet.playerNamesById ?? {};
  const leaderboard = opened.leaderboard ?? [];
  const totalsByPlayer = new Map(leaderboard.map((entry) => [entry.playerId, entry.totalScore]));
  const rankedIds = [...playerOrder].sort((left, right) => {
    const scoreDifference = (totalsByPlayer.get(right) ?? 0) - (totalsByPlayer.get(left) ?? 0);
    return scoreDifference !== 0 ? scoreDifference : playerOrder.indexOf(left) - playerOrder.indexOf(right);
  });
  const rankByPlayer = new Map(rankedIds.map((playerId, index) => [playerId, rankTitles[index] ?? 'Kooz']));

  const cumulative = new Map(playerOrder.map((playerId) => [playerId, 0]));
  const rounds = (opened.roundHistory ?? []).map((round) => {
    const bidByPlayer = new Map(round.bids.map((bid) => [bid.playerId, bid]));
    const actualByPlayer = new Map(round.actualResults.map((actual) => [actual.playerId, actual.actualTricks]));
    const scoreByPlayer = new Map(round.playerScores.map((score) => [score.playerId, score]));
    const bidOwnerPlayerId = round.playerScores.find((score) => score.role === 'bid-owner')?.playerId;
    const estimateTotal = round.bids.reduce((sum, bid) => sum + bid.tricks, 0);

    const cells = playerOrder.map((playerId): ScoreSheetCellView => {
      const bid = bidByPlayer.get(playerId);
      const score = scoreByPlayer.get(playerId);
      if (bid === undefined || score === undefined) {
        throw new Error(`Round ${round.roundNumber} is missing player data for ${playerId}.`);
      }
      const cumulativeScore = (cumulative.get(playerId) ?? 0) + score.score;
      cumulative.set(playerId, cumulativeScore);
      return {
        playerId,
        estimateLabel: estimateLabel(bid, playerId === bidOwnerPlayerId, score.riskModifier, score.riskType),
        actualTricks: actualByPlayer.get(playerId) ?? score.actualTricks,
        roundScore: score.score,
        cumulativeScore,
        successful: score.didMatchBid,
      };
    });

    return {
      roundNumber: round.roundNumber,
      overUnder: formatSigned(estimateTotal - 13),
      cells,
    };
  });

  return {
    id: opened.scoreSheet.id,
    name: opened.scoreSheet.name,
    players: playerOrder.map((playerId) => ({
      id: playerId,
      name: names[playerId] ?? playerId,
      rankTitle: rankByPlayer.get(playerId) ?? 'Kooz',
      totalScore: totalsByPlayer.get(playerId) ?? 0,
    })),
    rounds,
  };
}
