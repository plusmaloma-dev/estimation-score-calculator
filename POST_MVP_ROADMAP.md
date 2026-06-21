# Post-MVP Roadmap

The MVP score-calculation engine is complete and validated locally with `npm run ci`. Future work should remain separate from core Egyptian Estimation scoring rules unless a rule change is explicitly confirmed in `PROJECT_RULES.md`.

## Guiding Principles

- Keep the scoring engine framework-agnostic.
- Keep Egyptian Estimation concepts separate from Planning Poker terminology and workflows.
- Treat UI, storage, exports, and federation-rule review as adapters or documentation layers around the validated engine.
- Preserve `npm run ci` as the minimum acceptance check for implementation slices.

## US-212 — Browser/Mobile UI Planning

Goal: define the smallest usable browser/mobile score-sheet experience before selecting or building a UI framework.

Implementation-ready slices:

1. Draft screen map for player setup, round entry, scoring result, leaderboard, statistics, and import/export.
2. Define UI input DTO mapping to the existing engine DTOs.
3. List validation messages that should be shown before score calculation.
4. Confirm whether UI state should start with in-memory storage, browser local storage, or API-backed persistence.
5. Add executable integration tests only after a UI adapter is introduced.

Acceptance notes:

- The UI must enforce that total bids never equal 13 before scoring.
- The UI must support Over and Under rounds, Dash, Dash Call, WITH, Risk, Double Risk, and high-contract scoring through existing services.
- The UI must not introduce Planning Poker terms such as story points, estimate cards, velocity, or agile planning sessions.

## US-213 — Persistent Database Adapter

Goal: add a durable storage adapter without coupling the scoring engine to a database.

Implementation-ready slices:

1. Choose storage target after UI/API direction is known.
2. Implement a repository adapter that satisfies `ScoreSheetRepository`.
3. Add tests proving save, update, list, get, and delete behavior matches the in-memory adapter contract.
4. Add migration/version notes if the selected storage requires schema management.

Acceptance notes:

- Core scoring services must not import database libraries.
- Stored documents should preserve the current score-sheet DTO boundary.

## US-214 — Rich Score-Sheet Export

Goal: create human-friendly export output for completed games.

Implementation-ready slices:

1. Define a table layout for rounds, player deltas, running balances, final standings, and statistics.
2. Add a formatting service that consumes calculated game results without recalculating scores.
3. Add tests for deterministic table structure and ordering.
4. Keep JSON backup import/export unchanged as the machine-readable backup format.

Acceptance notes:

- Rich exports are presentation artifacts only.
- The scoring engine remains the source of truth for all scores.

## US-215 — Federation-Rule Review

Goal: compare `PROJECT_RULES.md` against official or confirmed Egyptian Estimation rule references and record any gaps.

Implementation-ready slices:

1. Review each local rule in `PROJECT_RULES.md`.
2. Record source, decision, and impact for each confirmed rule.
3. Create follow-up implementation stories only for confirmed scoring changes.
4. Re-run `npm run ci` after any rule-driven implementation change.

Acceptance notes:

- No scoring change should be made from unclear or mixed sources.
- User-confirmed local rules remain authoritative until explicitly superseded.
