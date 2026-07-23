# Online UAT, Player Directory, Role-Based Access, and Game Lifecycle Design

## Objective

Prepare the Estimation Score Calculator for shared online UAT by:

- hosting the React/Vite application online;
- protecting access with invite-only Admin and Tester accounts;
- moving the online source of truth from browser-local storage to Supabase;
- adding a shared player directory;
- supporting one active editor per game;
- adding an explicit in-progress/completed game lifecycle;
- displaying an immutable game creation date and time;
- preserving all existing scoring behavior, including the House Rules V1 all-loser carry rule.

## Scope

### Included

- Remove the currently non-functional `+ New Round` button.
- Keep the editable current-round row as the only next-round entry point.
- Add a searchable shared player directory.
- Allow Admins and Testers to select or create active players during game setup.
- Prevent duplicate player names using trimmed, case-insensitive normalization.
- Allow duplicate game names.
- Show each game's creation date and time on its card.
- Display persisted `draft` as **In progress**.
- Display persisted `finalized` as **Completed**.
- Suggest finishing immediately after Round 18 is saved successfully.
- Require explicit confirmation before finalization.
- Allow continued play after Round 18.
- Allow both Admins and Testers to finalize and reopen games.
- Reopen after confirmation without a written reason.
- Audit finalization and reopening with actor and timestamp.
- Add invite-only email/password authentication.
- Add Admin and Tester roles.
- Store users, roles, players, games, rounds, calculated scores, applied overrides, locks, and audit events centrally.
- Enforce workspace and role authorization through Supabase Row Level Security.
- Allow one active editor per game and view-only access for others.
- Expire inactive editing locks after 15 minutes and allow Admin force-release.
- Start online UAT with an empty database.
- Leave existing browser-local games untouched.
- Deploy the frontend to Vercel.

### Excluded

- Offline editing or synchronization.
- Migration of existing browser-local games.
- Public self-registration.
- Multiple UAT workspaces or tenant isolation.
- A score-table visual redesign.
- New all-loser visual indicators.
- Automatic finalization without confirmation.
- A mandatory written reason for reopening.

## Roles and Permissions

### Admin

Admins can:

- access all UAT games and dashboards;
- create games, players, and rounds;
- finalize eligible games while holding the edit lock;
- reopen completed games without entering a reason;
- edit scores only while a game is in progress, using the existing audited override flow where applicable;
- invite users and assign Admin or Tester roles;
- rename, archive, and restore players;
- review audit activity;
- force-release editing locks.

### Tester

Testers can:

- access all UAT games and dashboards;
- create games, players, and rounds;
- finalize eligible games while holding the edit lock;
- reopen completed games without entering a reason;
- edit scores only while a game is in progress, using the existing audited override flow where applicable;
- view player and game history.

Testers cannot invite users, assign roles, administer the player directory, review unrestricted administrative activity, or force-release locks.

## Shared Workspace

The first online release uses one shared UAT workspace. Every invited user belongs to that workspace and can view its in-progress games, completed games, shared players, round history, leaderboards, analytics, and permitted audit information.

## Player Directory

Each player has:

- an immutable player ID;
- a display name;
- a normalized name used for uniqueness checks;
- active or archived status;
- creator and creation timestamp;
- last-updated actor and timestamp.

Player names are unique within the workspace after trimming whitespace and applying case-insensitive normalization.

Each new-game player field is a searchable combobox. Admins and Testers can select an existing active player or create a new unique player inline. The same player cannot be selected twice in one game. Archived players remain linked to historical games but do not appear in new-game selection.

Admins receive a Manage Players view with search, active/archived filters, rename, archive, restore, and usage/history reference count. Players are never hard-deleted.

## Game Identity and Card Metadata

### Game Names

Game names are labels, not identifiers.

- Duplicate game names are allowed.
- Each game uses an immutable database-generated ID.
- Navigation, locks, edits, audit events, and database relationships use the game ID.

### Creation Date and Time

Every game stores an immutable `created_at` timestamp when first created. The game card displays it in the viewer's local time using the approved format:

> Created 23 Jul 2026, 1:42 PM

The creation timestamp never changes when rounds are saved, the game is finalized, or the game is reopened. `updated_at` remains separate and continues to support sorting and synchronization.

### Status Labels

| Persisted value | User-facing label | Meaning |
| --- | --- | --- |
| `draft` | **In progress** | Authorized users can add rounds and make permitted score changes while holding the edit lock. |
| `finalized` | **Completed** | The game is read-only until an Admin or Tester reopens it. |

The word **Draft** does not appear on game cards or normal game screens.

## Game Lifecycle

### Initial State

A new game starts as `draft` and displays **In progress**. Authorized users may add rounds and make permitted score changes while holding the active edit lock.

### Round 18 Suggestion

Immediately after Round 18 is calculated and persisted successfully, the active editor sees:

> **Round 18 completed**  
> Would you like to finish this game?

Actions:

- **Finish Game**
- **Continue Playing**

Rules:

- Saving Round 18 never finalizes automatically.
- **Finish Game** requires a separate confirmation.
- **Continue Playing** leaves the game **In progress** and allows Round 19 onward.
- The automatic suggestion appears only during the successful Round 18 save transition.
- The app does not interrupt the user after every later round.
- After Round 18 exists, **Finish Game** remains visible in the header while the game is in progress.
- A game cannot be finalized before 18 saved rounds.

### Finalization

An Admin or Tester can finalize when:

- at least 18 rounds are saved;
- the game is `draft`;
- the user belongs to the same workspace;
- the user holds the active edit lock;
- the user confirms.

Finalization is one atomic transition:

- status changes from `draft` to `finalized`;
- `finalized_at` and `finalized_by` are recorded;
- an immutable `game.finalized` audit event records game, actor, and timestamp;
- the edit lock is released when possible.

### Completed Game Behavior

A completed game:

- displays **Completed**;
- rejects new rounds;
- rejects estimate, actual-trick, score-entry, and override writes;
- remains available for history, leaderboard, analytics, exports, and audit review;
- opens in read-only mode;
- exposes **Reopen Game** to both Admins and Testers.

### Reopening

Both Admins and Testers can reopen a completed game.

Flow:

1. Select **Reopen Game**.
2. Review a confirmation dialog.
3. Confirm reopening.
4. Status changes from `finalized` to `draft`.
5. The UI displays **In progress**.
6. The user acquires the normal edit lock before making changes.

Rules:

- No written reason is required.
- An immutable `game.reopened` audit event records game, actor, and timestamp.
- Reopening does not delete or rewrite rounds, scores, overrides, finalization history, or audit events.
- Previous finalization events remain permanent.
- The reopened game can later be finalized again through the normal confirmed flow.

## Authentication and Authorization

The application uses Supabase email/password authentication.

- Public sign-up is disabled.
- Admins invite users by email.
- Invited users set or confirm a password.
- Authentication is required before application data loads.
- Every authenticated user has one workspace membership and one role.
- Sign-out clears local session state.
- Unauthenticated users cannot read or modify UAT data.
- Admins and Testers can finalize and reopen according to the lifecycle rules.
- Finalization requires ownership of the edit lock.
- Reopening grants no implicit edit ownership; the normal lock is required for later writes.
- Service-role credentials are never exposed to the browser.

## Online Architecture

### Frontend

- React/Vite.
- Hosted on Vercel.
- Configured with the public Supabase URL, anonymous key, and UAT workspace slug.
- No privileged secret is stored in frontend code.

### Backend

- Supabase Auth for invite-only email/password access.
- Supabase PostgreSQL for shared persistence.
- Supabase Row Level Security for workspace and role authorization.
- Versioned SQL migrations in the repository.
- Database-generated UUIDs for shared entities.

## Core Data Model

### Identity and Access

- `workspaces`
- `profiles`
- `workspace_memberships`
- invitation/provider metadata

### Players

- `players`

### Games and Scores

- `games`
- `game_players`
- `rounds`
- `round_bids`
- `round_actuals`
- `round_scores`

The `games` record includes or derives:

- immutable game ID;
- workspace ID;
- non-unique display name;
- status (`draft` or `finalized`);
- immutable `created_at`;
- mutable `updated_at`;
- `created_by`;
- nullable `finalized_at` and `finalized_by`.

### Audit and Overrides

- `score_overrides`
- `audit_events`

Lifecycle audit actions include `game.finalized` and `game.reopened`.

### Concurrency

- `game_edit_locks`

## Score Integrity

For every round and player, the database preserves:

- original estimate;
- actual tricks;
- role and bid metadata;
- calculated score;
- applied score;
- all-loser classification;
- carried all-loser multiplier;
- Multiple WITH multiplier;
- override linkage where applicable.

Overrides never alter the original classification or calculated score. Finalizing or reopening does not recalculate or mutate prior results by itself.

## Game Editing Lock

- One game has at most one active editor.
- Opening an in-progress game attempts to acquire the lock.
- The active editor sends a heartbeat while interacting.
- Other users open the game in view-only mode.
- A lock expires after 15 minutes without activity.
- Leaving or finalizing releases the lock when possible.
- Reopening does not bypass lock acquisition.
- Admins can force-release a lock.
- Lock acquisition and release are audited.

## Browser-Local Compatibility

The online version does not import, overwrite, or delete existing browser-local games. The online repository becomes the source of truth only when online UAT configuration is present. The local build may continue to use browser storage.

The local version uses the same visible status labels and lifecycle confirmations where practical. Authenticated actor attribution applies to the online version.

## User Interface Changes

### Home and Game Cards

Each card shows:

- game name;
- player count and saved round count;
- player names;
- **In progress** or **Completed**;
- creation date and time;
- a context-appropriate Continue/Open action.

Duplicate names are distinguished by date/time, players, and round count.

### Game Header

- Remove `+ New Round`.
- Retain the round/dealer card and History action.
- Show **Finish Game** for in-progress games with at least 18 rounds.
- Show **Reopen Game** for completed games to Admins and Testers.
- Hide or disable edit controls when completed or when another user owns the lock.

### New Game

- Use four searchable player comboboxes.
- Allow inline creation of unique players.
- Prevent selecting the same player twice.
- Keep game-name and rule-set selection.
- Do not require game-name uniqueness.

### Authentication and Administration

- Add sign-in and sign-out.
- Show the signed-in user and role.
- Add Admin invitation/role management.
- Add Manage Players.
- Add lock and audit controls where applicable.

No score-table layout redesign is included.

## Error Handling

Show clear errors for:

- invalid or expired invitation;
- incorrect credentials;
- network or database failure;
- duplicate player name or selection;
- permission denial;
- lock conflict;
- finalization before Round 18;
- finalization without the edit lock;
- reopening a non-completed game;
- attempted writes to a completed game;
- concurrent lifecycle changes;
- stale data or failed persistence.

No failed write is silently treated as successful. Failed finalization or reopening leaves the prior status unchanged.

## Testing

Required coverage includes:

- hidden New Round button;
- shared player search and inline creation;
- duplicate-player validation;
- duplicate game names stored under different IDs;
- immutable creation timestamp and approved card format;
- `draft` rendered as **In progress**;
- `finalized` rendered as **Completed**;
- successful Round 18 save triggers the suggestion;
- failed Round 18 save does not trigger the suggestion;
- Round 18 never auto-finalizes;
- Continue Playing allows Round 19 without a finalization event;
- Finish Game requires confirmation, 18 rounds, and the edit lock;
- Admin and Tester can finalize;
- completed games reject all score and round writes;
- completed games remain readable and exportable;
- Admin and Tester can reopen after confirmation;
- reopening requires no reason and records actor/time;
- reopening preserves rounds, scores, overrides, and audit history;
- Admin/Tester authorization boundaries;
- unauthenticated access rejection;
- shared save/reopen behavior;
- all-loser carry behavior through online persistence;
- single-editor lock acquisition, expiry, view-only mode, and Admin release;
- database policy tests where practical;
- production build and deployment smoke test.

## Deployment and UAT Handover

Online UAT is ready when:

- the production build passes;
- migrations and RLS policies are applied;
- one initial Admin account exists;
- at least one Tester invitation is verified;
- the Vercel deployment is reachable over HTTPS;
- sign-in, player creation, duplicate game creation, card metadata, Round 18 suggestion, finalization, reopening, round save, scoring, override, lock, and role restrictions are smoke-tested;
- the deployment URL and invitation procedure are documented;
- no merge to `main` occurs without explicit approval.