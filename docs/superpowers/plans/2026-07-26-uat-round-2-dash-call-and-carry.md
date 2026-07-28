# UAT Round 2 Dash Call and Carry Implementation Plan

> **Execution:** Use `superpowers:executing-plans` with test-driven development. Work only on `fix/uat-round-2-findings`; do not merge.

**Goal:** Deliver the missing Dash Call UAT flow and correct online all-loser carry persistence without changing unrelated score-sheet behavior.

**Architecture:** React captures a pre-bidding Dash Call declaration and emits the existing domain `dash-call` bid. The framework-agnostic scoring engine remains the only score authority. Additive classification metadata preserves Dash/Dash Call alongside round Risk. Online round saving calculates the complete chronological game and persists its authoritative final round, while genuine manual overrides remain in the separate override path.

**Tech stack:** TypeScript, React 19, Vite, Vitest, Testing Library, Supabase RPC persistence.

## Task 1: Lock the regression contracts in RED

**Files:**
- Modify `src/app/scoreSheet/biddingState.test.ts`
- Modify `src/app/components/CurrentRoundRow.test.tsx`
- Modify `src/online/games/OnlineBrowserShellService.test.ts`
- Modify focused summary, analytics, export, and backup tests under `tests/`

- [ ] Add pre-bidding Dash Call tests: successful declaration, late rejection, conflict rejection, and zero estimate enforcement.
- [ ] Add React tests for a clearly labelled declaration control and fixed zero estimate.
- [ ] Add an online save regression proving x2/x4 final scores and carry metadata are sent as original RPC data with no override.
- [ ] Add projection tests proving `dash-call` and `round-risk` coexist.
- [ ] Run focused tests and record the expected failures.

## Task 2: Implement Dash Call entry

**Files:**
- Modify `src/app/scoreSheet/biddingState.ts`
- Modify `src/app/components/CurrentRoundRow.tsx`
- Modify `src/app/screens/ScoreSheetScreen.tsx`
- Modify related styles only when required

- [ ] Add immutable declaration state and action available only before estimate entry.
- [ ] Set and retain the declared player's estimate at zero.
- [ ] Prevent later edits or conflicting declarations.
- [ ] Map the declared player to `bidType: "dash-call"` on save.
- [ ] Show an accessible Dash Call label without redesigning the table.
- [ ] Run the focused reducer and React suites.

## Task 3: Preserve simultaneous classifications

**Files:**
- Modify scoring result types and engine result construction.
- Modify `OnlineBrowserShellService.ts`.
- Modify score-sheet history/view model, game summary, statistics, player analytics, and export services.
- Modify focused tests for each projection.

- [ ] Add a backward-compatible normalized classification collection.
- [ ] Combine bid identity with round Risk instead of replacing one with the other.
- [ ] Normalize online snapshots from stored bid and score rows.
- [ ] Update history, summary, analytics, markdown, CSV/rich exports, and backup/replay tests.
- [ ] Confirm existing Dash and non-Dash behavior remains unchanged.

## Task 4: Persist authoritative carry results

**Files:**
- Modify `src/online/games/OnlineBrowserShellService.ts`
- Modify only required online service types/tests.
- Update stale high-contract carry tests and documentation to the Round 2 rule.

- [ ] Load/reuse the current game input before saving a new online round.
- [ ] Calculate the complete game chronologically and select its final round result.
- [ ] Send carried scores and metadata to `save_game_round`.
- [ ] Reload and verify calculated/applied equality when no manual override exists.
- [ ] Prove x2/x4 history, summary, analytics, export, and backup/replay consistency.
- [ ] Prove high-contract exclusions remain unchanged.

## Task 5: Verify override separation

**Files:**
- Modify focused score-sheet view-model and online integration tests.

- [ ] Assert system-carried scores never create an override record.
- [ ] Assert no Edited marker or Restore Original action appears after save/reload.
- [ ] Assert a genuine manual edit still creates an override and exposes both UI affordances.

## Task 6: Complete validation and delivery

**Files:**
- Create `docs/superpowers/reports/2026-07-26-uat-round-2-delivery.md`
- Update `.superpowers/sdd/progress.md`
- Update affected House Rules/scoring documentation.

- [ ] Run every focused regression suite.
- [ ] Run `npm run ci` until typechecks, engine tests, UI tests, and production build all pass.
- [ ] Review the diff for security, backward compatibility, and migration safety.
- [ ] Record RED/GREEN commands, root causes, decisions, files changed, risks, and manual UAT steps.
- [ ] Commit and push the isolated branch.
- [ ] Open a draft PR targeting `feature/react-vite-frontend-prototype`; do not merge.
