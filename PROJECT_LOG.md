# Project Log

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
- GitHub Actions CI run 374 completed successfully after the implementation commit.
- Updated `PROJECT_RULES.md`, `RULE_BASELINE_V1.md`, and `BACKLOG.md`.

Current item in progress:

- US-216C - wire `ScoringStrategyFactory` into the round/game services and persist the selected rule set.

Blockers:

- No scoring-rule blocker for the completed House Rules V1 high-call update.
- Final branch CI must remain green after the documentation/log commits before merge.

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

- Local `npm run ci` is needed for the new scaffolding commits.
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
