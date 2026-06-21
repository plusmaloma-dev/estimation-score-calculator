# Project Log

## 2026-06-21 - Run 30

Completed:

- Continued from US-216A - Federation Source Capture.
- Re-ran official-rule searches using English and Arabic terms for federation rules, scoring, regulations, Estimation Committee, and PDF documents.
- Confirmed again that no directly usable official scoring or rules document was captured in this run.
- Updated `FEDERATION_RULE_REVIEW.md` with another source-capture log entry and clarified that no scoring/code changes should be made from unrelated false-positive sources.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-216A - Federation Source Capture remains open.

Blockers:

- Detailed official federation scoring rules/documents remain unavailable through current public search.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.
- Local `npm run ci` is still needed before marking US-213A, US-213B, US-214, and US-215 fully Done.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 46% complete.

## 2026-06-21 - Run 29

Completed:

- Continued from US-216 - Federation-Rule Review into US-216A - Federation Source Capture.
- Re-ran public searches for official federation rules, regulations, PDF documents, and Arabic rule terms.
- Confirmed that no retrievable detailed official scoring document was found through available public search during this run.
- Recorded negative source-capture evidence in `FEDERATION_RULE_REVIEW.md` so future work does not accidentally infer rules from unrelated card-game results.
- Expanded the source capture log and marked US-216A as In progress.
- Updated `BACKLOG.md` to reflect US-216A progress and raise post-MVP progress to 46%.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-216A - Federation Source Capture.

Blockers:

- Detailed official federation scoring rules/documents remain unavailable through the current public search path.
- US-216B - Confirm Rule Differences remains blocked until an official document or user-confirmed source is available.
- Local `npm run ci` is still needed before marking US-213A, US-213B, US-214, or US-215 fully Done.
- GitHub Actions/status visibility through the connector remains unavailable, so local validation evidence is still required.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 46% complete.

## 2026-06-21 - Run 28

Completed:

- Continued from US-215 - Rich Score-Sheet Export and moved to the next unfinished backlog item, US-216 - Federation-Rule Review.
- Checked the current local rule baseline in `PROJECT_RULES.md`.
- Checked the public Egyptian Bridge Federation Estimation site for broad scope evidence: Estimation is described as a four-player 52-card trick-estimation game, and the Estimation Committee is described as responsible for officially recognized laws/rules, arbitration, tournament procedures, licensing, ranking, and player classification.
- Could not directly retrieve the public `rules.html` or `documents.html` pages through the available web fetcher during this run; detailed official scoring evidence remains pending.
- Added `FEDERATION_RULE_REVIEW.md` as a rule-audit tracker covering source notes, local baseline decisions, implementation impact, and pending evidence.
- Added follow-up stories US-216A, US-216B, and US-216C to separate source capture, rule-difference confirmation, and code changes.
- Updated `BACKLOG.md` to mark US-216 as In progress and raise post-MVP progress to 44%.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-216 - Federation-Rule Review.
- Next implementation-ready slice: US-216A - Federation Source Capture.

Blockers:

- Detailed federation Rules/Documents pages were not retrievable through the available web fetcher in this run.
- Local `npm run ci` is still needed before marking US-213A, US-213B, US-214, or US-215 fully Done.
- GitHub Actions/status visibility through the connector remains unavailable, so local validation evidence is still required.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 44% complete.

## 2026-06-21 - Run 27

Completed:

- Continued from US-215 - Rich Score-Sheet Export.
- Added `ScoreSheetMarkdownExportService` for deterministic human-readable Markdown exports.
- The service consumes existing `MvpGameInput` and `MvpGameResult` data without recalculating scores or changing Egyptian Estimation scoring rules.
- Export output now includes final standings, per-round player bid/actual/delta/score rows, status/notes, next-round multiplier notes, and validation errors for invalid unscored rounds.
- Added `tests/scoreSheetMarkdownExportService.test.ts` covering scored-round export and invalid-round validation sections.
- Exported the Markdown export service from `src/index.ts`.
- Updated README with Rich Markdown Score-Sheet Export usage notes.
- Updated `BACKLOG.md` to mark US-215 as implemented pending validation and raise post-MVP progress to 40%.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-215 - Rich Score-Sheet Export is implemented but pending `npm run ci` validation.
- US-213A, US-213B, and US-214 are also still pending `npm run ci` validation.

Blockers:

- Local `npm run ci` validation is needed.
- GitHub Actions/status visibility through the connector remains unavailable.
