# Validation Handoff

Last updated: 2026-06-22

## Purpose

This note gives the next local validator a compact handoff for closing implemented post-MVP work after a green CI run. It is documentation-only and must not introduce or change Egyptian Estimation scoring behavior.

## Validation command

Run from a fresh local checkout of `main`:

```bash
git pull
node --version
npm --version
git rev-parse HEAD
npm install
npm run ci
```

Prefer Node.js 22 to match the repository GitHub Actions workflow.

## Items to close after green CI

Move these from **Implemented, pending validation** to **Done** only if the latest `main` branch passes `npm run ci` and the item-specific checks in `VALIDATION_STATUS.md` still hold:

- US-213A — Local-Storage Score-Sheet Repository Adapter
- US-213B — Browser UI Shell
- US-214 — Persistent Database Adapter
- US-215 — Rich Score-Sheet Export
- US-217A — Player Performance Analytics
- US-217B — Player Analytics Markdown Export
- US-217C — Player Analytics CSV Export
- US-218 — Score-Sheet CSV Export

## US-218 alignment note

`VALIDATION_STATUS.md` already includes US-218 in the pending validation list and closure matrix, and `README.md` documents the score-sheet CSV export usage. Before closing US-218, verify the CSV export tests pass and confirm:

- `bidType` is populated from the original round input.
- `runningScore` remains cumulative across valid rounds.
- Invalid-round rows preserve validation notes.
- The exporter consumes existing score-sheet input/result DTOs and does not recalculate scores.

## Rule boundaries

- Do not mix Planning Poker terminology or behavior into this project.
- Do not change Egyptian Estimation scoring rules without official source evidence or explicit user confirmation.
- Export and analytics services must present calculated results; they must not become alternate scoring engines.
- Persistence adapters must stay behind repository/store boundaries.

## Evidence to record

After local validation, update the project documentation with:

- Commit SHA tested.
- Node.js and npm versions.
- Command result.
- Test count or failing test details.
- Items moved to **Done**, if any.
- Any remaining blockers.
