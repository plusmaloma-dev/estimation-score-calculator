# Estimation Score Calculator Backlog

## Project Rules

- Keep Egyptian Estimation scoring/rules separate from Planning Poker estimation.
- Prefer implementation-ready slices with tests.
- Update `PROJECT_LOG.md` after each automation run.
- Use `PROJECT_RULES.md` as the working rule reference for finalized local Egyptian Estimation rules.
- Use `POST_MVP_ROADMAP.md` for post-MVP sequencing and acceptance notes.
- Use validation docs before moving implemented post-MVP items from pending validation to Done.
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
| Local-storage adapter | Done | 100% |
| Browser UI shell | Done | 100% |
| Persistent database adapter | Done | 100% |
| Rich score-sheet export | Done | 100% |
| Player analytics dashboard service | Done | 100% |
| Player analytics exports | Done | 100% |
| Score-sheet CSV export | Done | 100% |
| Game summary and leaderboard compatibility fixes | Done | 100% |
| Federation-rule review | In progress | 65% |

MVP progress: **100%**

Post-MVP progress: **85%**

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

- Local `npm run ci` confirmed: typecheck passed, tests passed, build passed.

## Completed Post-MVP Items

### US-212 — Post-MVP Roadmap
Status: **Done**

- Documented post-MVP sequencing and acceptance notes in `POST_MVP_ROADMAP.md`.

### US-213 — Browser/Mobile UI Planning
Status: **Done**

- Documented screen map, validation messages, and UI-to-engine DTO mapping in `UI_PLANNING.md`.

### US-213A — Local-Storage Score-Sheet Repository Adapter
Status: **Done**

- Implemented browser local-storage adapter satisfying `ScoreSheetRepository`.
- Used one namespaced local-storage key.
- Added tests using an injected storage-like object instead of browser globals.
- Handles missing or corrupt stored data safely.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-213B — Browser UI Shell
Status: **Done**

- Implemented framework-neutral TypeScript browser UI shell service.
- Supports four-player score-sheet setup, validation preview, valid round save, leaderboard/history boundaries, analytics views, and JSON backup export.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-214 — Persistent Database Adapter
Status: **Done**

- Implemented document-store adapter boundary without coupling scoring services to database libraries.
- Added tests for save, update, list, get, delete, id allocation, and stored shape validation.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-215 — Rich Score-Sheet Export
Status: **Done**

- Added deterministic Markdown score-sheet export and CSV score-sheet export coverage.
- Preserves invalid-round validation notes without recalculating scores.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-217A — Player Performance Analytics
Status: **Done**

- Added dashboard-ready analytics DTOs and `PlayerAnalyticsService`.
- Includes exact bid rate, failure rate, Dash/Dash Call success rates, risk metrics, WITH/high-contract counts, all-loser counts, rankings, and consistency metadata.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-217B — Player Analytics Markdown Export
Status: **Done**

- Added deterministic Markdown analytics formatter and README usage notes.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-217C — Player Analytics CSV Export
Status: **Done**

- Added spreadsheet-friendly CSV analytics export with optional summary rows and safe CSV escaping.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-218 — Score-Sheet CSV Export
Status: **Done**

- Added spreadsheet-friendly game score-sheet CSV export.
- Includes player/round rows, cumulative scores, final standings, metadata rows, and invalid-round notes.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-219 — Game Summary and Leaderboard Compatibility Fixes
Status: **Done**

- Added `roundNumber` to `MvpRoundResult` for browser game summary consumers.
- Preserved leaderboard aggregation round identity after invalid rounds are filtered out.
- Added regression coverage.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

## In Progress / Blocked

### US-216 — Federation-Rule Review
Status: **In progress**

- Review each local rule in `PROJECT_RULES.md` against official or user-confirmed Egyptian Estimation references. **In progress**
- Record source, decision, and impact for each confirmed rule. **Expanded in `FEDERATION_RULE_REVIEW.md`**
- Create follow-up implementation stories only for confirmed scoring changes. **Started: US-216A/US-216B/US-216C**
- No scoring code changes should be made from unclear or mixed sources.

### US-216A — Federation Source Capture
Status: **In progress**

- Locate accessible official rules/regulations documents. **In progress**
- Record document title, URL or file name, publication/update date if available, and relevant sections.
- Add citations or source notes for every reviewed scoring rule.
- Do not change scoring code.

### US-216B — Confirm Rule Differences
Status: **Blocked until source capture improves**

- Compare official rules against the local project baseline.
- List exact differences and recommended project decision for each difference.
- Separate official tournament rules from user-preferred house rules.

### US-216C — Rule Change Implementation
Status: **Blocked until differences are confirmed**

- Implement only confirmed scoring changes.
- Add acceptance dataset rows for every changed rule.
- Update `PROJECT_RULES.md`, tests, README, and backlog with final decisions.
