# Online Gameplay Table and Lobby Delivery Report

**Date:** 25 July 2026  
**Branch:** `feature/online-game-bot-mvp`  
**Draft PR:** #14  
**Merge authorization:** Not granted

## Delivered scope

### Immutable table domain

- Public and private lobby tables.
- Public open joining or approval-required joining.
- Host creation at seat 0 with default 45-second turn timer and 60-second disconnect grace.
- Host-only pre-game settings.
- Duplicate-user and occupied-seat protection.
- Explicit access grant required for private joining.
- Host succession to the earliest joined remaining human.
- Automatic closure when the last human leaves the lobby.
- Start fills every vacant seat with a permanent Standard bot using deterministic IDs.
- Start locks settings and prevents later joining.
- Pending join requests block Start until resolved.

### Authoritative command boundary

- Versioned commands for settings, open join, request join, respond to request, leave, and Start.
- Accepted commands increment the table version exactly once.
- Stale and domain-rejected commands retain the authoritative version and are recorded.
- Same command ID and envelope returns the original result.
- Same command ID with a different envelope is rejected as an integrity conflict.

### Supabase persistence and security

- Separate gameplay persistence objects; existing score-calculator `games` semantics are unchanged.
- Gameplay tables, seats, join requests, command records, and append-only events.
- Seat, timer, lifecycle, human/bot identity, and command uniqueness constraints.
- Workspace membership remains the authentication boundary.
- Public tables are visible to workspace members; private tables are limited to host, seated participants, and workspace Admins.
- No direct authenticated gameplay writes are granted.
- Security-definer RPCs bind the supplied actor to `auth.uid()`, use fixed search paths, and enforce expected versions and host/lobby rules.
- Lobby and table snapshot RPCs exclude hands, deal seeds, shuffled decks, future cards, and unpublished bot decisions.

### Typed online adapter and projection

- Typed service methods for creation, lobby listing, opening, settings, joining, requests, decisions, leaving, and Start.
- Workspace and actor IDs are injected from `AuthSessionState`.
- Invalid inputs fail before an RPC is invoked.
- Database errors, domain rejections, and incomplete snapshots are never reported as success.
- Explicit allow-listed projections for public lobby cards, seated members, hosts, and workspace Admins.
- Member request history is scoped to the viewer; host/Admin request visibility is explicit.
- Host permissions are projected without granting host powers to workspace Admins.

## TDD and CI evidence

| Task | RED | GREEN |
| --- | ---: | ---: |
| Immutable lifecycle, settings, open joining, bot filling, and host succession | #735 | #738 |
| Approval-required requests and host decisions | #739 | #741 |
| Versioned/idempotent table commands | #742 | #745 |
| Supabase schema, RLS, RPCs, and safe snapshots | #746 | #750 |
| Typed online gameplay table service | #751 | #753 |
| Realtime-safe public/member/host projections | #754 | #755 |

CI run #755 passed repository typechecking, all tests, and the production build.

## Verification limitation

The SQL migrations are covered by static security/schema tests and deterministic migration-order checks. They have not yet been executed against a local or hosted Supabase PostgreSQL instance in this implementation environment. Database application, PostgreSQL compilation, transaction behavior, and RLS integration must be verified before gameplay UAT deployment.

## Deferred to the next gameplay milestones

- Supabase Realtime channel subscription and reconnect synchronization.
- Active-game pause, resume, and termination.
- Turn timers and connected-player one-action timeout assistance.
- Disconnect grace, temporary bot takeover, and safe human reclaim.
- Active-game host succession.
- React public lobby, private invite, table waiting room, and gameplay screens.
- End-to-end multi-session Supabase UAT.
