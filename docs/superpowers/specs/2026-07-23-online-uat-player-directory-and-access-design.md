# Online UAT, Player Directory, Role-Based Access, and Game Lifecycle Design

## Objective

Prepare the Estimation Score Calculator for shared online UAT by:

- hiding the currently non-functional `+ New Round` button;
- replacing plain player-name text fields with a searchable shared-player selector;
- hosting the application online;
- protecting access with invite-only Admin and Tester accounts;
- moving the online source of truth from browser-local storage to a shared database;
- adding an explicit in-progress/completed game lifecycle;
- showing an immutable game creation date and time on game cards;
- preserving all existing scoring behavior, including the House Rules V1 all-loser carry rule.

## Scope

### Included

- Remove the `+ New Round` button from the game header.
- Keep the editable current-round row as the only entry point for the next round.
- Add a shared player directory.
- Replace each player name field in new-game setup with a searchable combobox.
- Allow selection of an existing active player.
- Allow inline creation of a new unique player by Admins and Testers.
- Prevent duplicate player names using normalized case-insensitive comparison.
- Allow duplicate game names.
- Show each game's immutable creation date and time on its card.
- Display the internal `draft` status as **In progress**.
- Display the internal `finalized` status as **Completed**.
- Suggest finishing a game immediately after Round 18 is saved.
- Require explicit confirmation before finalizing a game.
- Allow continued play after Round 18 when the user declines the suggestion.
- Allow both Admins and Testers to finalize and reopen games.
- Reopen completed games after confirmation without requiring a written reason.
- Audit finalization and reopening with actor and timestamp.
- Allow Admins to rename, archive, and restore players.
- Hide archived players from new-game selection while retaining all historical links.
- Add invite-only email/password authentication.
- Add Admin and Tester roles.
- Store users, roles, players, games, rounds, calculated scores, applied overrides, and audit records centrally.
- Deploy the frontend online for UAT.
- Add row-level database authorization.
- Attribute player, game, round, override, lock, and administrative changes to the authenticated user.
- Allow one active editor per game, with view-only access for other users.
- Add automatic lock expiry after 15 minutes of inactivity and Admin force-release.
- Start the online database empty; do not migrate local browser games.
- Keep existing local browser data untouched.

### Excluded

- Offline editing or synchronization.
- Migration of existing browser-local games into the online database.
- Public self-registration.
- Multiple workspaces or tenant isolation beyond the single shared UAT workspace.
- Player performance dashboards beyond preserving granular data for a later release.
- Visual redesign of the score table.
- New all-loser visual indicators, dotted lines, or multiplier badges.
- Automatic game finalization without user confirmation.
- A mandatory written reason when reopening a completed game.

## User Roles

### Admin

Admins can:

- access all games and dashboards;
- create games and rounds;
- create players during game setup;
- finalize eligible in-progress games;
- reopen completed games without entering a reason;
- edit completed scores with a required audit reason after the game has been reopened or through the existing authorized override flow;
- invite users;
- assign Admin or Tester roles;
- rename, archive, and restore players;
- review audit activity;
- force-release game editing locks.

Multiple Admins are supported.

### Tester

Testers can:

- access all games and dashboards;
- create games and rounds;
- select existing active players;
- create new players during game setup;
- finalize eligible in-progress games;
- reopen completed games without entering a reason;
- edit completed scores with a required audit reason after the game has been reopened or through the existing authorized override flow;
- view player and game history.

Testers cannot invite users, assign roles, rename/archive/restore players, review unrestricted administrative activity, or force-release locks.

## Shared Workspace Model

The first online release uses one shared UAT workspace. Every invited user belongs to that workspace and can view all in-progress games, completed games, shared players, round history, leaderboards, analytics, and score override history permitted by their role.

## Player Directory

### Data Rules

Each player has:

- immutable player ID;
- display name;
- normalized name for uniqueness checks;
- active or archived status;
- created timestamp and creator user ID;
- last-updated timestamp and actor user ID.

Player names must be unique within the workspace after trimming whitespace and applying case-insensitive normalization.

### New-Game Selection

Each of the four player fields becomes a searchable combobox.

The user can:

- search active players by name;
- select one existing player;
- type a new unique name and create it inline;
- see a clear validation error for duplicate player names;
- not select the same player twice in one game.

Archived players do not appear in the combobox.

### Administration

Admins receive a Manage Players view containing:

- search;
- active/archived filter;
- rename action;
- archive action;
- restore action;
- usage/history reference count.

Players are never hard-deleted.

## Game Identity and Card Metadata

### Game Names

Game names are descriptive labels, not unique identifiers.

- Duplicate game names are allowed.
- Every game uses an immutable database-generated ID as its true identifier.
- All navigation, edits, locks, audit records, and database relationships use the game ID rather than the displayed name.

### Creation Date and Time

Every game stores an immutable `created_at` timestamp when it is first created.

The game card displays the timestamp in the viewer's local time using the selected format:

> Created 23 Jul 2026, 1:42 PM

The creation timestamp does not change when rounds are saved, the game is finalized, or the game is reopened. A separate `updated_at` timestamp continues to support sorting and synchronization but is not included in this card change.

### User-Facing Status Labels

The persisted status values remain compatible with the existing model:

| Persisted value | User-facing label | Meaning |
| --- | --- | --- |
| `draft` | **In progress** | The game can accept rounds and authorized score changes. |
| `finalized` | **Completed** | The game is read-only until an Admin or Tester reopens it. |

The word **Draft** must not appear on game cards or normal game screens.

## Game Lifecycle

### Initial State

- A new game starts with persisted status `draft`.
- The UI displays **In progress**.
- Authorized users may add and save rounds while they hold the active game-editing lock.

### Round 18 Finish Suggestion

Immediately after Round 18 is successfully calculated and persisted, the active editor sees a confirmation prompt:

> **Round 18 completed**  
> Would you like to finish this game?

The prompt provides two actions:

- **Finish Game**
- **Continue Playing**

Rules:

- Saving Round 18 never finalizes the game automatically.
- Finalization occurs only after the user selects **Finish Game** and confirms.
- Selecting **Continue Playing** leaves the game **In progress** and allows Round 19 and later rounds.
- The automatic suggestion is shown only as part of the successful Round 18 save transition.
- The app does not interrupt the user after every later round.
- Once Round 18 exists, a visible **Finish Game** action remains available in the game header while the game is in progress.
- A game cannot be finalized before 18 saved rounds.

### Finalization Authorization and Transition

An Admin or Tester may finalize a game when:

- the game has at least 18 successfully saved rounds;
- the game is currently `draft`;
- the user is authenticated in the same workspace;
- the user holds the active edit lock for that game;
- the user confirms the finalization action.

Finalization performs one atomic transition:

- status changes from `draft` to `finalized`;
- `finalized_at` is recorded;
- `finalized_by` records the authenticated user;
- an audit event records the game ID, actor, timestamp, and `game.finalized` action;
- the edit lock is released when possible.

### Completed Game Behavior

A completed game:

- displays **Completed** on its card and game screen;
- does not allow new rounds;
- does not allow normal estimate, actual-trick, or score entry;
- remains available for history, leaderboard, analytics, exports, and audit review;
- may be opened by other users in read-only mode;
- exposes a **Reopen Game** action to both Admins and Testers.

### Reopening

Both Admins and Testers may reopen a completed game.

The flow is:

1. The user selects **Reopen Game**.
2. The app shows a confirmation dialog.
3. The user confirms.
4. The game status changes from `finalized` to `draft`.
5. The UI displays **In progress**.
6. The user must acquire the normal game-editing lock before changing or adding data.

Reopening rules:

- No written reason is required.
- The action records `reopened_at` and `reopened_by` or equivalent audit metadata.
- An audit event records the game ID, actor, timestamp, and `game.reopened` action.
- Reopening does not delete or rewrite prior rounds, calculated scores, applied overrides, finalization history, or audit records.
- The previous finalization audit event remains permanent.
- After reopening, the game may be finalized again through the normal confirmation flow.

## Authentication and Invitations

The application uses email/password authentication.

- Public sign-up is disabled.
- Admins invite users by email.
- Invited users set or confirm their password through the invitation flow.
- Every authenticated user has exactly one workspace membership and one role.
- Authentication state is required before any application data is loaded.
- Sign-out clears local session state.

## Authorization

Authorization is enforced in both the application layer and the database.

- Unauthenticated users cannot read or modify UAT data.
- Testers cannot perform Admin-only actions.
- Admins and Testers can finalize and reopen games according to the lifecycle rules.
- Database policies use the authenticated user and workspace membership.
- All data rows are scoped to the shared workspace.
- Service-role credentials are never exposed to the browser.
- Finalization requires ownership of the active edit lock.
- Reopening grants no implicit edit ownership; the normal lock must be acquired before subsequent writes.

## Online Architecture

### Frontend

- React/Vite application.
- Hosted on Vercel.
- Environment-specific public Supabase URL and anonymous key.
- No privileged secrets stored in frontend code.

### Backend and Database

- Supabase Auth for invite-only email/password access.
- Supabase PostgreSQL for shared persistence.
- Supabase Row Level Security for authorization.
- SQL migrations versioned in the repository.
- Database-generated UUIDs for shared entities.

## Core Data Model

### Identity and Access

- `workspaces`
- `profiles`
- `workspace_memberships`
- `user_invitations` or provider invitation metadata

### Player Directory

- `players`

### Games

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
- nullable `finalized_at` and `finalized_by`;
- latest reopen metadata when retained directly, while the full history remains in `audit_events`.

### Audit and Overrides

- `score_overrides`
- `audit_events`

Lifecycle audit actions include:

- `game.finalized`
- `game.reopened`

### Concurrency

- `game_edit_locks`

## Score Integrity

For each round and player, the database preserves:

- original estimate;
- actual tricks;
- role and bid metadata;
- calculated score;
- applied score;
- all-loser classification;
- carried all-loser multiplier;
- Multiple WITH multiplier;
- override linkage when applicable.

Manual overrides never alter original classification or calculated score data. Finalizing or reopening a game never recalculates or mutates prior round results by itself.

## Game Editing Lock

A game may have only one active editor.

- Opening an in-progress game attempts to acquire the lock.
- The active editor sends a heartbeat while interacting.
- Other users can open the game in view-only mode.
- A lock expires after 15 minutes without activity.
- Leaving the game releases the lock when possible.
- Finalizing releases the lock when possible.
- Reopening does not bypass lock acquisition.
- Admins can force-release a lock.
- Lock acquisition and release are audited.

## Browser-Local Compatibility

The online version does not import or overwrite existing browser-local score sheets.

The online repository implementation becomes the source of truth only when the application is configured for the UAT environment. Existing local data remains in the current browser and may still be used by the local development build unless the user explicitly clears it.

The local version uses the same visible lifecycle labels and confirmation behavior where practical. Authenticated actor attribution applies only to the online version.

## User Interface Changes

### Home and Game Cards

Each card shows:

- game name;
- player count and saved round count;
- player names;
- **In progress** or **Completed** status;
- creation date and time in the selected display format;
- the context-appropriate action: continue/open game.

Duplicate names are visually distinguished by creation date/time, players, and round count.

### Game Header

- Remove the `+ New Round` button.
- Retain the round/dealer card and History button.
- Show **Finish Game** for in-progress games with at least 18 saved rounds.
- Show **Reopen Game** for completed games to both Admins and Testers.
- Hide or disable editing controls when the game is completed or another user holds the lock.

### Round 18 Confirmation

- Show the finish suggestion only after a successful Round 18 save.
- Do not show it when Round 18 validation or persistence fails.
- **Continue Playing** returns to the score sheet without changing status.
- **Finish Game** performs a separate confirmed lifecycle write.

### New Game

- Replace four text inputs with four searchable player comboboxes.
- Show inline create-new-player option when the typed name is unique.
- Prevent duplicate player selections.
- Keep game name and rule-set selection.
- Do not require game-name uniqueness.

### Authentication

- Add sign-in screen.
- Add signed-in user and role indication.
- Add sign-out action.

### Admin

- Add user invitation/role management screen.
- Add Manage Players screen.
- Add lock and audit controls where applicable.

No score-table layout redesign is included.

## Error Handling

The application must show clear errors for:

- invalid or expired invitation;
- incorrect credentials;
- network/database failure;
- duplicate player name;
- duplicate player selection;
- permission denial;
- lock conflict;
- finalization before Round 18;
- finalization without the active edit lock;
- reopening a game that is not completed;
- concurrent lifecycle changes;
- failed save or stale game data.

No failed write may be silently treated as successful. A failed finalization or reopening operation leaves the previous status unchanged.

## Testing

Required coverage includes:

- hidden New Round button;
- searchable player selection;
- inline unique player creation;
- duplicate-player-name and duplicate-selection validation;
- duplicate game names remain allowed and are stored under different IDs;
- creation timestamp is immutable and appears on game cards in the selected format;
- `draft` renders as **In progress**;
- `finalized` renders as **Completed**;
- Round 18 save triggers the finish suggestion only after a successful save;
- Round 18 save does not automatically finalize;
- Continue Playing permits Round 19 and does not create a finalization audit event;
- Finish Game requires confirmation and at least 18 saved rounds;
- Admin and Tester can finalize while holding the edit lock;
- completed games reject normal round and score-entry writes;
- completed games remain readable and exportable;
- Admin and Tester can reopen after confirmation;
- reopening requires no reason;
- reopening records actor and timestamp;
- reopening preserves all prior rounds, scores, overrides, and audit events;
- archived-player filtering and restoration;
- Admin and Tester authorization boundaries;
- unauthenticated access rejection;
- central game save/reopen behavior;
- all-loser carry behavior through online persistence;
- completed-score overrides and audit attribution;
- single-editor lock acquisition, expiry, view-only mode, and Admin release;
- database policy tests where practical;
- production build and deployment smoke test.

## Deployment and UAT Handover

The UAT release is complete when:

- production build passes;
- database migrations and policies are applied;
- one initial Admin account exists;
- at least one Tester invitation flow is verified;
- the Vercel deployment is reachable over HTTPS;
- sign-in, player creation, duplicate game creation, card metadata, Round 18 suggestion, finalization, reopening, round save, override, and role restrictions are smoke-tested;
- the deployment URL and Admin invitation procedure are documented;
- no merge to `main` occurs without explicit approval.