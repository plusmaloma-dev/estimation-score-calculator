# Validation Status

Last updated: 2026-06-22

## Purpose

This file tracks validation evidence for implemented post-MVP items that are waiting for a green local CI run. It complements `VALIDATION_CHECKLIST.md` and should not contain Egyptian Estimation scoring rules.

## Current status

GitHub status checks and pull-request-triggered workflow runs are not visible for the inspected commits through the available connector. A local validation run is still required before moving implemented post-MVP backlog items from **Implemented, pending validation** to **Done**.

Required command:

```bash
git pull
npm install
npm run ci
```

## Evidence capture

Use `VALIDATION_EVIDENCE_TEMPLATE.md` to record the local validation result before closing pending implemented items. Keep the captured evidence focused on commands, pass/fail status, test count, failures, and backlog closure notes.

## Items waiting for validation

- US-213A - Local-Storage Score-Sheet Repository Adapter
- US-213B - Browser UI Shell
- US-214 - Persistent Database Adapter
- US-215 - Rich Score-Sheet Export
- US-217A - Player Performance Analytics
- US-217B - Player Analytics Markdown Export
- US-217C - Player Analytics CSV Export
- US-218 - Score-Sheet CSV Export

## Evidence needed

Record the following after the command runs:

- Command run.
- Pass/fail result.
- Test count if available.
- Any failing file or assertion if the run fails.
- Backlog items moved to **Done**, if the run passes.

## Boundary reminders

- Do not add Planning Poker terminology or behavior.
- Do not change Egyptian Estimation scoring rules without official source evidence or explicit user confirmation.
- Export and analytics services must consume calculated score results instead of recalculating scores independently.
- Persistence adapters must stay behind repository/store boundaries.
