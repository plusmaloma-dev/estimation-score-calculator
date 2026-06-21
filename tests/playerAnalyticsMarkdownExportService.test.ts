import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerAnalyticsMarkdownExportService, type PlayerAnalyticsSummary } from '../src/index.js';

const summary: PlayerAnalyticsSummary = {
  totalRounds: 3,
  validRounds: 2,
  invalidRounds: 1,
  leaderPlayerId: 'A',
  mostConsistentPlayerId: 'A',
  players: [
    {
      rank: 1,
      playerId: 'A',
      totalScore: 120,
      roundsPlayed: 3,
      averageScore: 40,
      bestRoundScore: 80,
      worstRoundScore: 10,
      exactBidRate: 1,
      failureRate: 0,
      dashAttempts: 0,
      dashSuccessRate: 0,
      dashCallAttempts: 0,
      dashCallSuccessRate: 0,
      riskAttempts: 1,
      riskSuccessRate: 1,
      doubleRiskAttempts: 0,
      doubleRiskSuccessRate: 0,
      withRounds: 0,
      highContractRounds: 1,
      allLoserRounds: 0,
    },
    {
      rank: 2,
      playerId: 'B|Pipe',
      totalScore: 35,
      roundsPlayed: 3,
      averageScore: 11.6666666667,
      bestRoundScore: 35,
      worstRoundScore: 0,
      exactBidRate: 1 / 3,
      failureRate: 2 / 3,
      dashAttempts: 1,
      dashSuccessRate: 1,
      dashCallAttempts: 1,
      dashCallSuccessRate: 0,
      riskAttempts: 0,
      riskSuccessRate: 0,
      doubleRiskAttempts: 0,
      doubleRiskSuccessRate: 0,
      withRounds: 1,
      highContractRounds: 0,
      allLoserRounds: 1,
    },
  ],
};

test('player analytics markdown export renders summary and deterministic player rows', () => {
  const markdown = new PlayerAnalyticsMarkdownExportService().exportSummary(summary, {
    title: 'Friday Analytics',
    generatedAt: new Date('2026-06-21T17:00:00.000Z'),
  });

  assert.match(markdown, /^# Friday Analytics/);
  assert.match(markdown, /Generated at: 2026-06-21T17:00:00.000Z/);
  assert.match(markdown, /- Total rounds: 3/);
  assert.match(markdown, /- Invalid rounds: 1/);
  assert.match(markdown, /\| 1 \| A \| 120 \| 40 \| 100% \| 0% \| 80 \| 10 \| 0 \/ 0% \| 0 \/ 0% \| 1 \/ 100% \| 0 \/ 0% \| 0 \| 1 \| 0 \|/);
  assert.match(markdown, /\| 2 \| B\\\|Pipe \| 35 \| 11\.67 \| 33\.33% \| 66\.67% \| 35 \| 0 \| 1 \/ 100% \| 1 \/ 0% \| 0 \/ 0% \| 0 \/ 0% \| 1 \| 0 \| 1 \|/);
});

test('player analytics markdown export handles empty analytics safely', () => {
  const markdown = new PlayerAnalyticsMarkdownExportService().exportSummary({
    totalRounds: 0,
    validRounds: 0,
    invalidRounds: 0,
    players: [],
  });

  assert.match(markdown, /^# Player Analytics/);
  assert.match(markdown, /Leader: N\/A/);
  assert.match(markdown, /No valid player analytics are available\./);
});
