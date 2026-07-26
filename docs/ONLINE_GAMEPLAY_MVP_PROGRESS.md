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
- Public/private table clients use typed RPC adapters and allow-listed projections rather than direct row writes or object spreading.
- Active timers use supplied ISO timestamps; domain services never call `Date.now()`.
- Pause/resume stores exact remaining durations rather than recomputing elapsed time heuristically.
- Bot-action directives are deterministic invalidation/work instructions and never contain hidden cards or policy observations.
- Realtime row changes are invalidation signals; clients reload authoritative snapshots.
- Failed or ambiguous active-control mutations reload authoritative state before another mutation.
- Failed CI runs retain a downloadable validation-log artifact.

## Completed milestones

| Task | Result | CI evidence |
| --- | --- | --- |
| Engine Task 1 RED/GREEN — secure deal | Complete | #663 / #673 |
| Engine Task 2 RED/GREEN — legal play and trick resolution | Complete | #675 / #679 |
| Engine Task 3 RED/GREEN — complete scored House Rules round | Complete | #682 / #687 |
| Engine Task 4 RED/GREEN — authoritative versioned commands | Complete | #688 / #691 |
| Engine Task 5 RED/GREEN — deterministic verified replay | Complete | #692 / #695 |
| Bot Task 1 RED/GREEN — private observation and legal card policy | Complete | #699 / #703 |
| Bot Task 2 RED/GREEN — exact-trick probability model | Complete | #704 / #708 |
| Bot Task 3 RED/GREEN — House Rules bid expected utility | Complete | #709 / #712 |
| Bot Task 4 RED/GREEN — audited timeout/error fallback | Complete | #713 / #716 |
| Bot Task 5 RED/GREEN — seeded four-bot full-round simulation | Complete | #717 / #720 |
| Table Task 1 RED/GREEN — lifecycle, settings, open joining, host succession, bot filling | Complete | #735 / #738 |
| Table Task 2 RED/GREEN — approval-required requests and host decisions | Complete | #739 / #741 |
| Table Task 3 RED/GREEN — versioned/idempotent table commands | Complete | #742 / #745 |
| Table Task 4 RED/GREEN — Supabase schema, RLS, RPCs, safe snapshots | Complete | #746 / #750 |
| Table Task 5 RED/GREEN — typed online gameplay table service | Complete | #751 / #753 |
| Table Task 6 RED/GREEN — allow-listed lobby/member/host projections | Complete | #754 / #755 |
| Control Task 1 RED/GREEN — lifecycle, timer freeze/resume, confirmed termination | Complete | #760 / #766 |
| Control Task 2 RED/GREEN — disconnect, active host transfer, takeover, reclaim | Complete | #767 / #769 |
| Control Task 3 RED/GREEN — deterministic turn deadlines and bot directives | Complete | #770 / #774 |
| Control Task 4 RED/GREEN — versioned commands, replay, and tamper detection | Complete | #779 / #784 |
| Control Task 5 RED/GREEN — active-control schema, RLS, RPCs, and publication definitions | Complete | #785 / #789 |
| Control Task 6 RED/GREEN — typed control service and authoritative Realtime reload | Complete | #792 / #802 |
| React Task 1 RED/GREEN — gameplay routes and authenticated service wiring | Complete | #795 / #804 |
| React Task 2 RED/GREEN — lobby listing, creation, and refresh | Complete | #805 / #808 |
| React Task 3 RED/GREEN — waiting room, joining, approvals, settings, and Start | Complete | #809 / #815 |
| React Task 4 RED/GREEN — active continuity shell and host lifecycle controls | Complete | #816 / #820 |
| React Task 5 RED/GREEN — responsive/accessibility and browser privacy contract | Complete | #821 / #823 |
| React Task 6 RED/GREEN — screen-level Realtime subscription | Complete | #824 / #828 |

## Delivered gameplay, bot, table, control, and React APIs

- `FairDealService.deal(input)` / `verify(record)`
- `LegalCardPlayService.legalCards(...)` / `validate(...)`
- `TrickResolutionService.resolve(...)`
- `HouseRulesRoundEngine.create(...)` / `submitBid(...)` / `playCard(...)`
- `GameplayCommandProcessor.process(...)`
- `GameplayReplayService.replay(...)`
- `BotObservationService.createCardObservation(...)`
- `StandardCardPolicy.decide(...)`
- `HandStrengthEvaluator.evaluate(...)`
- `StandardBidPolicy.decide(...)`
- `StandardBotPolicy.decideBid(...)` / `decideCard(...)`
- `BotSimulationService.simulateRound(...)`
- `GameplayTableEngine.create(...)` / `updateSettings(...)` / `joinOpenTable(...)`
- `GameplayTableEngine.requestJoin(...)` / `respondToJoinRequest(...)`
- `GameplayTableEngine.leaveLobby(...)` / `start(...)`
- `GameplayTableCommandProcessor.process(...)`
- `OnlineGameplayTableService.createTable(...)` / `listLobby(...)` / `openTable(...)`
- `OnlineGameplayTableService.updateSettings(...)` / `joinTable(...)` / `requestJoin(...)`
- `OnlineGameplayTableService.respondJoinRequest(...)` / `leaveTable(...)` / `startTable(...)`
- `GameplayTableSnapshotProjector.projectLobbyCard(...)`
- `GameplayTableSnapshotProjector.projectMemberSnapshot(...)`
- `ActiveGameControlEngine.createFromStartedTable(...)`
- `ActiveGameControlEngine.pause(...)` / `resume(...)` / `terminate(...)`
- `ActiveGameControlEngine.disconnect(...)` / `reconnect(...)` / `evaluateGrace(...)`
- `ActiveGameControlEngine.startTurn(...)` / `beginBotAction(...)` / `completeActionBoundary(...)`
- `ActiveGameDeadlineService.evaluate(...)`
- `ActiveControlCommandProcessor.process(...)`
- `ActiveControlReplayService.replay(...)`
- `ActiveGameControlService.initialize(...)` / `getSnapshot(...)`
- `ActiveGameControlService.pause(...)` / `resume(...)` / `terminate(...)`
- `ActiveGameRealtimeSynchronizer.connect(...)` / `refresh(...)` / `runMutation(...)`
- `GameplayLobbyScreen`
- `GameplayTableScreen`
- `ActiveGameplayScreen`

## Current progress

| Area | Progress |
| --- | ---: |
| Research and approved design | 100% |
| Gameplay engine core | 100% |
| Standard bot policy and simulation | 100% |
| Online table/lobby domain and commands | 100% |
| Supabase gameplay schema, RLS, and RPC definitions | 100% |
| Typed table service and privacy-safe projections | 100% |
| Active-game lifecycle, connection continuity, deadlines, command replay | 100% |
| Active-control schema/RPC definitions, typed service, and Realtime synchronizer | 100% |
| React lobby, table creation, waiting room, and host controls | 100% |
| React active-game continuity and responsive accessibility | 100% |
| Active bidding and private-hand card-play interface | 0% |
| Live Supabase migration/RLS/RPC/multi-session verification | 0% |
| Full round progression and end-to-end gameplay UAT | 0% |
| **Overall gameplay MVP implementation** | **82%** |

## Verification note

All gameplay and active-control SQL migrations are statically validated and included in deterministic deployment ordering. They have not been applied to a local or hosted Supabase PostgreSQL instance in this workstream. PostgreSQL compilation, transaction behavior, RLS behavior, Realtime publication, and multi-session integration remain release gates.

The React delivery is verified against typed service doubles and repository-wide CI. It is not yet a playable online card game because active bidding, private-hand delivery, legal card selection, bot directive execution, trick progression, and live backend integration remain outstanding.

## Active next milestone

Implement the active round interaction slice:

1. Define a privacy-safe player gameplay snapshot containing own hand and public state only.
2. Add authoritative gameplay snapshot and bid/card RPCs with expected versions and command IDs.
3. Add typed online round service and Realtime authoritative reload.
4. Render legal estimate selection and public auction progress.
5. Render own-hand cards and legal follow-suit actions.
6. Execute pending Standard-bot directives through the existing bot policy.
7. Progress tricks, round scoring, completion, replay, and verification.
8. Apply migrations and run multi-session browser UAT.
