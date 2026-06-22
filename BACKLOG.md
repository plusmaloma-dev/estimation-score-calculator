# Estimation Score Calculator Backlog

## Project Rules

- Keep Egyptian Estimation scoring/rules separate from Planning Poker estimation.
- Prefer implementation-ready slices with tests.
- Update `PROJECT_LOG.md` after each automation run.
- Use `PROJECT_RULES.md` as the working rule reference for finalized local Egyptian Estimation rules.
- Use `POST_MVP_ROADMAP.md` for post-MVP sequencing and acceptance notes.
- Use `VALIDATION_CHECKLIST.md` before moving implemented post-MVP items from pending validation to Done.
- Use `VALIDATION_QUICKSTART.md` for the shortest copy/paste local validation and evidence-capture flow.
- Use `CI_VALIDATION_RUNBOOK.md` for the repeatable local CI evidence and closure flow.
- Use `VALIDATION_TROUBLESHOOTING.md` for safe validation-failure triage without changing scoring rules.
- Use `VALIDATION_CLOSURE_PLAN.md` as the final sequence for closing pending implemented post-MVP items after a green local CI run.
- Use `FEDERATION_SOURCE_REQUEST.md` when US-216A needs direct official/user-confirmed rule evidence before any scoring changes.

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
| Local-storage adapter | Implemented | 85% |
| Browser UI shell | Implemented | 85% |
| Persistent database adapter | Implemented | 85% |
| Rich score-sheet export | Implemented | 80% |
| Federation-rule review | In progress | 65% |
| Player analytics dashboard service | Implemented | 85% |
| Player analytics exports | Implemented | 85% |
| Score-sheet CSV export | Implemented | 90% |
| Post-MVP validation checklist | Done | 100% |
| Validation quickstart | Done | 100% |
| CI validation runbook | Done | 100% |
| Validation troubleshooting guide | Done | 100% |
| Validation closure plan | Done | 100% |
| Game summary compatibility fix | Implemented, pending validation | 85% |

MVP progress: **100%**

Post-MVP progress: **76%**

### US-206 — UI/API Integration Shell
Status: **Done**

- Add a thin README usage example for future UI/API callers. **Done**

### US-207 — Acceptance Dataset
Status: **Done**

- Under and Over scoring scenarios. **Done**
- Mixed scenarios covering bonus and risk combinations. **Done**
- Human-readable dataset documented in `ACCEPTANCE_DATASET.md`. **Done**
- Executable acceptance tests added in `tests/acceptanceDataset.test.ts`. **Done**

### US-208 — Persistence
Status: **Done**

- Define storage boundary for future saved games and score sheets. **Done**
- Keep persistence optional for MVP engine usage. **Done**
- Add `ScoreSheetRepository` interface and persisted score-sheet DTOs. **Done**
- Add in-memory repository adapter for MVP/testing without introducing database coupling. **Done**
- Add persistence boundary usage notes to README or dedicated docs. **Done**

### US-209 — Statistics
Status: **Done**

- Define statistics outputs after score-sheet persistence stabilizes. **Done**
- Suggested first slice: calculate per-player summary stats from persisted or calculated game results without introducing UI/database coupling. **Done**
- Add `StatisticsService` and statistics DTOs. **Done**
- Add executable tests for statistics summaries. **Done**
- Add README usage notes. **Done**
- Confirm `npm run ci` local validation. **Done**

### US-210 — Import/export
Status: **Done**

- Define import/export formats after persistence DTOs stabilize. **Done**
- Suggested first slice: JSON backup DTO with version metadata and validation path. **Done**
- Add `ScoreSheetBackupDocument` DTO and backup constants. **Done**
- Add `ScoreSheetBackupService` for exporting and validating backup documents. **Done**
- Add executable tests for valid export/import and invalid backup rejection. **Done**
- Add README usage notes. **Done**
- Confirm `npm run ci` local validation. **Done**

### US-211 — CI Validation
Status: **Done**

- Keep one local validation command that future contributors and CI can run. **Done**
- Keep GitHub Actions validation aligned to the package script. **Done**
- Confirm local `npm run ci`: typecheck passed, tests passed 57/57, build passed. **Done**

### US-212 — Post-MVP Roadmap
Status: **Done**

- Convert loose post-MVP candidates into implementation-ready backlog items. **Done**
- Document post-MVP sequencing and acceptance notes in `POST_MVP_ROADMAP.md`. **Done**

### US-213 — Browser/Mobile UI Planning
Status: **Done**

- Draft screen map for player setup, round entry, scoring result, leaderboard, statistics, and import/export. **Done**
- Define UI input DTO mapping to the existing engine DTOs. **Done**
- List validation messages that should be shown before score calculation. **Done**
- Recommend first storage direction for UI prototype. **Done**
- Document planning artifact in `UI_PLANNING.md`. **Done**

### US-213A — Local-Storage Score-Sheet Repository Adapter
Status: **Implemented, pending validation**

- Implement a browser local-storage adapter that satisfies `ScoreSheetRepository`. **Done**
- Use one namespaced local-storage key. **Done**
- Add tests using an injected storage-like object instead of browser globals. **Done**
- Handle missing or corrupt stored data safely. **Done**
- Confirm `npm run ci` local validation. **Pending**

### US-213B — Browser UI Shell
Status: **Implemented, pending validation**

- Choose a lightweight browser UI framework or vanilla TypeScript shell. **Done: framework-neutral TypeScript shell first.**
- Create a four-player score-sheet setup flow. **Done**
- Add one valid round-entry flow wired to `EstimationMvpService`. **Done**
- Show validation messages before saving invalid rounds. **Done**
- Show leaderboard and round history boundary. **Done**
- Export JSON backup through the existing backup service. **Done**
- Confirm `npm run ci` local validation. **Pending**

### US-214 — Persistent Database Adapter
Status: **Implemented, pending validation**

- Choose storage target after UI/API direction is known. **Done: document-store adapter boundary.**
- Implement a repository adapter that satisfies `ScoreSheetRepository`. **Done**
- Add tests proving save, update, list, get, and delete behavior matches the in-memory adapter contract. **Done**
- Keep database libraries outside the scoring engine through `ScoreSheetDocumentStore`. **Done**
- Confirm `npm run ci` local validation. **Pending**

### US-215 — Rich Score-Sheet Export
Status: **Implemented, pending validation**

- Define Markdown table layout for final standings and per-round player deltas/scores. **Done**
- Add a formatting service that consumes calculated game results without recalculating scores. **Done**
- Add tests for deterministic table structure and invalid-round validation sections. **Done**
- Export `ScoreSheetMarkdownExportService` from the public package index. **Done**
- Confirm `npm run ci` local validation. **Pending**

### US-216 — Federation-Rule Review
Status: **In progress**

- Review each local rule in `PROJECT_RULES.md` against official or user-confirmed Egyptian Estimation references. **In progress**
- Record source, decision, and impact for each confirmed rule. **Expanded in `FEDERATION_RULE_REVIEW.md`**
- Create follow-up implementation stories only for confirmed scoring changes. **Started: US-216A/US-216B/US-216C**
- Confirm `npm run ci` local validation if code changes are introduced. **Not required yet: docs-only slice**
- Clean up duplicate federation source-request PRs so source-capture work has one merged baseline. **Done: PR #3 merged and PR #2 closed as superseded.**

### US-216A — Federation Source Capture
Status: **In progress**

- Locate accessible official rules/regulations documents. **In progress: public searches still did not find a retrievable detailed official document.**
- Record document title, URL or file name, publication/update date if available, and relevant sections. **Expanded in source capture log and reviewed search terms.**
- Add citations or source notes for every reviewed scoring rule. **Started for broad-scope evidence and repeated negative search evidence.**
- Add a structured request checklist/message for collecting official or user-confirmed sources. **Done in `FEDERATION_SOURCE_REQUEST.md`; merged through PR #3.**
- Add Arabic source-request template and intake note for original-language evidence. **Done.**
- Do not change scoring code. **Done so far**

### US-216B — Confirm Rule Differences
Status: **Blocked until source capture improves**

- Compare official rules against the local project baseline.
- List exact differences and recommended project decision for each difference.
- Separate official tournament rules from user-preferred house rules.
- Create scoring implementation stories only for accepted differences.

### US-216C — Rule Change Implementation
Status: **Blocked until differences are confirmed**

- Implement only confirmed scoring changes.
- Add acceptance dataset rows for every changed rule.
- Update `PROJECT_RULES.md`, tests, README, and backlog with final decisions.

### US-217A — Player Performance Analytics
Status: **Implemented, pending validation**

- Add dashboard-ready analytics DTOs. **Done**
- Add `PlayerAnalyticsService`. **Done**
- Include exact bid rate, failure rate, Dash/Dash Call success rates, risk and double-risk success rates, WITH/high-contract counts, all-loser counts, ranking, and consistency metadata. **Done**
- Add tests using calculated game results without recalculating scores. **Done**
- Export analytics APIs from the public package index. **Done**
- Confirm `npm run ci` local validation. **Pending**

### US-217B — Player Analytics Markdown Export
Status: **Implemented, pending validation**

- Add `PlayerAnalyticsMarkdownExportService` for dashboard/report presentation. **Done**
- Add deterministic Markdown table tests. **Done**
- Export the Markdown analytics formatter from the public package index. **Done**
- Document usage in README. **Done**
- Confirm `npm run ci` local validation. **Pending**

### US-217C — Player Analytics CSV Export
Status: **Implemented, pending validation**

- Add `PlayerAnalyticsCsvExportService` for spreadsheet-friendly analytics export. **Done**
- Include optional summary metadata rows. **Done**
- Escape quoted/comma/newline cells safely for CSV consumers. **Done**
- Add deterministic CSV tests. **Done**
- Export the CSV analytics formatter from the public package index. **Done**
- Document usage in README. **Done**
- Confirm `npm run ci` local validation. **Pending**

### US-219 — Game Summary Compatibility Fix
Status: **Implemented, pending validation**

- Expose `roundNumber` on `MvpRoundResult` so browser game-summary view models can read the round label without recalculating or inspecting raw input. **Done**
- Return `roundNumber` from both valid and invalid `EstimationMvpService.calculateRound` paths. **Done**
- Keep this as a DTO/view compatibility fix only, with no Egyptian Estimation scoring-rule changes. **Done**
- Confirm `npm run ci` local validation. **Pending**
