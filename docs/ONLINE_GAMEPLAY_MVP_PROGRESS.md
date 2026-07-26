# Online Gameplay and Computer-Player MVP Progress

**Product approval:** 25 July 2026  
**Latest implementation update:** 26 July 2026  
**Approval scope:** Design, implementation plans, and recommended subsequent implementation decisions approved without additional routine scope gates  
**Implementation branch:** `feature/online-game-bot-mvp`  
**Draft implementation PR:** #14  
**Merge authorization:** Not granted for `main`

## Approved baseline

- House Rules V1 only.
- Real-time four-seat online play.
- One to four human players.
- Standard bots fill vacant seats when the host starts.
- Connected-player timeout produces one bot action only.
- Disconnected-player grace expiry produces temporary bot takeover.
- Returning human reclaims at the next safe uncommitted action boundary.
- Private and public tables with open or host-approved public joining.
- Secure, deterministic, verifiable thirteen-card dealing.
- Exact-estimate bot objective.
- Existing House Rules V1 scoring engine remains authoritative.

## Core implementation decisions

- Web Crypto HMAC/SHA-256 with rejection sampling; no `Math.random()`, random sorting, modulo bias, Node-only crypto, or `Buffer`.
- Explicit bidding/play seat orders and immutable transitions.
- Versioned, idempotent commands with recorded accepted/rejected outcomes.
- Privacy-safe bot observations containing only own hand, legal actions, and public state.
- Deterministic Acquire, Control, Dump, Recovery, and Endgame card modes.
- Normalized 0–13 trick probabilities and House Rules V1 bid expected utility.
- Audited hard-deadline/error fallback for all bot decisions.
- Public/private clients use typed RPC or Edge Function adapters and allow-listed projections.
- Active timers use supplied ISO timestamps; domain services never call `Date.now()`.
- Pause/resume stores exact remaining durations.
- Bot directives contain public work identity only; private observations remain server-side.
- Realtime row changes are invalidation signals; clients reload authoritative snapshots.
- Failed or ambiguous mutations reload authoritative state before another mutation.
- Failed CI runs retain downloadable validation logs.

## Completed milestones

| Task | Result | CI evidence |
| --- | --- | --- |
| Engine — secure deal, legal play, scored round, commands, replay | Complete | #663–#695 |
| Standard bot — observation, bid/card policy, fallback, full-round simulation | Complete | #699–#720 |
| Table/lobby — lifecycle, joining, bot filling, commands, Supabase definitions | Complete | #735–#755 |
| Active control — timers, takeover/reclaim, commands, replay, Supabase/Realtime | Complete | #760–#802 |
| React lobby/waiting room/continuity — routes, tables, Start UI, controls, responsive layout | Complete | #795–#828 |
| Active round foundation — private projection, Edge Function persistence, bidding UI | Complete | Existing branch validation through #866 |
| Card-play panel and authoritative submission | Complete | RED #872 / GREEN #876 |
| Public directive coordinator | Complete | RED #877 / GREEN #878 |
| Private Standard-bot directive decision and audit | Complete | RED #879 / GREEN #885 |
| Typed public bot-directive invocation | Complete | RED #886 / GREEN #887 |
| Secure server-side bot orchestration | Complete | RED #888 / GREEN #890 |
| Browser deadline/directive orchestration and reconnect recovery | Complete | RED #891 / GREEN #894 |
| Multi-client round Realtime synchronization | Complete | RED #895 / GREEN #899 |
| Authoritative scored-round results panel | Complete | RED #900 / GREEN #903 |

## Delivered active-round capabilities

- Viewer-scoped snapshots expose only the authenticated seat's hand and public state.
- Legal estimates are supplied by the authoritative engine; the final estimate cannot make the total equal 13.
- Legal cards are supplied by the server and enforce follow-suit.
- Human bids and cards carry expected versions and idempotency command IDs.
- Rejected or ambiguous commands trigger an authoritative reload.
- Public round invalidations trigger scoped Realtime reloads across clients.
- Permanent, temporary, and timeout-assistant bot directives execute through the Standard bot server boundary.
- Bot decisions retain policy version, reason, legal actions, duration, fallback status, source, directive ID, and turn ID in private audit metadata.
- Directive retries use deterministic command identities and do not recalculate completed actions.
- Reconnect can recover an assistant-pending or bot-processing directive from public turn identity.
- Trick progress, cards played, tricks won, and scored-round results are rendered without hidden-hand leakage.

## Current progress

| Area | Progress |
| --- | ---: |
| Research and approved design | 100% |
| Gameplay engine core | 100% |
| Standard bot policy and simulation | 100% |
| Online table/lobby domain and commands | 100% |
| Active-game continuity and command replay | 100% |
| Active-round backend, private projection, commands, and Realtime | 100% |
| React bidding, card play, bot orchestration, and round results | 100% |
| Start Game secure session bootstrap | 0% |
| Multi-round progression and final deal reveal/verification | 35% |
| Live Supabase migration/RLS/RPC/Edge Function verification | 0% |
| Multi-browser gameplay UAT | 0% |
| **Overall gameplay MVP implementation** | **93%** |

## Verification note

Repository CI #903 passed typechecking, all engine and React tests, and the production build after the active-round results delivery.

The SQL migrations and Edge Function contracts are statically validated but have not been applied or executed against a local or hosted Supabase PostgreSQL project in this workstream. PostgreSQL compilation, transaction behavior, RLS behavior, Realtime publication, Edge Function runtime behavior, and multi-session integration remain release gates.

## Start audit finding

`start_gameplay_table` currently performs only the lobby transition:

1. validates the host and pending requests;
2. fills vacant seats with permanent Standard bots;
3. locks settings;
4. marks the table active.

It does **not** yet:

- generate and persist the secure deal and pre-game commitment;
- initialize `gameplay_active_controls` and seat-control ownership;
- initialize the private `gameplay_round_states` aggregate;
- start the first bidding turn and timer;
- trigger the first permanent-bot action when applicable.

The UI therefore must not be described as end-to-end playable until this bootstrap is implemented and live-verified.

## Active next milestone

Implement an idempotent authenticated Start Game bootstrap:

1. run the existing table Start command;
2. initialize active control and four seat-control records;
3. generate a fresh 256-bit seed, nonce, deal ID, commitment, deterministic dealer, and fair deal server-side;
4. persist private deal audit data and the initial House Rules V1 round aggregate;
5. start the first bidding turn with the configured timer;
6. issue and execute a permanent-bot directive when the first seat is a bot;
7. return the host's scoped initial round snapshot;
8. add partial-failure recovery and retry-safe command identities;
9. apply migrations/functions and run multi-browser UAT.
