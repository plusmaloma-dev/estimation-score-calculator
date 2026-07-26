# React Gameplay Lobby and Table Delivery

**Date:** 26 July 2026  
**Branch:** `feature/online-game-bot-mvp`  
**Draft PR:** #14  
**Merge authorization:** Not granted

## Delivered scope

The authenticated React application now provides:

- an online-play entry point that is absent in local-only mode;
- public lobby discovery with authoritative table cards;
- public and private table creation;
- open-join and host-approval join policies;
- approved turn-timer and disconnect-grace settings;
- a four-seat waiting room;
- host-only settings and join-request decisions;
- guest join and request-to-join flows;
- Start navigation after the authoritative server fills vacant seats with permanent Standard bots;
- an active-game continuity shell showing lifecycle, turn, timer, connection, bot-control, takeover, and reclaim state;
- host-only pause, resume, and explicitly confirmed termination;
- Realtime invalidation subscription that reloads authoritative snapshots rather than trusting raw row payloads;
- authoritative reload after failed or ambiguous active-control mutations;
- responsive layouts for desktop, tablet, and mobile;
- English and Arabic navigation and control labels;
- static browser-source safeguards against hidden deal material and privileged credential references.

## TDD evidence

| Task | RED | GREEN |
| --- | ---: | ---: |
| Gameplay routes and authenticated service wiring | #795 | #804 |
| Lobby listing, creation, and refresh | #805 | #808 |
| Waiting room, joining, approvals, settings, and Start | #809 | #815 |
| Active continuity shell and host lifecycle controls | #816 | #820 |
| Responsive/accessibility and browser privacy contract | #821 | #823 |
| Screen-level Realtime subscription and authoritative refresh | #824 | #828 |

CI run #828 completed the full repository validation command: engine and application typechecking, the complete engine/UI test suite, and the production Vite build.

## Security and authority boundary

The React screens do not submit direct table-row writes. Mutations use the typed table and active-control RPC adapters with command IDs and expected versions. The Realtime channel is used only as an invalidation signal; the screen applies the result of `get_active_game_control_snapshot`, not the Realtime row payload.

The delivered active screen is intentionally continuity-only. It does not expose opponent hands, future deck order, shuffle seed, private hand rows, service-role credentials, or bot policy observations.

## Remaining release gates

1. Apply all gameplay migrations to a real Supabase PostgreSQL project.
2. Verify SQL compilation, RLS, transactional concurrency, idempotency, and Realtime publication with multiple authenticated sessions.
3. Implement the active bidding interface and server-authoritative bid commands.
4. Implement private-hand retrieval and legal card-play controls without hidden-card leakage.
5. Execute bot directives through the Standard policy and persist the resulting authoritative actions.
6. Complete round progression, score projection, completion, replay, and seed verification in the React experience.
7. Run multi-browser end-to-end gameplay UAT with one to four humans, disconnects, timeouts, takeover, and reclaim.

## Next implementation slice

The next slice is the **active round interaction UI**:

- private own-hand projection;
- public auction state;
- legal estimate selection with total-estimate validation;
- legal-card highlighting and follow-suit enforcement;
- authoritative command submission with idempotency and expected versions;
- pending bot-directive execution;
- trick resolution and round-score progression;
- reconnect reconstruction from the authoritative gameplay snapshot.

PR #14 remains draft and must not be merged until live Supabase integration and multi-session gameplay UAT pass.
