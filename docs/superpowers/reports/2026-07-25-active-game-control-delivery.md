# Active Game Control and Continuity Delivery Report

**Date:** 25 July 2026  
**Branch:** `feature/online-game-bot-mvp`  
**Draft PR:** #14  
**Merge authorization:** Not granted

## Delivered scope

### Active lifecycle and host administration

- Initialize control only from a started, settings-locked four-seat gameplay table.
- Permanent bot seats start under permanent bot control.
- Host-only pause, resume, and confirmed termination.
- Pause stores exact remaining turn and disconnect-grace durations.
- Resume reconstructs deadlines from the frozen durations.
- Termination records actor/time, clears active clocks, and makes the control state read-only.

### Connection continuity

- Disconnect starts the configured grace countdown exactly once.
- Active host disconnection immediately transfers host privileges to the longest-connected remaining human.
- Reconnecting the former host does not restore host privileges automatically.
- Grace expiry transfers only temporary seat control to a Standard bot.
- Reconnect during grace retains human control.
- Reconnect after takeover marks reclaim pending without interrupting a processing bot action.
- The human reclaims at the next safe uncommitted action boundary.
- Permanent bot seats cannot be disconnected or reclaimed.

### Turn deadlines and bot assistance

- Deterministic turn clocks use the locked table timer.
- Connected-human expiry emits exactly one timeout-assistant directive.
- Repeated human timeouts remain one action per expired turn without seat takeover.
- Disconnected humans during grace receive the same one-action assistance.
- Temporary and permanent bot turns emit immediate source-specific directives.
- Directive IDs are deterministic by table, turn, and seat.
- Paused and terminated games emit no directives.

### Versioned commands and replay

- Commands cover lifecycle, connection, grace, deadline, turn, bot-processing, and action-boundary transitions.
- Accepted commands increment the version exactly once.
- Stale and domain-rejected commands retain the authoritative version and remain recorded.
- Same command ID and envelope returns the original outcome.
- Same command ID with a different envelope is rejected as an integrity conflict.
- Deadline directives, events, and state transitions are replayable and tamper-checked.
- Accepted version gaps, duplicate resulting versions, modified events, modified directives, and altered transition state are detected.

### Supabase persistence and security definitions

- Active controls, seat controls, and idempotent command records.
- Workspace-scoped read policies with no direct authenticated writes.
- Realtime publication definitions for control and seat invalidations.
- Security-definer RPCs for initialization, lifecycle, connection, grace, deadlines, turns, bot processing, boundaries, and snapshots.
- Actor binding to `auth.uid()`, fixed search paths, expected-version checks, host checks, and command payload conflict detection.
- Safe snapshots contain control metadata only and exclude cards, hands, deal seed, shuffled deck, future cards, and unpublished bot policy decisions.

### Typed online service and Realtime synchronization

- Strict typed parsing for controls, seats, turns, events, and directives.
- Session workspace and actor injection for every RPC.
- Invalid client input fails before database invocation.
- Database errors, domain rejections, and incomplete snapshots cannot report success.
- One Realtime channel per active table.
- Realtime row messages are invalidation signals only; authoritative state is reloaded through the snapshot RPC.
- Concurrent invalidations are coalesced into one follow-up refresh.
- Failed or ambiguous mutations reload authoritative state before another mutation may start.
- Unsubscribe cleanup prevents stale channel callbacks from publishing state.

## TDD and CI evidence

| Task | RED | GREEN |
| --- | ---: | ---: |
| Lifecycle, exact pause/resume freeze, confirmed termination | #760 | #766 |
| Disconnect, host transfer, takeover, reconnect, safe reclaim | #767 | #769 |
| Deterministic deadlines and exactly-once bot directives | #770 | #774 |
| Versioned commands, directives, replay, and tamper detection | #779 | #784 |
| Active-control schema, RLS, RPCs, and migration ordering | #785 | #789 |
| Typed control service and authoritative Realtime synchronization | #792 | #802 |

The final branch mirror passed typechecking, the complete test suite, and the production build. CI was split into explicit Typecheck, Run tests, and Build production bundles steps to preserve the same validation contract while making future failures easier to diagnose.

## Verification limitation

The SQL migrations are statically validated and included in deterministic deployment order. They have not yet been applied to a local or hosted Supabase PostgreSQL instance. PostgreSQL compilation, transaction behavior, RLS behavior, publication behavior, and multi-session integration remain release gates.

## Deferred to the next milestone

- Apply and verify all gameplay migrations against Supabase.
- Wire real Supabase Realtime channels in the deployed application.
- Build the React public lobby, private invite flow, waiting room, and active-game table.
- Connect human bids/cards and bot directives to authoritative gameplay commands.
- Display timers, disconnect grace, takeover, reclaim, pause/resume, termination, and score progression.
- Execute multi-browser and multi-user gameplay UAT.
