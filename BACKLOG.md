# Estimation Score Calculator Backlog

## Project Rules

- Keep Egyptian Estimation scoring/rules separate from Planning Poker estimation.
- Prefer implementation-ready slices with tests.
- Update `PROJECT_LOG.md` after each automation run.
- Use `PROJECT_RULES.md` as the working rule reference for finalized local Egyptian Estimation rules.

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

Overall progress: **100%**

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

## Next Backlog Candidates

These are post-MVP candidates, not blockers for the score-calculation MVP:

- Browser/mobile UI.
- Persistent database adapter.
- Rich score-sheet table export.
- Official federation-rule review against `PROJECT_RULES.md`.
