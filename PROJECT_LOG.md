# Project Log

## 2026-07-20 - Run 83

Completed:

- Closed the selector integration gap for House Rules V1.
- Added and exported `houseRulesV1ScoringProfile` as the canonical configuration for the `HOUSE_RULES_V1` pre-round selection.
- The canonical profile includes:
  - Standard House Rules bonuses and penalties.
  - Dash and Dash Call values.
  - High-contract threshold of 8.
  - Successful high-call formula `call × call`.
  - Failed high-call penalty starting at 30 for call 8 and increasing by 10 per higher call.
- Updated high-contract regression tests to consume the exported canonical profile instead of rebuilding a test-only profile.
- Verified the TDD red/green cycle through GitHub Actions:
  - CI run 379 failed while the canonical profile export was intentionally missing.
  - CI run 381 passed after adding and exporting the profile.
- Updated `RULE_BASELINE_V1.md` and `BACKLOG.md` with the canonical selection profile and latest validation evidence.
- Pull request #7 remains open and ready for review.

Current item in progress:

- US-216C - wire `ScoringStrategyFactory` into `EstimationMvpService`/browser flow and persist the selected rule set at game level.

Blockers:

- None for the completed House Rules V1 high-call rule and canonical profile.
- The remaining dual-rule-set wiring is a separate backlog item.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 92% complete.
- Federation rule support: 35% complete.
- Overall project: 96% complete.

## 2026-07-20 - Run 82

Completed:

- Confirmed and implemented the updated House Rules V1 calculation for calls of 8 tricks or higher.
- Successful high call formula:
  - `score = call × call`.
  - Call 8 = 64, call 9 = 81, call 10 = 100.
- Failed high call formula:
  - `base penalty = 30 + ((call - 8) × 10)`.
  - `score = -delta - base penalty`.
  - Call 8 starts at -30, call 9 at -40, call 10 at -50, before subtracting delta.
- Confirmed and implemented that WITH uses the same formula independently from the contract owner.
- Preserved existing modifiers:
  - Risk and Double Risk.
  - Only Winner and Only Loser.
  - High contracts remain excluded from the x2/x4 all-loser multiplier.
- Added backward-compatible optional scoring-profile settings so older configurable profiles can retain their legacy linear formula.
- Fixed high-contract routing so WITH bids of 8 or higher use the high-contract calculation instead of the normal owner/WITH calculation.
- Added regression tests for:
  - Successful calls 8/9/10.
  - Failed calls 8/9/10.
  - Independent WITH scoring.
  - Risk, Only Winner, and Only Loser modifiers.
  - High-contract multiplier exclusion.
  - Federation 2026 Super 8 isolation.
- Added design and implementation-plan documents under `docs/superpowers/`.
- GitHub Actions CI run 378 completed successfully after the documentation/log commits.
- Updated `PROJECT_RULES.md`, `RULE_BASELINE_V1.md`, and `BACKLOG.md`.

Current item in progress:

- US-216C - wire `ScoringStrategyFactory` into the round/game services and persist the selected rule set.

Blockers:

- No scoring-rule blocker for the completed House Rules V1 high-call update.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 92% complete.
- Federation rule support: 35% complete.
- Overall project: 96% complete.

## 2026-06-24 - Run 81

Completed:

- Started US-216C - Rule Engine Abstraction / Dual Rule Sets after user approved dual mode support.
- Added explicit rule-set ids and configuration scaffolding:
  - `HOUSE_RULES_V1`.
  - `FEDERATION_2026`.
  - `GameRuleConfiguration`.
  - `ScoringProfile.ruleSet`.
- Added `federation2026ScoringTable` constants from uploaded EgyEstimation scoring tables.
- Added `Federation2026ScoringStrategy` scaffold while preserving House Rules v1 as the default behavior.
- Added `ScoringStrategyFactory` to resolve House vs Federation scoring strategies.
- Exported rule-set APIs from the public package index.
- Added focused tests for rule-set ids, table constants, and strategy factory behavior.
- Updated `BACKLOG.md` with US-216B/US-216C/US-216D/US-216E sequencing.
- Kept Egyptian Estimation scoring separate from Planning Poker.

Current item in progress:

- US-216C - wire strategy factory into round/game services without breaking existing profiles.

Blockers:

- End-to-end Federation 2026 score examples still need to be added from the uploaded tables.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 91% complete.
- Federation rule support: 35% complete.
- Overall project: 96% complete.

## 2026-06-24 - Run 80

Completed:

- Replaced the federation-rule blocker with an accepted user-confirmed house-rule baseline path after the user confirmed no official federation file is available.
- Added `RULE_BASELINE_V1.md` to formalize the current scoring baseline and authority order:
  - User-confirmed rule decisions.
  - `PROJECT_RULES.md`.
  - Acceptance/regression tests.
  - README and implementation docs.
- Updated `BACKLOG.md`:
  - Marked US-216A - Rule Baseline Formalization as Done.
  - Moved future federation comparison to optional backlog.
  - Set US-220 - React/Vite Frontend Prototype as the next Ready item.
- Kept Egyptian Estimation scoring/rules separate from Planning Poker.
- Made no scoring logic changes.

Current item in progress:

- US-220 - React/Vite Frontend Prototype.

Blockers:

- None for starting the frontend prototype.
- Future federation comparison remains optional and blocked unless official/user-provided rule evidence becomes available.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 90% complete.
- Overall project: 95% complete.
