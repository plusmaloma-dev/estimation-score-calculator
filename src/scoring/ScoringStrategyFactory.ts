import type { ScoringProfile, ScoringStrategy } from './types.js';
import { ConfigurableScoringStrategy } from './ConfigurableScoringStrategy.js';
import { Federation2026ScoringStrategy } from './Federation2026ScoringStrategy.js';
import { FEDERATION_2026 } from './ruleSets.js';

export class ScoringStrategyFactory {
  create(profile: Pick<ScoringProfile, 'ruleSet'> | undefined): ScoringStrategy {
    if (profile?.ruleSet === FEDERATION_2026) {
      return new Federation2026ScoringStrategy();
    }

    return new ConfigurableScoringStrategy();
  }
}
