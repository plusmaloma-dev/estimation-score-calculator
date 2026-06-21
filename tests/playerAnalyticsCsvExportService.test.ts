import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerAnalyticsCsvExportService, type PlayerAnalyticsSummary } from '../src/index.js';

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
      playerId: 'B,"Quoted"',
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

test('player analytics CSV export renders deterministic rows', () => {
  const csv = new PlayerAnalyticsCsvExportService().exportSummary(summary);

  assert.match(csv, /^rank,playerId,totalScore,roundsPlayed,averageScore/);
  assert.match(csv, /1,A,120,3,40,80,10,1,0,0,0,0,0,1,1,0,0,0,1,0/);
  assert.match(csv, /2,"B,""Quoted""",35,3,11\.666667,35,0,0\.333333,0\.666667,1,1,1,0,0,0,0,0,1,0,1/);
});

test('player analytics CSV export can include summary metadata rows', () => {
  const csv = new PlayerAnalyticsCsvExportService().exportSummary(summary, {
    includeSummaryRows: true,
  });

  assert.match(csv, /^metric,value\ntotalRounds,3\nvalidRounds,2\ninvalidRounds,1\nleaderPlayerId,A\nmostConsistentPlayerId,A\n\nrank,playerId/);
});
