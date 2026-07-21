# Game-Level Rule-Set Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add game-level scoring rule-set selection, automatic strategy resolution, and persistence/backup compatibility.

**Architecture:** Store an optional `ruleSet` on `MvpGameInput`, resolve missing values to `HOUSE_RULES_V1`, and calculate every round in the game through the selected strategy. Browser score-sheet creation stores the resolved rule set once; repositories and backups preserve it through the existing `gameInput` boundary.

**Tech Stack:** TypeScript 5.5+, Node.js test runner, GitHub Actions, framework-neutral services.

## Global Constraints

- Keep Egyptian Estimation separate from Planning Poker.
- Supported rule sets are exactly `HOUSE_RULES_V1` and `FEDERATION_2026`.
- A game uses one locked rule set for all rounds.
- Legacy data without a rule set defaults to `HOUSE_RULES_V1`.
- Preserve existing direct round-calculation compatibility.
- Do not change House Rules V1 or Federation 2026 formulas in this slice.

---

### Task 1: Rule-Set Resolution and Game Calculation

**Files:**
- Modify: `src/scoring/ruleSets.ts`
- Modify: `src/services/EstimationMvpService.ts`
- Test: `tests/gameRuleSetSelection.test.ts`

**Interfaces:**
- Produces: `resolveScoringRuleSetId(value?: unknown): ScoringRuleSetId`
- Produces: `MvpGameInput.ruleSet?: ScoringRuleSetId`
- Produces: `MvpGameResult.ruleSet: ScoringRuleSetId`
- Produces: `MvpRoundInput.ruleSet?: ScoringRuleSetId`

- [ ] **Step 1: Write failing tests** proving legacy games resolve to House Rules V1, Federation games automatically score Super 8 as 41, and all rounds use the game-level selection.
- [ ] **Step 2: Run `npm run ci` through the draft PR** and confirm failure because the new fields/resolver do not exist.
- [ ] **Step 3: Implement the resolver and service wiring** by creating a scoring strategy per round with `ScoringStrategyFactory`, overriding the round profile's rule-set identity with the authoritative game selection, and returning the resolved rule set in `MvpGameResult`.
- [ ] **Step 4: Re-run CI** and confirm the game-selection tests pass.
- [ ] **Step 5: Commit** with `feat: wire game-level rule-set selection`.

### Task 2: Browser Score-Sheet Creation and Locking

**Files:**
- Modify: `src/ui/BrowserUiShellService.ts`
- Test: `tests/browserRuleSetSelection.test.ts`

**Interfaces:**
- Produces: `UiCreateScoreSheetInput.ruleSet?: ScoringRuleSetId`
- Guarantees: newly created score sheets store a resolved `gameInput.ruleSet`
- Guarantees: saving rounds preserves the stored selection and does not accept a round-level replacement

- [ ] **Step 1: Write failing tests** for explicit Federation selection, legacy/default House selection, and preservation after saving a round.
- [ ] **Step 2: Run CI** and confirm failure because score-sheet creation does not store the selection.
- [ ] **Step 3: Implement minimal browser-shell changes** to resolve the selection during creation and carry it through all later game calculations.
- [ ] **Step 4: Re-run CI** and confirm browser rule-set tests pass.
- [ ] **Step 5: Commit** with `feat: persist rule set in browser score sheets`.

### Task 3: Backup Import Compatibility

**Files:**
- Modify: `src/importExport/ScoreSheetBackupService.ts`
- Test: `tests/scoreSheetBackupRuleSet.test.ts`

**Interfaces:**
- Guarantees: export preserves `gameInput.ruleSet`
- Guarantees: import normalizes missing `gameInput.ruleSet` to `HOUSE_RULES_V1`
- Guarantees: import rejects unsupported rule-set values

- [ ] **Step 1: Write failing tests** for valid Federation round-trip, legacy normalization, and unsupported-value rejection.
- [ ] **Step 2: Run CI** and confirm failure on missing normalization/validation.
- [ ] **Step 3: Implement import validation and normalization** using `isScoringRuleSetId` and `resolveScoringRuleSetId`.
- [ ] **Step 4: Re-run CI** and confirm backup tests pass.
- [ ] **Step 5: Commit** with `feat: preserve rule set in backups`.

### Task 4: Documentation and Project Tracking

**Files:**
- Modify: `README.md`
- Modify: `BACKLOG.md`
- Modify: `PROJECT_LOG.md`

**Interfaces:**
- Documents the game-level lock, legacy default, browser usage, and backup behavior.

- [ ] **Step 1: Update README examples** to show `ruleSet: HOUSE_RULES_V1` and `ruleSet: FEDERATION_2026` at game creation.
- [ ] **Step 2: Mark US-216C game-level selection/persistence complete** and identify Federation end-to-end acceptance coverage as next.
- [ ] **Step 3: Add the dated project-log entry** with commits, CI evidence, current item, blockers, and progress percentages.
- [ ] **Step 4: Run final `npm run ci` through GitHub Actions** and verify typecheck, tests, and build.
- [ ] **Step 5: Mark the PR ready for review** after successful CI.
