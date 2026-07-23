# Online UAT, Player Directory, and Role-Based Access Design

## Objective

Prepare the Estimation Score Calculator for shared UAT by:

- hiding the currently non-functional `+ New Round` button;
- replacing plain player-name text fields with a searchable shared-player selector;
- hosting the application online;
- protecting access with invite-only Admin and Tester accounts;
- moving the online source of truth from browser-local storage to a shared database;
- preserving all existing scoring behavior, including the all-loser carry rule.

## Scope

### Included

- Remove the `+ New Round` button from the game header.
- Keep the editable current-round row as the only entry point for the next round.
- Add a shared player directory.
- Replace each player name field in new-game setup with a searchable combobox.
- Allow selection of an existing active player.
- Allow inline creation of a new unique player by Admins and Testers.
- Prevent duplicate player names using normalized case-insensitive comparison.
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

## User Roles

### Admin

Admins can:

- access all games and dashboards;
- create games and rounds;
- create players during game setup;
- edit completed scores with a required audit reason;
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
- edit completed scores with a required audit reason;
- view player and game history.

Testers cannot invite users, assign roles, rename/archive/restore players, or force-release locks.

## Shared Workspace Model

The first online release uses one shared UAT workspace. Every invited user belongs to that workspace and can view all active games, completed games, shared players, round history, leaderboards, analytics, and score override history permitted by their role.

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
- see a clear validation error for duplicate names;
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
- Database policies use the authenticated user and workspace membership.
- All data rows are scoped to the shared workspace.
- Service-role credentials are never exposed to the browser.

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

### Audit and Overrides

- `score_overrides`
- `audit_events`

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

Manual overrides never alter original classification or calculated score data.

## Game Editing Lock

A game may have only one active editor.

- Opening a game attempts to acquire the lock.
- The active editor sends a heartbeat while interacting.
- Other users can open the game in view-only mode.
- A lock expires after 15 minutes without activity.
- Leaving the game releases the lock when possible.
- Admins can force-release a lock.
- Lock acquisition and release are audited.

## Browser-Local Compatibility

The online version does not import or overwrite existing browser-local score sheets.

The online repository implementation becomes the source of truth only when the application is configured for the UAT environment. Existing local data remains in the current browser and may still be used by the local development build unless the user explicitly clears it.

## User Interface Changes

### Game Header

- Remove the `+ New Round` button.
- Retain the round/dealer card and History button.

### New Game

- Replace four text inputs with four searchable player comboboxes.
- Show inline create-new-player option when the typed name is unique.
- Prevent duplicate selections.
- Keep game name and rule-set selection unchanged.

### Authentication

- Add sign-in screen.
- Add signed-in user and role indication.
- Add sign-out action.

### Admin

- Add user invitation/role management screen.
- Add Manage Players screen.
- Add lock and audit controls where applicable.

No score-table layout change is included.

## Error Handling

The application must show clear errors for:

- invalid or expired invitation;
- incorrect credentials;
- network/database failure;
- duplicate player name;
- duplicate player selection;
- permission denial;
- lock conflict;
- failed save or stale game data.

No failed write may be silently treated as successful.

## Testing

Required coverage includes:

- hidden New Round button;
- searchable player selection;
- inline unique player creation;
- duplicate-name and duplicate-selection validation;
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
- sign-in, player creation, game creation, round save, reopen, override, and role restrictions are smoke-tested;
- the deployment URL and Admin invitation procedure are documented;
- no merge to `main` occurs without explicit approval.
