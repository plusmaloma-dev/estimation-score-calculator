# Active Game Control and Continuity Checkpoint

**Date:** 25 July 2026  
**Branch:** `feature/online-game-bot-mvp`  
**Draft PR:** #14  
**Merge authorization:** Not granted

## Completed slices

### Lifecycle and host administration

- Initialize active control only from a started, settings-locked four-seat table.
- Permanent bot seats begin under permanent bot control.
- Host-only pause, resume, and confirmed termination.
- Pause freezes exact remaining turn and disconnect-grace durations.
- Resume reconstructs deadlines from frozen durations.
- Termination records actor/time, clears active clocks, and makes control state read-only.

### Connection continuity

- Disconnect starts the configured grace countdown once.
- Active host disconnect transfers host immediately to the longest-connected remaining human.
- Reconnecting the former host does not restore host privileges automatically.
- Grace expiry changes a human seat to temporary Standard bot control.
- Reconnect during grace retains human control.
- Reconnect after takeover waits for the next safe uncommitted action boundary.
- A bot action already marked processing is not interrupted.
- Permanent bot seats cannot be disconnected or reclaimed.

### Turn deadlines and one-action assistance

- Deterministic turn start and configured deadline generation.
- Connected-human deadline expiry emits one `timeout-assistant` directive.
- Disconnected humans during grace receive the same one-action assistance.
- Temporary and permanent bot seats emit immediate source-specific directives.
- Directive IDs are deterministic per table, turn, and seat.
- Re-evaluating a pending or processing turn emits no duplicate directive.
- Paused and terminated games emit no directives.
- Timeout assistance does not transfer seat ownership; the next human turn returns to normal control.

## TDD and CI evidence

| Task | RED | GREEN |
| --- | ---: | ---: |
| Lifecycle, pause/resume, termination | #760 | #766 |
| Disconnect, host transfer, takeover, reclaim | #767 | #769 |
| Turn deadlines and exactly-once bot directives | #770 | #774 |

CI run #774 passed repository typechecking, the complete test suite, and the production build.

## Implementation note

The public `ActiveGameControlEngine` is currently a focused turn-capable extension of the verified lifecycle/connection engine. This preserves the already-tested lifecycle core while the deadline slice is added. The classes can be consolidated during the final control-milestone refactor once command replay and persistence interfaces are stable.

## Next slices

1. Versioned and idempotent active-control commands.
2. Deterministic replay and tamper detection.
3. Supabase active-control schema and RPCs.
4. Typed online control service and Realtime authoritative reload.
