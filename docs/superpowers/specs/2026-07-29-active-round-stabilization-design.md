# Unified Active-Round Stabilization Design

**Date:** 2026-07-29
**Status:** Approved product behavior translated into an implementation-ready design
**Scope:** Egyptian Estimation online gameplay UAT on `feature/online-game-bot-mvp`

## 1. Purpose

The active gameplay screen currently presents the active-control projection and
the gameplay-round projection as separate sources of user instructions. This
design creates one authoritative presentation model while preserving the
existing ownership boundary:

- active control owns lifecycle, action ownership, action kind, active seat,
  deadline/countdown, and connection/control state;
- the round snapshot owns bidding, caller/trump, Under/Over, Risk, the
  authenticated viewer's private hand, tricks, and scoring;
- a backend transaction owns secure creation and activation of the next round.

The result is one coherent active-round experience from bidding through the
scored state. It does not change House Rules V1 scoring, automatically start a
round, impose a final round count, or expose any player's private state.

This specification supersedes
`docs/superpowers/plans/2026-07-28-bidding-hand-visibility.md`. The useful
viewer-hand work from that document is retained here as one part of the unified
delivery; the older document is not an independently executable plan.

## 2. Evidence from the current implementation

### 2.1 Confirmed presentation failure mode

`ActiveGameplayScreen.tsx` keeps `snapshot` and `roundSnapshot` in independent
React state. It performs separate initial reads, opens separate Realtime
subscriptions, and applies callbacks from those subscriptions independently.

The active-control section derives its action label, active seat, and countdown
from `OnlineActiveGameControlSnapshot`. At the same time:

- `GameplayBidPanel.tsx` derives and renders its own estimate-turn or waiting
  instruction from `OnlineGameplayRoundSnapshot`;
- `GameplayCardPanel.tsx` derives and renders its own card-turn or waiting
  instruction from `OnlineGameplayRoundSnapshot`;
- no coordinator proves that the two snapshots identify the same table, round
  version, action kind, active seat, or deterministic turn ID before both are
  rendered;
- no joint refresh is requested when an incompatible pair is observed.

Realtime delivery is not an atomic browser event across the two database
projections. A legitimate transition can therefore deliver the new round
snapshot with the old active-control snapshot, or the reverse. The
human-action-boundary coordinator correctly synchronizes the server transition,
but the browser can still show both generations simultaneously. The root cause
of the contradictory UI is the missing client presentation compatibility
boundary, not the already-fixed server human boundary.

The displayed countdown is also calculated only when React renders. It does not
have a local clock tick, so the number can remain visually unchanged until
another state update.

### 2.2 Confirmed round data already available

The current round projection already contains:

- the authenticated viewer's `ownHand` during bidding and card play;
- bids, the caller seat, contract suit, bid order, current turn, legal cards,
  current trick, completed tricks, trick counts, and scored results;
- no other seat's private hand.

The bidding panel simply does not render `ownHand`. The final trick is also not
lost by the engine: trick 13 is appended to `completedTricks`, then
`currentTrick` is cleared. The scored card panel reads the cleared current trick
and displays the opening-card empty state instead of selecting the last
completed trick.

These two findings require presentation changes, not new private-state storage.

### 2.3 Confirmed next-round backend gap

The current start path creates round 1 only. It:

- creates a fresh secure deal on the server;
- chooses the initial dealer/caller through the existing bootstrap behavior;
- persists the initial private aggregate;
- initializes the first active-control bid turn.

The current round-command path accepts bid, card, and bot commands only. The
round commit RPC mutates an existing aggregate, and the round initializer
rejects a second state for the same table. There is no application method, Edge
Function action, or RPC that replaces a scored aggregate with a fresh next
round.

Active control is left active but without a pending turn after scoring. Starting
an active turn and replacing the private aggregate through separate calls would
allow a half-transition if either call failed. It would also make concurrent
host attempts unsafe.

### 2.4 Versioning constraint

`GameplayRoundRealtimeSynchronizer` ignores lower round versions and the
invalidation stream is keyed by table and version. Replacing the scored
aggregate with a new round whose version resets to zero would be treated as
stale by a connected client. The next round must therefore:

- increment `roundNumber`;
- keep `roundVersion` monotonic across the table session;
- publish a new invalidation with that monotonic version.

## 3. Product invariants

The implementation must preserve all of the following:

1. Exactly one action banner is authoritative.
2. The banner and its prominent countdown come from active control only after
   compatibility with the round projection is proven.
3. During bidding, the viewer sees all 13 cards in their own hand as read-only.
4. No view, projection, Realtime payload, error, log, fixture, or command ledger
   contains another seat's hand, the deck order, seed, nonce, or private
   aggregate.
5. Every estimate is visibly attached to a seat. The authenticated seat is
   labelled as the viewer.
6. Caller, numeric estimate, and trump are separate values.
7. The current estimate total and Under/Over state remain visible throughout
   bidding and card play.
8. A completed set of four accepted estimates never totals 13. While bidding is
   incomplete, a partial total of 13 is displayed as an interim state whose
   final estimate must move it Under or Over; the server's legal-estimate rule
   remains authoritative.
9. The applicable Risk seat and state/type are explicit.
10. Trick 13 remains visible with its winner in the scored state.
11. The scored results remain visible until the host starts the next round or
    terminates the game.
12. Only the host can start the next round.
13. Non-host humans see “Waiting for host to start the next round.”
14. Starting a next round is explicit, idempotent, rejects stale or concurrent
    attempts, rotates using the existing House Rules V1 baseline, preserves the
    score-derived next-round multiplier, and creates a fresh secure deal.
15. No round starts automatically. There is no fixed final-round count.
16. The current terminate flow remains the way to end the game.
17. The deployed human-action-boundary coordinator remains in the command path.

## 4. Options considered

### Option 1: UI coordinator plus sequential existing backend calls

Add the presentation model, then initialize a new round and start the first
active turn through two separate calls.

This is the smallest code diff, but it is not safe. The existing initializer
cannot replace the singleton round row, and even if extended, two writes can
leave active control and the private aggregate on different rounds. It also
does not provide one idempotency boundary for simultaneous host clicks.

**Decision:** Rejected.

### Option 2: Pure presentation coordinator plus one transactional next-round RPC

Keep the two authoritative snapshots and their existing Realtime channels. Add a
pure presentation coordinator that rejects incompatible pairs. Add one
service-role-only transaction, reached through the authenticated
`gameplay-round-command` function, to replace the scored aggregate and activate
its first bid turn atomically.

This preserves the current architecture and human boundary, adds only the
missing transaction, and avoids a broader projection rewrite.

**Decision:** Selected as the smallest safe design.

### Option 3: New combined server projection and combined Realtime stream

Create a third persisted/read model containing both active control and public
round state, then move the screen to a single subscription.

This could simplify presentation reads, but it duplicates authoritative state,
requires more schema, synchronization, RLS, and migration work, and is not
needed to solve the observed UAT problem.

**Decision:** Rejected as unnecessary scope.

## 5. Selected client architecture

### 5.1 Pure `ActiveRoundPresentation`

Add `src/app/gameplay/ActiveRoundPresentation.ts`. It has no React, network,
storage, or clock side effects.
`createActiveRoundPresentation(input)` accepts:

- the active-control snapshot or `undefined`;
- the gameplay-round snapshot or `undefined`;
- authenticated viewer ID;
- current time in milliseconds.

It returns an immutable presentation containing:

- `phase`;
- `roundNumber`;
- `viewerSeat`;
- seat connection/control state by seat;
- `viewerActionRequired`;
- `activeSeat`;
- `actionKind`;
- `countdownSeconds`;
- `estimatesBySeat`;
- caller seat;
- caller numeric estimate;
- trump;
- total estimated tricks;
- Under/Over state and distance from 13;
- Risk seat and Risk type/state;
- current trick;
- last completed trick;
- scored results;
- viewer's own hand and legal card IDs;
- `canStartNextRound`;
- `isSynchronizing` and a privacy-safe synchronization reason/key.

The public UI components consume this model. They do not independently decide
whose turn it is.

### 5.2 Presentation phases

The phase is one of:

- `loading`: one or both initial reads are not available;
- `synchronizing`: both are available but incompatible;
- `bidding`;
- `playing`;
- `scored`;
- `paused`;
- `terminated`.

`paused` keeps the compatible round context visible, disables all round
actions, and displays the authoritative frozen `remainingMs`. `terminated`
follows active-control lifecycle ownership and keeps any safe final context
read-only.

### 5.3 Compatibility contract

Compatibility is tested before an actionable phase is exposed:

1. Both snapshots belong to the requested table.
2. For a bidding round, active control has a bid turn at
   `roundSnapshot.nextBidSeat`.
3. For a playing round, active control has a card turn at
   `roundSnapshot.currentTurnSeat`.
4. The active turn ID exactly equals the deterministic turn ID already produced
   by the human-boundary path:

   `round-{roundNumber}:{actionKind}:{roundVersion}:{seat}`

5. A scored round is compatible only when active control has no pending turn.
6. Paused control must retain the turn that matches the round projection.
7. A terminated lifecycle never exposes an actionable round control.

Matching only action kind and seat is insufficient: two adjacent generations
can have the same seat and action. The exact turn ID binds the active-control
generation to round number and version.

When compatibility fails:

- render only the neutral action banner “Synchronizing round state…”;
- keep submit and card controls absent or disabled;
- do not render a competing waiting/turn instruction;
- trigger a deduplicated refresh of both authoritative services keyed by the
  incompatible pair;
- remain neutral until a compatible pair arrives.

The refresh loop records only table ID and public versions/turn ID. It never logs
snapshot payloads.

### 5.4 Authoritative action banner and clock

Add `GameplayActionBanner.tsx`. It is the only gameplay instruction with
`role="status"`. It supports these mutually exclusive public states:

- viewer must submit an estimate;
- viewer must play a card;
- waiting for a named seat;
- automated seat is processing;
- game paused;
- synchronizing;
- round scored;
- game terminated.

The countdown is visually prominent. While active, the screen updates a local
`nowMs` once per second and the pure presentation recalculates from the
active-control deadline. While paused, it displays the server-projected
`remainingMs`. Realtime refresh remains the authority for timeout transitions;
the local clock never submits or advances an action.

`GameplayBidPanel` and `GameplayCardPanel` lose their independent turn/waiting
status messages. They receive explicit enabled state and callbacks derived from
the presentation.

### 5.5 Round status

Add `GameplayRoundStatus.tsx`, visible during bidding, playing, and scored
states. It renders:

- one estimate item per seat in seat order;
- a clear viewer marker and the existing human/bot seat descriptor;
- pending state for seats that have not estimated;
- caller identity separately from the caller's numeric estimate;
- trump separately from caller and estimate;
- the live total;
- `Under by N`, `Over by N`, or the incomplete-bidding interim state;
- the sequence Risk seat throughout the round;
- `Pending` during incomplete bidding and the authoritative `round-risk` result
  after all estimates are accepted/scored.

The round projector will expose the Risk seat explicitly from the established
bid order rather than requiring React components to duplicate turn-order
rules. At scoring, the presentation uses the authoritative per-seat score
result Risk type.

### 5.6 Viewer hand

Add `GameplayHand.tsx` and use it from both bid and card panels:

- bidding: all viewer cards are fully legible, read-only, and not focusable as
  actions;
- card play: only server-projected legal cards become enabled, and only when
  the compatible presentation says the authenticated viewer must act;
- scored, paused, or synchronizing: cards are read-only;
- the component accepts only `ownHand`; it has no prop for another seat's hand.

### 5.7 Trick and scored result presentation

Add `GameplayFinalTrick.tsx`. In the scored state it renders
`completedTricks.at(-1)`, including all four seat/card associations and the
winner. The empty current trick is never described as waiting for an opening
card after scoring.

Refactor `GameplayRoundResultPanel.tsx` into a responsive seat-card layout:

- round result summary and multiplier at the top;
- one result card per seat with estimate, actual tricks, made/lost outcome,
  base/round score, and Risk;
- the viewer and caller are labelled;
- semantic headings/list structure remain accessible at narrow widths.

### 5.8 Next-round panel

Add `GameplayNextRoundPanel.tsx`, rendered only for a compatible scored state:

- host: an enabled “Start Next Round” button unless a request is pending;
- non-host human: “Waiting for host to start the next round.”;
- bots have no browser control;
- no timer or effect invokes the command automatically.

On success, the returned viewer-scoped round snapshot may be applied
immediately. Until active-control Realtime reaches the matching first bid turn,
the presentation intentionally shows synchronization. A joint refresh provides
a fallback if either notification is delayed.

## 6. Round projection additions

Extend `OnlineGameplayRoundSnapshot` with public, non-secret fields needed by
the coordinator:

- explicit sequence Risk seat;
- enough public round identity to form/verify the deterministic turn ID
  (`roundNumber` and current `version` already exist);
- no private field beyond the existing viewer-scoped `ownHand`.

Risk-seat projection comes from the authoritative aggregate's established
`bidOrder`. It does not alter Risk scoring. The parser rejects malformed public
values and continues to validate `ownHand` as the authenticated viewer's
projection.

No other hand, seed, nonce, shuffled deck, or full private aggregate is added to
the snapshot.

## 7. Selected backend next-round design

### 7.1 Application and service boundary

Extend the gameplay round port and `OnlineGameplayRoundService` with this
method:

```ts
startNextRound(
  input: OnlineGameplayStartNextRoundInput,
): Promise<OnlineGameplayRoundSnapshot>
```

`OnlineGameplayStartNextRoundInput` contains exactly `tableId`,
`expectedRoundNumber`, `expectedRoundVersion`, `expectedControlVersion`, and an
opaque unique `commandId`. The browser supplies no dealer, cards, seed, nonce,
deck, or multiplier.

`gameplay-round-command` gains `action: "start-next-round"`. The function:

1. authenticates normally with JWT verification enabled;
2. derives the caller from the authenticated token;
3. checks the privacy-safe active command ledger for an already committed
   matching command ID; if found, it reads and returns the current viewer-scoped
   snapshot without generating a replacement deal;
4. reads and validates the scored private aggregate through the service-role
   path;
5. verifies the existing host/table membership path;
6. derives the next dealer/order and multiplier using the existing House Rules
   V1 application services;
7. creates a new server-side 256-bit seed, deal ID, and nonce;
8. generates and validates a fresh 52-card deal;
9. invokes the new transaction;
10. returns only the authenticated viewer's projected snapshot.

The function never accepts client-provided deal material.

### 7.2 Rotation and multiplier

The existing baseline is retained:

- the next dealer/caller is `(previous bidOwnerSeat + 1) % 4`;
- bid order is rebuilt by the existing bootstrap behavior from that dealer;
- first lead and play order use the existing bootstrap mapping;
- `roundNumber` increments by one;
- the previous scored result's `nextRoundMultiplier` becomes the new round's
  `roundMultiplier`.

The first-round random-dealer behavior remains unchanged. The bootstrap service
is extended to accept an explicit dealer for a subsequent round, rather than
duplicating ordering logic in the Edge Function.

No scoring formula, legal-estimate rule, Risk rule, or card-play rule changes.

### 7.3 Transactional RPC

Add one forward-only migration to both the root migration mirror and the
isolated gameplay workspace. It creates the service-role-only RPC
`start_next_gameplay_round`.

Within one database transaction, the RPC:

1. locks the active-control row and private round-state row for the table;
2. checks the active command ledger for the command ID;
3. for an already-committed identical command, returns the committed public
   transition without validating the now-advanced round or applying the
   caller's newly generated private payload;
4. rejects command-ID reuse for a different command;
5. verifies the table is active, the authenticated actor recorded by the
   function is the host, the round is scored, and no active turn remains;
6. checks expected round number, expected round version, and expected
   active-control version;
7. rejects stale or concurrent expected versions;
8. replaces the private aggregate with the validated fresh aggregate;
9. assigns `roundVersion = previousRoundVersion + 1`;
10. inserts the matching round invalidation;
11. creates the first bid turn with the deterministic turn ID;
12. increments active-control version;
13. records privacy-safe active command/event metadata;
14. returns public version/turn metadata required for projection refresh.

The command/event payload may contain table ID, round number, public versions,
action kind, active seat, and command ID. It must never contain the private
aggregate, deal material, hands, or card order.

The existing unique command constraint supplies idempotency, row locks serialize
concurrent host attempts, and expected versions reject a stale browser.

### 7.4 Why a migration is required

A schema table change is not required. A forward-only database migration is
required because:

- the singleton private round row must be replaced rather than inserted;
- the current commit RPC supports only mutations inside the current round;
- round invalidation and active-control activation must commit atomically;
- current application calls cannot provide that atomicity;
- idempotency and stale/concurrent rejection must be enforced under database row
  locks, not only in a browser or Edge Function.

The migration is additive: it introduces an RPC over existing tables and
ledgers. It does not add a parallel gameplay state store.

### 7.5 Realtime and reconnect

The transaction updates the active-control row and inserts a monotonic round
invalidation. The existing two Realtime synchronizers therefore continue to
refresh their own authoritative sources.

Reconnect behavior is deterministic:

- scored round: scored snapshot plus no pending active turn is compatible, so
  the final trick, results, and next-round state reappear;
- newly started round: the browser remains neutral until it has both the new
  round version and exact new active turn ID;
- if the first bidder is a bot, the existing bot directive coordinator resumes
  only after the compatible active turn exists;
- if either stream is missed, the presentation mismatch causes a deduplicated
  refresh of both sources.

## 8. Security and privacy

The security boundary remains server-side and viewer-scoped:

- JWT verification stays enabled;
- all host authorization is rechecked on the server and in the transaction;
- only service role can read/write the private aggregate or execute the new RPC;
- only the authenticated viewer's hand is projected;
- no secrets or private cards enter active-control rows, invalidations,
  command/event ledgers, browser logs, errors, or test output;
- same-command idempotency is resolved before a retry can overwrite the
  committed deal;
- malformed or stale inputs fail with privacy-safe error codes;
- total estimates remain constrained by the existing engine, including the rule
  that four accepted estimates cannot total 13.

## 9. Deployment and rollback

No hosted mutation or deployment belongs to the planning phase.

Implementation adds a guarded migration deployment wrapper in
`scripts/isolation/` and a package command. The wrapper must:

1. run the existing gameplay target guard;
2. require the isolated `supabase-gameplay` workspace;
3. confirm the linked ref is `stedjwppoanbmhxsfhcg`;
4. compare pending migrations against an exact allowlist containing only the
   reviewed next-round migration;
5. run the linked migration push from the isolated workspace;
6. verify the remote migration list afterward.

It must reject the prohibited score project and any root-workspace deployment.
Function deployment continues through the guarded gameplay-function wrapper;
Vercel deployment continues through the guarded gameplay-Vercel wrapper.

After explicit approval, deployment order is:

1. additive gameplay RPC migration;
2. `gameplay-round-command`;
3. gameplay Vercel build.

Rollback redeploys the preceding Edge Function and Vercel artifacts. The unused
additive RPC can remain deployed; no destructive down migration is required.
Rollback cannot reconstruct a round already explicitly started, so hosted UAT
uses only fresh disposable tables.

## 10. Hosted UAT acceptance matrix

All hosted tests create new tables. Preserved failed/retest/completed evidence
tables are read-only and are never reused, repaired, terminated, or deleted.

### Fresh solo table

1. Host starts a new solo-versus-three-bots table.
2. During each bidding boundary, verify all 13 viewer cards remain visible and
   read-only.
3. Verify one action banner, a ticking prominent countdown, correct active seat,
   and no competing instruction.
4. Verify estimates are attached to seats and caller/trump/numeric estimate are
   separate.
5. Verify live total, Under/Over distance, and Risk remain visible through bid
   and card play.
6. Complete 13 tricks and verify trick 13 and its winner remain visible.
7. Verify the improved result layout and host-only Start Next Round control.
8. Reload while scored and verify the same final trick/results return.
9. Start the next round once, verify fresh cards, incremented round number,
   correct dealer/caller/order rotation, carried multiplier, and first bid turn.
10. Retry the same command ID and verify no second round/deal is created.
11. Attempt a stale/concurrent start and verify it is rejected without partial
    state.
12. Continue into the next round and verify the human-boundary coordinator and
    bots still advance correctly.

### Fresh four-browser table

1. Use four authenticated human browsers on a newly created table.
2. At every turn, verify only one browser is actionable and all others show the
   same authoritative waiting seat.
3. Verify each browser sees only its own private hand.
4. Introduce refresh/reconnect during bidding, playing, scored, and immediately
   after Start Next Round; verify neutral synchronization rather than a
   contradictory action.
5. Verify only the host sees Start Next Round and non-hosts see the approved
   waiting text.
6. Race two host start requests and verify one committed transition.
7. Confirm all browsers receive the new round and exact first bid turn by
   Realtime or fallback refresh.
8. Confirm no automatic third round starts and host termination remains the
   explicit end-game path.

## 11. Out of scope

- changing House Rules V1 scoring or Risk formulas;
- changing the total-estimates rule;
- introducing a final round count or automatic progression;
- retaining a browseable history of every completed trick/result after the host
  deliberately starts the next round;
- redesigning table creation, authentication, player directory, or score
  calculator;
- modifying the score-UAT checkout, score Supabase project, or another worktree;
- deploying, pushing, merging, or mutating hosted data during planning.

## 12. Acceptance summary

This design satisfies the approved architecture with a pure client coordinator
and one additive transactional backend capability. It preserves existing
authoritative sources, the deployed human-action boundary, secure viewer-only
projection, existing rotation/scoring behavior, guarded isolation, and explicit
host control over an unbounded sequence of rounds.
