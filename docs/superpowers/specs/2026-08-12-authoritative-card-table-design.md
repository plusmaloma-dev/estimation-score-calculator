# Authoritative Player Scores and Card-Table Design

## Purpose

Replace the active game's stacked dashboard with a compact four-player card-table
experience. The screen must show the current trick, the authenticated viewer's
hand, the current action, each seat's Bid/Won/Score values, compact round
context, and a secondary score history without weakening gameplay authority or
privacy.

This design also closes two snapshot gaps: safe public display names and durable
cumulative scores. React must consume those values; it must not create them from
raw IDs, local history, or private round data.

## Fixed semantics

- **Bid** is the player's current-round estimate. For a caller, its value is the
  resolved contract trick count, not an auction-history entry.
- **Won** is the player's completed-trick count in the current round.
- **Score** is the authoritative cumulative table score through completed scored
  rounds only. It belongs to the table seat for the lifetime of that game, not
  to the transient human, bot, or control owner occupying that seat. An
  in-progress round does not affect it.
- **Round delta** remains a scored-round result and is not substituted for Score.
- The final post-auction estimator is a Risk candidate. The UI renders a Risk
  badge only from the authoritative risk result; it never infers actual Risk
  from the candidate position.

## Persistence and authority

### Authoritative score journal

Add one forward-only gameplay migration for a service-only, append-only
`gameplay_round_score_history` journal. Storage is one row per completed round:

- primary identity: `table_id` and `round_number`;
- immutable safe payload: exactly the four expected table seats, each with one
  integer score delta, indexed by seat only;
- completion timestamp and standard audit fields needed by the existing service
  boundary;
- unique `(table_id, round_number)` constraint.

The scoring command constructs this safe, seat-indexed record from the already
authoritative scored aggregate. In the same transaction that accepts the first
transition into `scored`, the gameplay RPC inserts the journal row. A duplicate
command remains idempotent through the existing command identity boundary. A
duplicate journal key is accepted only when its immutable payload exactly
matches the original; conflicting data fails closed and does not alter totals.
There is no update or overwrite path. Payload validation rejects missing,
duplicate, out-of-range, or non-integer seat deltas before any journal write.

No authenticated client receives direct table access or write access to this
journal. The existing service-role Function remains the only writer and reader
of private round state. The journal never stores player IDs, hands, cards,
deals, seeds, nonces, deck order, or display names.

Scores remain attached to their seats through reconnect, temporary-bot
substitution, takeover, and return to human control. A control-owner change
never transfers or resets a score. Display-name changes do not rewrite journal
history because history contains no player identity or name.

### Pre-journal tables

The journal cannot safely reconstruct a completed round once its private
aggregate has been replaced by a later round. This change performs no synthetic
or guessed backfill and does not present incomplete legacy history as complete.
Preserved Hosted-UAT evidence tables remain untouched. Acceptance of cumulative
Score and Score History uses fresh post-migration tables. Any production
strategy for already-progressed live games is a separate product and release
decision, outside this slice; this migration does not mutate their existing
hosted data.

### Server projection

The existing gameplay-round read path loads the safe journal entries in round
order and computes a running total by seat. It returns, for each completed
round, the seat delta and cumulative value after that round. It also returns the
latest cumulative total for every current seat.

The projection resolves display names from the existing authoritative table-seat
record, not from raw gameplay player IDs:

- viewer's human seat is labelled `You` in the presentation;
- other human seats expose their existing table `displayName`;
- permanent bots expose `Standard Bot {seat number}`;
- raw UUIDs, auth IDs, and internal bot identifiers remain internal only.

The public seat DTO includes safe `displayName`, `isBot`, current estimate,
tricks won, cumulative score, and authoritative role flags. Stable internal IDs
may remain in the transport for command and reconciliation logic but are not
rendered in normal gameplay UI.

## Public snapshot additions

The round snapshot gains only safe public information:

- seat presentation data and authoritative cumulative score;
- ordered score history with round number, per-seat delta, and per-seat running
  cumulative value;
- a numeric estimate-option model that distinguishes selectable values from
  unavailable values, including the stable exact-13 reason code
  `would_total_13`.

Unavailable options are not legal command options. React maps
`would_total_13` to localized explanatory copy and renders the value disabled;
it neither submits nor reinterprets that value.

The current private-hand rule remains unchanged: the snapshot includes only
`ownHand` for the authenticated viewer. Legal cards remain a subset of that
hand. Other seats expose card count only.

## Table presentation model

Retain `ActiveRoundPresentation` as the compatibility gate for active control
and round snapshots. Add a pure `GameplayTablePresentation` derived from the
compatible active-round presentation and public round snapshot. It owns display
arrangement only, not gameplay legality or scoring.

It derives:

- compact round context: round, dealer, caller, contract, trump, Under/Over,
  and actual Risk when available;
- four relative seat panels with name, You/bot marker, role badges, Bid, Won,
  and Score;
- current-trick number, relative card placement, active actor, and current
  winning seat from an authoritative `currentWinningSeat` projection field;
- retained last completed trick, including the final trick after scoring;
- phase-specific tray state and authoritative estimate/auction options;
- compact overall score strip and collapsible score-history data.

When snapshots are incompatible, the existing synchronization presentation
remains the sole source of state. The table shell remains mounted but suppresses
actionable controls and renders the neutral synchronization/retry treatment.
It never combines contradictory turn instructions.

The server/domain projection computes `currentWinningSeat` with the existing
authoritative trick primitive. `GameplayTablePresentation` and React only
render it; they do not compare trump, lead suits, or cards. Completed-trick
winners follow the same rule: presentation renders the authoritative recorded
winner and never recalculates it.

## UI structure

The stable active-game shell contains, in visual priority order:

1. a compact top bar for round context and overall cumulative scores;
2. a responsive four-seat table around the central current trick;
3. a compact retained last-trick strip;
4. the viewer's always-present hand;
5. a compact phase-specific action tray;
6. a collapsed-by-default Score History disclosure;
7. scored-round results and existing host lifecycle controls as secondary
   surfaces.

During auction, the tray shows the current highest contract and only
authoritative Pass, raise, and WITH actions. It never renders estimates.
During estimate, it shows other players' estimates and their total, numeric
options only, and a disabled exact-13 value with its server-projected reason.
It never renders trump or WITH controls. During play, the hand is the primary
control; only server-projected legal cards can be activated.

Routine compatible Realtime updates update the affected model fields without
keying or remounting the table shell, hand, or score-history disclosure. The
screen must not scroll the viewport or discard logical focus during those
updates.

## Rule and privacy invariants

The slice does not alter House Rules V1 scoring, Risk rules, auction legality,
dealer rotation, direction, caller-led first trick, winner-led later tricks, or
the existing HumanActionBoundaryCoordinator. It preserves the approved
post-auction estimate ordering. If implementation would require changing that
ordering, work stops for a product decision.

Existing JWT, RLS, service-only RPC, project-isolation, Realtime, and guarded
deployment paths remain in force. The score project and preserved hosted-UAT
evidence tables are out of scope.

## Testing and release gates

TDD begins with failing tests for journal idempotency/conflict behavior, safe
display-name projection, cumulative totals/history across reconnect and next
rounds, disabled exact-13 presentation, stable shell updates, and the
card-table seat/trick/action surfaces. Existing rule-order regressions run
unchanged.

Before release, run focused tests, typecheck, complete CI, isolation CI,
relevant Function and database tests, production gameplay build, and
`git diff --check`. An independent final review must contain no unresolved
Critical or Important finding. Only then may the bounded changes be committed,
pushed, CI-verified, and deployed through the guarded gameplay migration,
Function, and Vercel paths as applicable.
