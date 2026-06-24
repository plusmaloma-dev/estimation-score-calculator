import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigurableScoringStrategy,
  FEDERATION_2026,
  Federation2026ScoringStrategy,
  HOUSE_RULES_V1,
  ScoringStrategyFactory,
  federation2026ScoringTable,
  isScoringRuleSetId,
  type ScoringProfile,
} from '../src/index.js';

test('federation scoring table captures official scoring constants', () => {
  assert.equal(federation2026ScoringTable.normalSuccessBase, 13);
  assert.equal(federation2026ScoringTable.ownerSuccessBase, 23);
  assert.equal(federation2026ScoringTable.dashUnderSuccess, 23);
  assert.equal(federation2026ScoringTable.dashOverSuccess, 13);
  assert.equal(federation2026ScoringTable.superBidSuccess[8], 41);
  assert.equal(federation2026ScoringTable.superBidSuccess[9], 42);
  assert.equal(federation2026ScoringTable.superBidSuccess[10], 43);
  assert.equal(federation2026ScoringTable.superBidFailureBasePenalty, 20);
  assert.equal(federation2026ScoringTable.onlyWinnerBonus, 10);
  assert.equal(federation2026ScoringTable.onlyLoserPenalty, 10);
});

test('rule-set guard accepts only supported scoring rule-set ids', () => {
  assert.equal(isScoringRuleSetId(HOUSE_RULES_V1), true);
  assert.equal(isScoringRuleSetId(FEDERATION_2026), true);
  assert.equal(isScoringRuleSetId('planning-poker'), false);
  assert.equal(isScoringRuleSetId(undefined), false);
});

test('scoring strategy factory keeps House Rules as the default behavior', () => {
  const strategy = new ScoringStrategyFactory().create(undefined);

  assert.equal(strategy instanceof ConfigurableScoringStrategy, true);
});

test('scoring strategy factory resolves Federation 2026 explicitly', () => {
  const profile: Pick<ScoringProfile, 'ruleSet'> = { ruleSet: FEDERATION_2026 };
  const strategy = new ScoringStrategyFactory().create(profile);

  assert.equal(strategy instanceof Federation2026ScoringStrategy, true);
});
