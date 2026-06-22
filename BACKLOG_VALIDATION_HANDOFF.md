# Backlog Validation Handoff

Last updated: 2026-06-22

## Purpose

This file is a backlog-supporting handoff for implemented post-MVP items that are waiting for local validation evidence. It does not replace `BACKLOG.md`; it keeps the closure order and acceptance checks explicit while rule-review work remains blocked on source evidence.

## Active backlog position

- Current active rule-review item: US-216A — Federation Source Capture.
- Blocked rule-review items: US-216B — Confirm Rule Differences and US-216C — Rule Change Implementation.
- Implementation-ready next action: run local CI and close already implemented post-MVP items if validation passes.

## Pending validation backlog items

| Item | Area | Required closure evidence |
| --- | --- | --- |
| US-213A | Local-storage repository adapter | Green `npm run ci`; local-storage adapter tests pass; corrupt/missing stored data remains safe. |
| US-213B | Browser UI shell | Green `npm run ci`; setup, validation-message, leaderboard/history, and JSON backup shell tests pass. |
| US-214 | Persistent database adapter | Green `npm run ci`; document-store adapter contract tests pass; database libraries stay outside scoring engine. |
| US-215 | Rich score-sheet export | Green `npm run ci`; Markdown export remains deterministic and consumes calculated results. |
| US-217A | Player performance analytics | Green `npm run ci`; analytics DTOs consume calculated game results without recalculating scores. |
| US-217B | Player analytics Markdown export | Green `npm run ci`; deterministic Markdown analytics table tests pass. |
| US-217C | Player analytics CSV export | Green `npm run ci`; CSV metadata and escaping tests pass. |
| US-218 | Score-sheet CSV export | Green `npm run ci`; bid type, cumulative running score, and invalid-round validation notes are preserved. |

## Closure rule

Do not move any item above to **Done** until local validation evidence is recorded. If CI fails, keep item status unchanged and use `VALIDATION_TROUBLESHOOTING.md` for focused triage without changing Egyptian Estimation scoring rules.

## Boundary reminders

- Keep Egyptian Estimation scoring/rules separate from Planning Poker.
- Do not change scoring rules without official or user-confirmed evidence.
- Export/analytics features must not recalculate scores independently.
- Persistence adapters must remain behind repository/store boundaries.
