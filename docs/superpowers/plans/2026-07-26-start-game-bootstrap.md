# Secure Start Game Bootstrap Implementation Plan

> **Execution status:** Tasks 1–5 completed on `feature/online-game-bot-mvp`. Live deployment and gameplay UAT remain separate release gates.

**Goal:** Make the host's Start Game action create a recoverable, secure, authoritative first round rather than only changing the lobby lifecycle.

**Architecture:** An authenticated Edge Function coordinates idempotent table Start, active-control initialization, secure private deal creation, private round-state initialization, and first-turn activation. A pure TypeScript bootstrap service generates the initial House Rules V1 state from a started four-seat table and an injected cryptographic seed source. Every server step uses a deterministic command identity derived from the original Start command so a retry resumes safely after a partial failure.

**Tech stack:** TypeScript, Web Crypto, `FairDealService`, `DeterministicRandomSource`, `HouseRulesRoundEngine`, Supabase Edge Functions, PostgreSQL RPCs, React, Vitest, and the Node test runner.

## Global constraints

- House Rules V1 only.
- One to four humans; permanent Standard bots fill all vacant seats.
- The browser never receives the seed, shuffled deck, other hands, or privileged server credentials.
- The server generates a fresh 256-bit seed with `crypto.getRandomValues`.
- No `Math.random()`, random sorting, modulo-biased selection, Node-only crypto, or `Buffer`.
- Initial dealer/caller is selected deterministically and without bias.
- The first caller is bid owner and first bidder; the next seat has first card lead.
- All Start sub-commands are idempotent and retryable.
- Direct table Start remains only as a compatibility fallback when secure bootstrap is unavailable.
- PR #14 remains draft and unmerged.

## Task 1: Pure secure bootstrap service — complete

- [x] Add private session/deal audit types.
- [x] Prove four-seat mapping, thirteen-card hands, dealer selection, bidding order, first lead, and deterministic reproduction.
- [x] Generate the fair deal and create the first House Rules V1 round.
- [x] Retain verification material privately and expose only the commitment.
- [x] Reject incomplete or malformed started tables.
- [x] RED #906 / GREEN #912.

## Task 2: Authenticated idempotent Start orchestration — complete

- [x] Add the dedicated `gameplay-start` Edge Function.
- [x] Resolve the authenticated actor server-side.
- [x] Accept only public table/version/command identity.
- [x] Start the table, initialize active control, initialize the private round, and start the first turn.
- [x] Generate cryptographic deal material only after checking for an existing round.
- [x] Use deterministic sub-command IDs for partial-retry recovery.
- [x] Return only a viewer-scoped initial round snapshot.
- [x] RED #913 / GREEN #915.

## Task 3: Typed browser Start and waiting-room wiring — complete

- [x] Add `OnlineGameplayRoundService.startGame(...)`.
- [x] Require a valid SHA-256 commitment in the successful Start snapshot.
- [x] Reject malformed and privacy-unsafe responses.
- [x] Keep Start optional at the app port boundary for compatibility adapters.
- [x] Prefer secure bootstrap in the waiting room.
- [x] Navigate only after a valid initial round.
- [x] Keep the host in the waiting room and display authoritative failures.
- [x] RED #917 / GREEN #922.

## Task 4: Opening bot kickoff and recovery — complete

- [x] Persist the generated first bidding turn as running.
- [x] Evaluate permanent-bot first bidders immediately.
- [x] Process the public directive through the private Standard bot boundary.
- [x] Reconstruct pending directives after navigation or reconnect.
- [x] Preserve the configured deadline for human first bidders.
- [x] Start-specific regression gate GREEN #923; underlying browser directive RED/GREEN #891/#894.

## Task 5: Delivery record and release gates — complete

- [x] Record implementation decisions, files, and RED/GREEN evidence.
- [x] Document the dealer/caller/first-lead baseline.
- [x] Update the project progress record to 96% implementation.
- [x] Create `docs/superpowers/reports/2026-07-26-start-game-bootstrap-delivery.md`.
- [x] Keep live database, RLS, Realtime, Edge runtime, and multi-browser testing as explicit release gates.
- [x] Run full repository validation after production changes: CI #923 passed. Documentation-only commits followed and require the normal branch CI check.

## Remaining release work

- Apply migrations to a real Supabase project and confirm PostgreSQL compilation.
- Deploy both gameplay Edge Functions.
- Configure a Vercel preview for the gameplay branch.
- Run a solo-versus-three-bots Start-to-score smoke test.
- Run multi-browser synchronization, timeout, disconnect, takeover, reclaim, pause/resume, and termination UAT.
- Complete multi-round progression and final deal reveal/verification UI.
