# Estimation Score Calculator Backlog

## Project Rules

- Keep Egyptian Estimation scoring/rules separate from Planning Poker estimation.
- Prefer implementation-ready slices with tests.
- Update `PROJECT_LOG.md` after each automation run.
- Use `PROJECT_RULES.md` and `RULE_BASELINE_V1.md` as the accepted user-confirmed House Rules V1 baseline.
- Use uploaded EgyEstimation federation rule PDFs as the source for Federation 2026 mode.
- Keep House Rules V1 and Federation 2026 scoring isolated and selectable before a game/round begins.
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
| Federation rule-set support | In progress | 35% |
| React/Vite frontend prototype | Ready | 0% |

MVP progress: **100%**

Post-MVP progress: **92%**

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

### US-216C1 — House Rules V1 High-Call Formula
Status: **Done**

- Successful calls of 8 or higher now score `call × call`.
- Failed calls now score `-delta - (30 + ((call - 8) × 10))`.
- WITH uses the same formula independently.
- Risk/Double Risk and Only Winner/Only Loser remain additive modifiers.
- The x2/x4 all-loser multiplier remains excluded from high-contract scores.
- Federation 2026 Super 8/9/10 scoring remains unchanged.
- GitHub Actions CI run 374 passed.

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

### US-216B — Federation Comparison
Status: **Done**

- Compared uploaded federation rules against House Rules V1.
- Confirmed matching areas: suit hierarchy, total estimates cannot equal 13, WITH structure, Risk concept.
- Identified differences: Dash scoring, Super 8/9/10, all-pass behavior, all-loser handling, and exact federation scoring tables.

### US-216C — Rule Engine Abstraction / Dual Rule Sets
Status: **In progress**

- Preserve House Rules V1 as default behavior. **Done**
- Add explicit scoring rule-set ids: `HOUSE_RULES_V1` and `FEDERATION_2026`. **Done**
- Add `ScoringProfile.ruleSet` for future game configuration. **Done**
- Add Federation 2026 scoring table constants. **Done**
- Add Federation 2026 scoring strategy scaffold. **Done**
- Add strategy factory for rule-set resolution. **Done**
- Add focused scaffold tests. **Done**
- Add configurable House Rules V1 call-squared/high-call failure formulas. **Done**
- Add regression coverage proving Federation 2026 is unchanged. **Done**
- Next: wire factory into round/game services without breaking existing profiles.
- Next: persist the selected rule set with the score sheet/game configuration.
- Next: add end-to-end Federation 2026 score examples from uploaded tables.

### US-216D — Federation Super Bid Support
Status: **Ready after US-216C wiring**

- Implement Super 8 / Super 9 / Super 10 behavior in validated game flow.
- Add acceptance dataset rows for success and failure.

### US-216E — Federation All-Pass Round
Status: **Ready after US-216C wiring**

- Model all-pass federation behavior separately from house all-loser multiplier.
- Ensure no risk/bid bonus is applied in all-pass reshaped round.

## Ready

### US-220 — React/Vite Frontend Prototype
Status: **Ready after federation scoring slice or can proceed in parallel**

- Create a browser app shell using the existing framework-neutral Browser UI Shell services.
- Allow four-player score-sheet creation.
- Allow rule-set selection before starting the game/round.
- Allow round entry and validation preview.
- Show round results, running balances, leaderboard, analytics, and export actions.
- Use local storage for the first browser prototype.
- Keep scoring engine untouched and framework-agnostic.
