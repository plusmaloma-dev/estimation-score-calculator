# UAT Round 2 Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight the accepted estimate during mobile actual entry and reconcile unaudited legacy carry scores as authoritative x2/x4 system results.

**Architecture:** Keep number-picker suggestion state presentational by passing an optional accepted estimate from `CurrentRoundRow`. At the online snapshot boundary, pair each persisted score with the chronological engine result and explicit override audits; use the engine result when no audit exists and the persisted applied score only when a genuine override exists.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Node test runner, Supabase PostgreSQL migrations, Vite.

## Global Constraints

- Keep House Rules V1 scoring in the framework-agnostic engine.
- Do not create override or audit records for calculated carry multipliers.
- Preserve genuine user overrides and Restore Original.
- Do not perform a destructive historical data migration.
- Keep PR #15 draft and target `feature/react-vite-frontend-prototype`.

---

### Task 1: Actual-tricks estimate suggestion

**Files:**
- Modify: `src/app/components/NumberPickerDialog.tsx`
- Modify: `src/app/components/NumberPickerDialog.test.tsx`
- Modify: `src/app/components/CurrentRoundRow.tsx`
- Modify: `src/app/components/CurrentRoundRow.test.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes: accepted estimate from `CurrentRoundDraft.estimates[playerId]`
- Produces: `NumberPickerDialogProps.suggestedValue?: number`

- [ ] **Step 1: Write failing component tests**

Add assertions that an actual picker with `suggestedValue={8}` gives option 8 the
suggested marker and accessible “matches estimate” name, focuses it when no actual is
selected, and keeps a different existing actual selected.

- [ ] **Step 2: Write failing integration test**

In the mobile `CurrentRoundRow` test, accept an estimate, open that player's actual
picker, and assert that the matching number is suggested.

- [ ] **Step 3: Run RED tests**

Run:

```text
npx vitest run src/app/components/NumberPickerDialog.test.tsx src/app/components/CurrentRoundRow.test.tsx
```

Expected: failures because `suggestedValue` and the suggested visual/accessibility
contract do not exist.

- [ ] **Step 4: Implement the minimal picker behavior**

Add the optional prop, use the existing selected value as first focus priority, fall
back to the suggested value, render a visible `Est.` marker, and add a dedicated
suggested CSS state that remains distinguishable from `[aria-pressed="true"]`.

- [ ] **Step 5: Pass the estimate only for actual entry**

In `CurrentRoundRow`, set `suggestedValue` to the target player's accepted estimate
when `entryType === 'actual'`; omit it for estimate entry.

- [ ] **Step 6: Run GREEN tests**

Run the same focused command and require all picker/current-row tests to pass.

### Task 2: Explicit-audit carry reconciliation

**Files:**
- Modify: `src/online/games/OnlineBrowserShellService.ts`
- Modify: `src/online/games/OnlineBrowserShellService.test.ts`
- Modify: `src/app/scoreSheet/scoreSheetViewModel.ts`
- Modify: `src/app/scoreSheet/scoreSheetViewModel.test.ts`
- Modify: `tests/onlineUatLifecycleSchema.test.ts`

**Interfaces:**
- Consumes: chronological `MvpGameResult`, snapshot `calculated_score`,
  `applied_score`, and `SnapshotOverrideRow`
- Produces: online round history whose applied score is engine-calculated unless an
  explicit audit exists; view cells whose `overridden` state follows audit presence

- [ ] **Step 1: Write failing legacy snapshot test**

Create an all-loser round followed by a snapshot round whose stored calculated/applied
scores are unmultiplied and whose overrides array is empty. Assert that opening the
session returns x2 engine scores and no score override records.

- [ ] **Step 2: Write failing genuine override test**

Use the same snapshot with one explicit override audit. Assert that the audited
player keeps the persisted applied score while unaudited players use engine scores.

- [ ] **Step 3: Write failing view-model tests**

Assert that unaudited reconciled carry cells are not overridden and an explicitly
audited player is overridden with calculated/applied values preserved.

- [ ] **Step 4: Strengthen the SQL contract test**

Assert that the latest `save_game_round` definition writes `score_item->>'score'` into
both `calculated_score` and initial `applied_score`, with override writes confined to
`override_round_scores`.

- [ ] **Step 5: Run RED tests**

Run:

```text
npx vitest run src/online/games/OnlineBrowserShellService.test.ts src/app/scoreSheet/scoreSheetViewModel.test.ts
npm run test:engine
```

Expected: snapshot/view assertions fail because unaudited legacy persisted values are
still treated as applied scores and edit state is inferred numerically.

- [ ] **Step 6: Implement reconciliation**

Build a `(roundNumber, playerId)` set from snapshot override audits. While mapping
round history, locate the engine score for the same round/player. Use:

```text
applied = hasExplicitOverride ? persisted applied_score : engine score
```

Preserve persisted applied values only for audited players. Keep `gameResult` as the
chronological engine calculation.

- [ ] **Step 7: Make edit state audit-driven**

Build the view model's overridden set from `scoreSheet.scoreOverrides` and use it for
`overridden`. Continue deriving `calculatedScore` from the engine and `appliedScore`
from reconciled round history.

- [ ] **Step 8: Run GREEN tests**

Run the focused UI/online suites and the engine schema test; require zero failures.

### Task 3: Validate, document, publish, and deploy

**Files:**
- Modify: `docs/superpowers/reports/2026-07-26-uat-round-2-delivery.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: final test output and Vercel deployment URL
- Produces: updated draft PR #15 and verified UAT preview

- [ ] **Step 1: Run complete validation**

Run:

```text
npm run ci
```

Require both typechecks, all engine tests, all UI tests, and the production build to
pass. Record the existing chunk-size advisory separately.

- [ ] **Step 2: Update delivery evidence**

Document the missed picker feedback, legacy carry reconciliation, RED/GREEN evidence,
no-destructive-migration decision, and manual UAT results.

- [ ] **Step 3: Commit and push**

Commit the implementation and documentation to `fix/uat-round-2-findings`, then push
to update draft PR #15. Do not merge.

- [ ] **Step 4: Deploy to the existing Vercel project**

Use the existing `estimation-score-calculator` project link and create a new Preview
deployment. Do not deploy to or recreate a branch-named project.

- [ ] **Step 5: Smoke-test the deployed preview**

Open the URL, verify the configured sign-in screen, authenticate interactively if
needed, and verify the highlighted estimate plus unaudited carry behavior. Confirm
genuine manual overrides still show edit controls.
