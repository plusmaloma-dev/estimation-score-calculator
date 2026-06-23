# Validation Closure Plan

## Purpose

This plan converts the pending post-MVP validation work into a short, repeatable closure sequence. It is process-only documentation and must not contain Egyptian Estimation scoring decisions or Planning Poker terminology.

## Current validation gate

The following items are implemented but remain open until the latest `main` branch has local CI evidence:

- US-213A - Local-Storage Score-Sheet Repository Adapter
- US-213B - Browser UI Shell
- US-214 - Persistent Database Adapter
- US-215 - Rich Score-Sheet Export
- US-217A - Player Performance Analytics
- US-217B - Player Analytics Markdown Export
- US-217C - Player Analytics CSV Export
- US-218 - Score-Sheet CSV Export
- US-219 - Game Summary and Leaderboard Compatibility Fixes

## Required command sequence

Run from a clean checkout of `main`:

```bash
git pull
node --version
npm --version
git rev-parse HEAD
npm install
npm run ci
```

Prefer Node.js 22 so local validation matches the GitHub Actions workflow.

## Closure sequence after a passing run

1. Copy the command output summary into `VALIDATION_STATUS.md` using `VALIDATION_EVIDENCE_TEMPLATE.md`.
2. Confirm the closure matrix in `VALIDATION_STATUS.md` still passes for every pending item, including the US-219 checks in `VALIDATION_US219_ADDENDUM.md`.
3. Move US-213A, US-213B, US-214, US-215, US-217A, US-217B, US-217C, US-218, and US-219 from **Implemented, pending validation** to **Done** in `BACKLOG.md`.
4. Update post-MVP progress after the items close.
5. Add a timestamped entry to `PROJECT_LOG.md` with the commit under test, Node.js version, npm version, command, result, and closed items.

## If the run fails

1. Do not move any pending item to **Done**.
2. Record the first failing command, file, assertion, or TypeScript error in `VALIDATION_STATUS.md`.
3. Check `VALIDATION_TROUBLESHOOTING.md` for matching symptoms.
4. Create a focused backlog item for the failure and keep the affected implemented item pending.
5. Do not change scoring behavior unless the issue is backed by official Egyptian Estimation source evidence or explicit user confirmation.

## Rule boundary

- This plan does not change scoring, bidding validation, export, analytics, UI, persistence, summary, or leaderboard behavior.
- Federation-rule implementation work remains blocked until source capture produces actionable evidence or the user confirms a rule decision.
