# Gameplay Start RPC Contract Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align both maintained `gameplay-start` Edge Function sources with the already-applied six-parameter `initialize_gameplay_round_state` RPC contract while preserving deterministic retry behavior.

**Architecture:** A focused cross-artifact regression test treats the applied gameplay migration as the RPC contract and validates both maintained Edge Function copies. The minimal production correction changes only the RPC argument object and the successful return path; the existing persisted-round lookup remains ahead of all private deal generation. The hosted runbook records that the partial table is evidence and that retesting must use a new table.

**Tech Stack:** TypeScript, Node test runner, Supabase Edge Functions, PostgreSQL RPC migrations, npm CI.

## Global Constraints

- Work only in `C:\Users\rjamm\estimation-gameplay-uat`.
- Keep branch `feature/online-game-bot-mvp` and PR #14 draft, open, and unmerged.
- Do not add or apply a migration.
- Do not deploy an Edge Function or Vercel artifact.
- Do not mutate hosted data or the preserved table `Solo UAT Start Retest 1`.
- Never use `--no-verify-jwt`.
- Do not expose credentials, private hands, seeds, nonces, or deck order.
- Commit and push only after focused GREEN, `npm run ci`, and `npm run ci:isolation` all pass.

---

### Task 1: Add the failing RPC boundary regression

**Files:**
- Create: `tests/gameplayStartRpcContract.test.ts`
- Reference: `supabase-gameplay/supabase/migrations/202607260009_gameplay_round_rpc.sql`
- Reference: `supabase/functions/gameplay-start/index.ts`
- Reference: `supabase-gameplay/supabase/functions/gameplay-start/index.ts`

**Interfaces:**
- Consumes: the SQL signature of `public.initialize_gameplay_round_state`.
- Produces: a regression gate for the exact RPC arguments, metadata-only success response, and persisted-round early return.

- [ ] **Step 1: Write the failing test**

Create a Node test that:

```ts
const expectedParameters = [
  'p_table_id',
  'p_actor_user_id',
  'p_round_number',
  'p_phase',
  'p_aggregate',
  'p_occurred_at',
] as const;
```

For both maintained Function sources, extract the argument object passed to `initialize_gameplay_round_state` and assert that its parameter names exactly equal `expectedParameters`. Extract `initializeRound` and assert that successful initialization returns `bootstrap.state` without reading `initialized.aggregate`. Also assert that `repository.load(tableId)` and its early return occur before seat loading and cryptographic generation.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test --test-name-pattern="gameplay Start RPC contract" dist/tests/gameplayStartRpcContract.test.js
```

Expected: non-zero exit with focused failures showing `p_initial_aggregate` does not match the six SQL parameters and `initialized.aggregate` violates the metadata-only return contract.

---

### Task 2: Apply the minimal Edge Function correction

**Files:**
- Modify: `supabase/functions/gameplay-start/index.ts`
- Modify: `supabase-gameplay/supabase/functions/gameplay-start/index.ts`
- Test: `tests/gameplayStartRpcContract.test.ts`

**Interfaces:**
- Consumes: `bootstrap.state.roundNumber`, `bootstrap.state.phase`, and `bootstrap.state`.
- Produces: the exact existing SQL RPC payload and a `HouseRulesRoundState` returned from the successful bootstrap.

- [ ] **Step 1: Correct both RPC payloads**

Use exactly:

```ts
const initialized = await rpc(client, 'initialize_gameplay_round_state', {
  p_table_id: tableId,
  p_actor_user_id: actorUserId,
  p_round_number: bootstrap.state.roundNumber,
  p_phase: bootstrap.state.phase,
  p_aggregate: bootstrap.state,
  p_occurred_at: occurredAt,
});
```

- [ ] **Step 2: Correct the success response handling**

Use:

```ts
if (initialized.valid !== true) {
  const errors = stringArray(initialized.errors);
  throw new Error(errors[0] ?? 'Gameplay round state could not be initialized.');
}
return bootstrap.state;
```

Do not alter the existing early return for a persisted aggregate.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run the same three focused commands from Task 1. Expected: exit `0` with every focused subtest passing.

---

### Task 3: Record the hosted retest rule

**Files:**
- Modify: `docs/GAMEPLAY_UAT_DEPLOYMENT.md`

**Interfaces:**
- Consumes: hosted evidence for `Solo UAT Start Retest 1`.
- Produces: an explicit operator stop rule.

- [ ] **Step 1: Add the evidence and retest note**

Document that the table remains untouched as partial-commit evidence, must not be manually repaired, and must not be reused for hosted Start retesting. State that the post-deployment retest must create a new table because the browser does not retain the original Start command identity after the partial failure.

---

### Task 4: Verify, publish, and observe CI

**Files:**
- Verify all intended files from Tasks 1–3.

**Interfaces:**
- Consumes: the completed local correction.
- Produces: one verified commit on the existing draft PR branch and a reported GitHub Actions run.

- [ ] **Step 1: Run full package CI**

```powershell
npm run ci
```

Expected: exit `0`.

- [ ] **Step 2: Run isolation validation**

```powershell
npm run ci:isolation
```

Expected: exit `0`.

- [ ] **Step 3: Inspect scope and cleanliness**

Review `git status --short`, `git diff --check`, and the complete diff. Stage only the intended test, two Function sources, runbook, and this plan.

- [ ] **Step 4: Commit and push**

```powershell
git commit -m "fix: align gameplay start round RPC contract"
git push origin feature/online-game-bot-mvp
```

- [ ] **Step 5: Verify PR and CI state**

Confirm PR #14 remains draft, open, and unmerged. Wait for the workflow run on the new SHA and report its run number and conclusion. Stop before every deployment or hosted-data operation.
