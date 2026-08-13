# Authoritative Player Scores and Card-Table Gameplay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seat-owned authoritative score history/display-name projections and replace the active gameplay dashboard with a stable responsive card-table surface.

**Architecture:** A forward-only gameplay migration adds an append-only one-row-per-round score journal. The service-role gameplay Function writes it atomically on the first scored transition and reads it to derive cumulative totals/history; no rolling totals or client reconstruction are introduced. A pure `GameplayTablePresentation` arranges compatible authoritative snapshots, while `ActiveGameplayScreen` keeps its existing synchronization and Realtime coordinator and mounts a stable table shell.

**Tech Stack:** TypeScript, React, Vitest, Node test runner, Supabase PostgreSQL migrations/RPCs, Deno Edge Functions, existing guarded deployment wrappers.

## Global Constraints

- Work only in `C:\Users\rjamm\estimation-gameplay-uat` on `feature/online-game-bot-mvp`.
- Preserve PR #14 as open, draft, and unmerged; never merge or mark ready.
- Score belongs to the table seat for the game's lifetime; control takeover and display-name changes never reset or transfer it.
- Journal rows are keyed by `(table_id, round_number)` and contain exactly four integer seat-indexed deltas, with no player IDs, names, hands, cards, deals, seeds, nonces, or deck order.
- Matching duplicate journal payloads are idempotent; conflicting duplicates fail closed; no update/overwrite path exists.
- Pre-journal rounds receive no synthetic backfill. Acceptance uses fresh post-migration tables; preserved UAT evidence and the score project are untouched.
- React never computes scoring, Risk, auction/card legality, trick winners, cumulative totals, or privacy-sensitive identity.
- The current winner comes from an authoritative `currentWinningSeat` projection; completed-trick winners remain authoritative recorded values.
- Disabled exact-13 estimate options use the stable reason code `would_total_13` and are never submitted.
- Only `ownHand` reaches the hand component; JWT, RLS, service-only RPC, Realtime, and HumanActionBoundaryCoordinator remain intact.
- No deployment, migration application, Function deployment, Vercel deployment, hosted mutation, or push occurs until all local gates and exact-SHA CI are green.

---

### Task 1: Add the append-only seat-score journal migration

**Files:**
- Create: `supabase-gameplay/supabase/migrations/202608120014_gameplay_round_score_history.sql`
- Modify: `tests/gameplayRoundSchema.test.ts`
- Create: `tests/gameplayRoundScoreHistorySchema.test.ts`

**Interfaces:**
- Produces table `public.gameplay_round_score_history` with `table_id`, `round_number`, exactly four seat-indexed integer deltas, immutable audit timestamp, and unique `(table_id, round_number)`.
- Produces service-only insert/read boundary used by the gameplay Function; authenticated clients have no direct select/insert/update/delete grant.

- [ ] Write RED schema tests for the table, unique key, four-seat/integer payload checks, no player/name/private fields, RLS, and absence of authenticated direct access.
- [ ] Run `node --test tests/gameplayRoundScoreHistorySchema.test.ts tests/gameplayRoundSchema.test.ts`; observe failure because migration 014 does not exist.
- [ ] Implement the forward-only SQL migration after 013. Use a JSONB seat-delta payload only if the SQL check enforces exactly seat keys 0–3 and integer values; otherwise use four explicit seat-delta columns. Add a unique key and service-only grants.
- [ ] Rerun the focused schema tests; require GREEN and `git diff --check`.
- [ ] Commit `feat: add seat-owned gameplay score journal` with only the migration and schema tests.

### Task 2: Add transactional journal write/idempotency at the scored boundary

**Files:**
- Modify: `supabase-gameplay/supabase/migrations/202608120014_gameplay_round_score_history.sql`
- Modify: `supabase-gameplay/supabase/functions/gameplay-round-command/index.ts`
- Modify: `supabase/functions/gameplay-round-command/index.ts`
- Create: `tests/gameplayRoundScoreJournal.test.ts`
- Modify: `supabase/functions/gameplay-round-command/nextRoundHandler.test.ts` when shared helpers are required

**Interfaces:**
- The accepted command transition that first produces `scored` calls one transaction-owned journal insert with `(tableId, roundNumber, seatDeltas)`.
- A same-key/same-payload replay returns the original result; a same-key/conflicting payload returns a safe rejection and leaves both round state and journal unchanged.

- [ ] Write RED tests for first scored transition, matching command replay, matching journal duplicate, conflicting duplicate, missing/duplicate/out-of-range/non-integer seat payloads, and no partial scored-without-journal state.
- [ ] Run `node --test tests/gameplayRoundScoreJournal.test.ts`; observe failures against the current Function/RPC path.
- [ ] Extend the guarded service RPC contract or add a forward-only transaction wrapper so scoring and journal insertion commit or roll back together. Keep JWT verification and service-role access unchanged.
- [ ] Keep the two Function source copies byte-for-byte equivalent and never expose journal rows through a client RPC.
- [ ] Run the focused Node/Deno boundary tests and require GREEN.
- [ ] Commit `feat: journal scored gameplay rounds atomically`.

### Task 3: Project cumulative totals and ordered score history

**Files:**
- Modify: `src/gameplay/types.ts`
- Modify: `src/gameplay/GameplayRoundSnapshotProjector.ts`
- Modify: `src/online/gameplay/roundTypes.ts`
- Modify: `src/online/gameplay/OnlineGameplayRoundService.ts`
- Modify: `supabase/functions/gameplay-round-command/index.ts` if read projection is assembled there
- Modify: `supabase-gameplay/supabase/functions/gameplay-round-command/index.ts` if its twin is required
- Create/modify: `tests/gameplayRoundScoreProjection.test.ts`
- Modify: `tests/gameplayRoundSnapshotProjection.test.ts`
- Modify: `tests/onlineGameplayRoundService.test.ts`

**Interfaces:**
- Public snapshot adds `scoreHistory` ordered by round and `cumulativeScoresBySeat` (or an equivalent typed seat array), containing only round deltas and running totals.
- In-progress current state contributes no journal entry. Reconnect and a new client receive the same values from the server projection.

- [ ] Write RED projection tests for round 1 totals, next-round preservation, in-progress round exclusion, round 2 exactly-once update, reconnect/new-client equality, and seat ownership through control changes.
- [ ] Run the focused projection/service tests; observe missing fields and zero-history failures.
- [ ] Read the journal through the service boundary, sort by round, validate exactly four seats per row, and derive running totals server-side. Fail closed on malformed or conflicting journal data.
- [ ] Parse/validate the new public DTO without accepting private aggregate fields or another seat's cards.
- [ ] Rerun focused tests GREEN and compare both Function source copies.
- [ ] Commit `feat: project authoritative gameplay score history`.

### Task 4: Project safe seat display names and authoritative roles

**Files:**
- Modify: `src/online/gameplay/roundTypes.ts`
- Modify: `src/online/gameplay/OnlineGameplayRoundService.ts`
- Modify: `src/gameplay/GameplayRoundSnapshotProjector.ts`
- Modify: `src/online/gameplay/GameplayTableSnapshotProjector.ts` or the existing table-seat read path
- Modify: `tests/gameplayRoundSnapshotProjection.test.ts`
- Modify: `tests/onlineGameplayRoundService.test.ts`

**Interfaces:**
- Each public seat projection supplies safe `displayName`, `isBot`, current estimate, tricks won, cumulative score, and authoritative role flags.
- Technical IDs remain internal for command/reconciliation only.

- [ ] Write RED tests proving local human maps to `You`, other humans use authoritative table `displayName`, permanent bots map to `Standard Bot {seat + 1}`, and UUID/auth/bot IDs never appear in presentation data.
- [ ] Run focused tests and observe the missing-safe-name failures.
- [ ] Join the table-seat projection to round seats by stable internal identity at the service boundary, then strip technical identity from the public presentation model.
- [ ] Rerun tests GREEN, including privacy assertions that only the viewer's `ownHand` is present.
- [ ] Commit `feat: project safe gameplay seat identities`.

### Task 5: Add authoritative current-trick winner and typed estimate options

**Files:**
- Modify: `src/gameplay/GameplayRoundSnapshotProjector.ts`
- Modify: `src/gameplay/HouseRulesBidOptionsService.ts` or its typed option service
- Modify: `src/gameplay/types.ts`
- Modify: `src/online/gameplay/roundTypes.ts`
- Modify: `src/online/gameplay/OnlineGameplayRoundService.ts`
- Modify: `tests/gameplayRoundSnapshotProjection.test.ts`
- Modify: `tests/gameplayRoundEngine.test.ts`
- Create/modify: `tests/gameplayEstimateOptionProjection.test.ts`

**Interfaces:**
- Snapshot exposes `currentWinningSeat?: SeatIndex` computed with the existing domain winner primitive and a typed `estimateOptions` list whose disabled entries carry reason `'would_total_13'`.
- `legalNormalEstimates` remains the command-authoritative enabled subset; disabled entries never reach command submission.

- [ ] Write RED tests for partial trick winner, trump-over-lead, higher same-suit card, completed-trick winner retention, disabled exact-13 option/reason, and numeric-only estimate options.
- [ ] Run focused tests; observe missing field/reason failures.
- [ ] Reuse the existing trick winner primitive in the domain projector; do not add comparison logic to React or the presentation model. Derive disabled display options from authoritative estimate state while retaining the legal subset.
- [ ] Rerun engine/projection tests GREEN and verify no House Rules scoring/Risk threshold changes.
- [ ] Commit `feat: expose authoritative trick and estimate projections`.

### Task 6: Define the pure GameplayTablePresentation model

**Files:**
- Create: `src/app/gameplay/GameplayTablePresentation.ts`
- Create: `src/app/gameplay/GameplayTablePresentation.test.ts`
- Modify: `src/app/gameplay/ActiveRoundPresentation.ts`

**Interfaces:**
- `createGameplayTablePresentation(presentation, roundSnapshot, viewerUserId)` returns pure relative seat positions, compact context, Bid/Won/Score, role badges, current/last trick, overall scores/history, action tray state, and stable hand/legal-card references.
- It consumes authoritative winner, roles, score, display-name, estimate-option, and compatibility fields without recomputing domain rules.

- [ ] Write RED pure-model tests for all four seat positions, safe labels, Bid/Won/Score semantics, dealer/caller/WITH/Risk/active badges, current/last trick, score strip/history, auction/estimate/play trays, and synchronization suppression.
- [ ] Run `npx vitest run src/app/gameplay/GameplayTablePresentation.test.ts`; observe missing-module failures.
- [ ] Implement only deterministic mapping/format-neutral derivation. Keep current trick winner and completed winners as passed authoritative fields.
- [ ] Rerun tests GREEN.
- [ ] Commit `feat: define pure gameplay table presentation`.

### Task 7: Build compact seat, score, trick, hand, action, and history components

**Files:**
- Create: `src/app/components/GameplayTable.tsx`
- Create: `src/app/components/GameplaySeatPanel.tsx`
- Create: `src/app/components/GameplayScoreStrip.tsx`
- Create/modify: `src/app/components/GameplayCurrentTrick.tsx`
- Create/modify: `src/app/components/GameplayScoreHistory.tsx`
- Modify: `src/app/components/GameplayHand.tsx`
- Modify: `src/app/components/GameplayActionBanner.tsx`
- Create/modify focused component tests under `src/app/components/`
- Modify: `src/app/i18n/translations.ts`

**Interfaces:**
- Components receive only `GameplayTablePresentation` and `ownHand`/legal-card callbacks. No component receives raw technical IDs or private aggregates.
- Hand remains mounted across compatible updates; disabled estimate options are rendered but not selectable/submittable.

- [ ] Write RED component tests for compact seat fields/badges, score strip, current trick winner, retained last trick, visible hand, auction tray, estimate tray with disabled reason, play tray, collapsed history, Arabic labels, and no UUID/internal bot text.
- [ ] Run focused component tests; observe old dashboard/missing-component failures.
- [ ] Implement the table surfaces using existing visual language and translation keys. Use stable keys based on seat/round semantics, not random IDs; keep history disclosure state local to the stable shell.
- [ ] Rerun focused component tests GREEN.
- [ ] Commit `feat: add compact gameplay table components`.

### Task 8: Replace the active screen body while preserving synchronization

**Files:**
- Modify: `src/app/screens/ActiveGameplayScreen.tsx`
- Modify: `src/app/styles/gameplay.css`
- Modify: `src/app/screens/ActiveGameplayScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayBiddingScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayCardPlayScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayRoundRealtimeScreen.test.tsx`
- Modify: `src/app/screens/ActiveGameplayBotDirectiveScreen.test.tsx`

**Interfaces:**
- Existing active-control/round Realtime streams, exact turn compatibility, refresh retry, bot directives, human boundaries, host controls, and next-round behavior remain unchanged.
- Incompatible snapshots render one neutral synchronization state with no actionable bid/card controls.

- [ ] Write RED screen tests for stable table shell identity across compatible updates, no contradictory action/waiting text, no viewport/remount reset, mobile priority order, and synchronization suppression/retry.
- [ ] Run focused screen tests; observe old stacked-layout assertions or stability failures.
- [ ] Feed the pure table model into one mounted `GameplayTable`; retain the existing refresh/realtime effects and action callbacks. Remove duplicate legacy status/card/bid rendering from the active primary body while retaining secondary scored/lifecycle surfaces.
- [ ] Add responsive CSS grid/flex layout with desktop relative seats and mobile priority ordering; avoid exposing technical identifiers.
- [ ] Rerun all focused screen tests GREEN.
- [ ] Commit `feat: render stable responsive gameplay table`.

### Task 9: Integrated rules, reconnect, score-history, and privacy verification

**Files:**
- Modify/add: `tests/gameplayRoundEngine.test.ts`
- Modify/add: `tests/gameplayRoundSnapshotProjection.test.ts`
- Modify/add: `tests/gameplaySessionBootstrapService.test.ts`
- Modify/add: `src/app/screens/ActiveGameplayScreen.test.tsx`
- Modify/add: `tests/gameplayRoundScoreJournal.test.ts`
- Modify/add: `tests/gameplaySupabaseWorkspaceIsolation.test.ts`

- [ ] Write RED integration tests for dealer rotation, right-of-dealer auction start, caller Trick 1 lead, winner-led next trick, fixed caller contract estimate, exact-13 rejection, Risk-candidate vs actual-Risk distinction, next-round score preservation, reconnect/history restoration, and private-hand isolation.
- [ ] Run the focused integration suites; record failures before implementation changes.
- [ ] Correct only projection/UI integration defects; stop if post-auction estimate ordering would need to change because that is an unresolved gameplay rule.
- [ ] Rerun the complete affected focused suites GREEN.
- [ ] Commit `test: verify authoritative card-table gameplay flows`.

### Task 10: Full local verification and independent acceptance review

**Files:** No production changes expected; only test fixes within approved scope if a deterministic failure reveals a Task 1–9 defect.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run ci`.
- [ ] Run `npm run ci:isolation`.
- [ ] Run relevant Deno Function tests and the local migration/database/pgTAP suites, including journal transaction/idempotency coverage.
- [ ] Run the production gameplay build.
- [ ] Run `git diff --check` and inspect `git diff --name-status 9ec51f7d43b8be7090565f2935b6c18db3c8998a..HEAD`.
- [ ] Perform an independent Critical/Important/Minor review. Do not commit or release with unresolved Critical or Important findings.
- [ ] Commit any bounded verification-only test correction separately with a specific message; otherwise leave the implementation commits unchanged.

### Task 11: Release gates and guarded deployment (authorized only after clean acceptance)

**Files:** No code changes; use existing guarded wrappers and runbooks only.

- [ ] Push the bounded implementation branch normally and wait for exact-SHA pull-request CI. Require `Validate package`, `Validate isolation boundaries`, and overall success.
- [ ] If migration 014 exists, run the gameplay target guard and guarded gameplay migration deployment only; never reapply 013 or touch the score project.
- [ ] Deploy only changed gameplay Function(s) through the guarded Function wrapper, preserving JWT checks.
- [ ] Obtain `GAMEPLAY_UAT_PUBLISHABLE_KEY` only through the secure local PowerShell handoff; never print, persist, or commit it. Run guarded Vercel dry-run, then guarded deployment if available.
- [ ] Verify canonical alias provenance, exact deployed SHA, public smoke, score-project isolation, and preserved evidence-table immutability.
- [ ] Stop before hosted UAT and report migration/function/deployment IDs, CI, PR state, and any secure-key handoff blocker.

