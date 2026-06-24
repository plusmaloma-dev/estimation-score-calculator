# Estimation Score Calculator Backlog

## Project Rules

- Keep Egyptian Estimation scoring/rules separate from Planning Poker estimation.
- Prefer implementation-ready slices with tests.
- Update `PROJECT_LOG.md` after each automation run.
- Use `PROJECT_RULES.md` and `RULE_BASELINE_V1.md` as the accepted user-confirmed house-rule baseline.
- Use `POST_MVP_ROADMAP.md` for post-MVP sequencing and acceptance notes.
- Use validation docs before moving implemented post-MVP items from pending validation to Done.
- Treat future federation comparison as optional unless official or user-provided evidence becomes available.

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
| Optional federation comparison | Backlog | 0% |
| React/Vite frontend prototype | Ready | 0% |

MVP progress: **100%**

Post-MVP progress: **90%**

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
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-213B — Browser UI Shell
Status: **Done**

- Implemented framework-neutral TypeScript browser UI shell service.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-214 — Persistent Database Adapter
Status: **Done**

- Implemented document-store adapter boundary without coupling scoring services to database libraries.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-215 — Rich Score-Sheet Export
Status: **Done**

- Added deterministic Markdown score-sheet export and CSV score-sheet export coverage.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-216A — Rule Baseline Formalization
Status: **Done**

- User confirmed no official federation file is currently available.
- Accepted the current user-confirmed rules as the v1 house-rule baseline.
- Added `RULE_BASELINE_V1.md`.
- No scoring logic changed.

### US-217A — Player Performance Analytics
Status: **Done**

- Added dashboard-ready analytics DTOs and `PlayerAnalyticsService`.
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
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

### US-219 — Game Summary and Leaderboard Compatibility Fixes
Status: **Done**

- Added `roundNumber` to `MvpRoundResult` for browser game summary consumers.
- Added regression coverage.
- Confirmed by local `npm run ci`: 101 tests passed, 0 failed.

## Ready

### US-220 — React/Vite Frontend Prototype
Status: **Ready**

- Create a browser app shell using the existing framework-neutral Browser UI Shell services.
- Allow four-player score-sheet creation.
- Allow round entry and validation preview.
- Show round results, running balances, leaderboard, analytics, and export actions.
- Use local storage for the first browser prototype.
- Keep scoring engine untouched and framework-agnostic.

## Optional / Blocked Until Evidence Exists

### US-216B — Future Federation Comparison
Status: **Optional backlog**

- Compare official rules against `RULE_BASELINE_V1.md` only if official or user-provided rule evidence becomes available.
- List exact differences and recommended project decision for each difference.
- Separate official tournament rules from user-preferred house rules.

### US-216C — Rule Change Implementation
Status: **Blocked until differences are confirmed**

- Implement only confirmed scoring changes.
- Add acceptance dataset rows for every changed rule.
- Update `PROJECT_RULES.md`, `RULE_BASELINE_V1.md`, tests, README, and backlog with final decisions.
