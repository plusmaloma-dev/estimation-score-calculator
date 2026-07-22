# Estimation Score Calculator Backlog

## Project Rules

- Keep Egyptian Estimation scoring/rules separate from Planning Poker estimation.
- Prefer implementation-ready slices with tests.
- Update `PROJECT_LOG.md` after each automation run.
- Use `PROJECT_RULES.md` and `RULE_BASELINE_V1.md` as the accepted user-confirmed House Rules V1 baseline.
- Use uploaded EgyEstimation federation rule PDFs as the source for Federation 2026 mode.
- Keep House Rules V1 and Federation 2026 scoring isolated and selectable before a game begins.
- Lock the selected rule set for the entire game.
- Use `POST_MVP_ROADMAP.md` for post-MVP sequencing and acceptance notes.
- Use validation docs before moving implemented post-MVP items from pending validation to Done.

## Progress Tracker

| Area | Status | Progress |
| --- | --- | ---: |
| Repository bootstrap | Done | 100% |
| Test execution setup | Done | 100% |
| Card and bid domain model | Done | 100% |
| Bid validation | Done | 100% |
| Highest bid resolution | Done | 100% |
| Trick validation | Done | 100% |
| Score calculation | Done | 100% |
| Leaderboard | Done | 100% |
| UI/API integration | Done | 100% |
| Acceptance dataset | Done | 100% |
| Persistence | Done | 100% |
| Statistics | Done | 100% |
| Import/export | Done | 100% |
| CI validation | Done | 100% |
| Post-MVP roadmap | Done | 100% |
| Browser/mobile UI planning | Done | 100% |
| Local-storage adapter | Done | 100% |
| Browser UI shell | Done | 100% |
| Persistent database adapter | Done | 100% |
| Rich score-sheet export | Done | 100% |
| Player analytics dashboard service | Done | 100% |
| Player analytics exports | Done | 100% |
| Score-sheet CSV export | Done | 100% |
| Game summary and leaderboard compatibility fixes | Done | 100% |
| Rule baseline formalization | Done | 100% |
| House Rules V1 high-call update | Done | 100% |
| Game-level rule-set selection and persistence | Done | 100% |
| Federation 2026 acceptance coverage | Done | 100% |
| Federation All-Pass Round | Done | 100% |
| Federation backend rule-set support | Done | 100% |
| React/Vite frontend prototype | In Progress | 90% |

MVP progress: **100%**

Post-MVP progress: **99%**

## Completed MVP Items

### US-206 — UI/API Integration Shell
Status: **Done**

### US-207 — Acceptance Dataset
Status: **Done**

### US-208 — Persistence
Status: **Done**

### US-209 — Statistics
Status: **Done**

### US-210 — Import/export
Status: **Done**

### US-211 — CI Validation
Status: **Done**

- `npm run ci` validates typecheck, all top-level compiled tests, and build.

## Completed Post-MVP Items

### US-212 — Post-MVP Roadmap
Status: **Done**

### US-213 — Browser/Mobile UI Planning
Status: **Done**

### US-213A — Local-Storage Score-Sheet Repository Adapter
Status: **Done**

### US-213B — Browser UI Shell
Status: **Done**

### US-214 — Persistent Database Adapter
Status: **Done**

### US-215 — Rich Score-Sheet Export
Status: **Done**

### US-216A — Rule Baseline Formalization
Status: **Done**

- Added `RULE_BASELINE_V1.md`.
- Preserved House Rules V1 as an independent selectable baseline.

### US-216B — Federation Comparison
Status: **Done**

- Compared uploaded federation rules against House Rules V1.
- Confirmed matching areas: suit hierarchy, total estimates cannot equal 13, WITH structure, and Risk concept.
- Identified differences: Dash scoring, Super 8/9/10, all-pass behavior, all-loser handling, and exact federation scoring tables.

### US-216C1 — House Rules V1 High-Call Formula
Status: **Done**

- Successful calls of 8 or higher score `call × call`.
- Failed calls score `-delta - (30 + ((call - 8) × 10))`.
- WITH uses the same formula independently.
- Risk/Double Risk and Only Winner/Only Loser remain additive modifiers.
- The x2/x4 all-loser multiplier remains excluded from high-contract scores.
- Federation 2026 Super 8/9/10 scoring remains unchanged.
- Added exported `houseRulesV1ScoringProfile` for the `HOUSE_RULES_V1` selector.

### US-216C — Rule Engine Abstraction / Dual Rule Sets
Status: **Done**

- Added explicit rule-set ids: `HOUSE_RULES_V1` and `FEDERATION_2026`.
- Added default resolver for legacy games.
- Added `ScoringProfile.ruleSet` and `MvpGameInput.ruleSet`.
- Added Federation 2026 scoring strategy and strategy factory.
- Wired `EstimationMvpService` to automatically select House or Federation scoring.
- Locked one selected rule set across every round in a game.
- Added resolved `ruleSet` to `MvpGameResult` and game summaries.
- Added browser score-sheet rule-set selection and locked round-save behavior.
- Persisted the selection through in-memory, local-storage, and document-store score-sheet boundaries via `gameInput`.
- Preserved the selection through JSON backup export/import.
- Normalized legacy backups without a selection to `HOUSE_RULES_V1`.
- Rejected unsupported backup rule-set values.
- Added regression tests for House/Federation strategy selection, browser persistence, backup compatibility, and summary projection.

### US-216D — Federation 2026 Acceptance Coverage
Status: **Done**

- Added end-to-end game-level examples for normal players, auction owners, WITH, Risk, and Double Risk.
- Added Federation Dash Under/Over success and failure examples.
- Added Super 8 / Super 9 / Super 10 success and failure examples.
- Confirmed Only Winner and Only Loser modifiers.
- Separated Federation all-loser behavior from House Rules V1:
  - Federation players retain their calculated negative scores.
  - Federation does not create a next-round x2/x4 multiplier.
  - House Rules V1 keeps zero scores and its next-round multiplier.
- Prevented the Federation Dash Under table score from receiving a second automatic Risk adjustment.
- Corrected the test command so all top-level compiled test files execute.
- Repaired five previously dormant rule-selection fixtures to use valid Estimation bids.
- GitHub Actions CI run 406 passed with all 128 tests executing.

### US-216E — Federation All-Pass Round
Status: **Done**

- Added a dedicated Federation auction-resolution service before trick scoring.
- Four unique pass actions cancel the current deal and return `redeal-required`.
- The same dealer deals the replacement hand.
- The same round number is reused.
- No tricks, scores, bonuses, penalties, Risk, Double Risk, or multipliers are created.
- No completed round or score-sheet persistence mutation is created.
- Auctions with fewer than four passes or any bid return `continue-auction`.
- House Rules V1 score sheets reject the Federation-only auction flow.

### US-217A — Player Performance Analytics
Status: **Done**

### US-217B — Player Analytics Markdown Export
Status: **Done**

### US-217C — Player Analytics CSV Export
Status: **Done**

### US-218 — Score-Sheet CSV Export
Status: **Done**

### US-219 — Game Summary and Leaderboard Compatibility Fixes
Status: **Done**

## In Progress

### US-220 — React/Vite Frontend Prototype
Status: **In Progress — 90%**

Completed frontend slices:

- React/Vite application foundation, bilingual setup flow, local-storage sessions, and responsive score sheet.
- Current-round estimate confirmation, actual-trick entry, score calculation, and persistence.
- Explicit bid-winner/trump ownership with multiple WITH players.
- Follow or Hold decisions after the bid winner raises.
- Hold annotations and normal scoring.
- Owner-anchored Risk assignment that skips Hold players.
- Multiple-WITH x2 applied last to every player's calculated score.
- Frozen round serialization for owner, trump, W/H, Risk, and multiplier.
- Audited completed-round score editing, restore-original, downstream totals/rankings, persistence, and backup preservation.
- Responsive fit-to-screen table and visible score-override markers.
- Final validation for this delivery passed in GitHub Actions CI run 554.

Remaining prototype slices:

- Add Federation auction pass/bid and redeal controls to the React score sheet.
- Wire the History and New Round header actions to final navigation behavior.
- Expose analytics and export actions in the React interface.
- Complete final accessibility review and release preparation.
