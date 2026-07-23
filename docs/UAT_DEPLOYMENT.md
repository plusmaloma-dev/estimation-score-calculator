# Online UAT deployment runbook

This runbook deploys `feature/react-vite-frontend-prototype` as a shared Vercel Preview connected to one hosted Supabase UAT workspace. It does not merge or deploy `main`.

## 1. Verify the source

Use Node.js 22 or later and start from the repository root.

```powershell
git switch feature/react-vite-frontend-prototype
git status --short --branch
npm ci
npm run ci
```

Do not continue unless the branch is correct and `npm run ci` passes.

## 2. Create and link the Supabase project

Create a dedicated UAT project in the [Supabase Dashboard](https://supabase.com/dashboard). Keep the database password in a password manager; never put it in a command, source file, issue, build log, or chat.

The CLI login is interactive:

```powershell
npx supabase login
npx supabase link --project-ref <SUPABASE_PROJECT_REF>
```

The project ref is the identifier in `https://supabase.com/dashboard/project/<SUPABASE_PROJECT_REF>`. The link command may ask for the database password and stores it in the operating system's credential storage when available.

Review the ordered migration plan, then apply it:

```powershell
npx supabase db push --dry-run
npx supabase db push
```

The expected order is:

1. `202607230001_online_uat_schema.sql`
2. `202607230002_online_uat_rls.sql`
3. `202607230003_online_uat_rpc.sql`
4. `202607230004_fix_rpc_column_ambiguity.sql`

`supabase db push` records each timestamp in `supabase_migrations.schema_migrations` and skips timestamps already applied. Do not edit a migration after it has been applied. Add a later timestamped migration for every subsequent database change.

## 3. Create the initial Admin and shared workspace

This UAT uses password sign-in and has no public registration. In Supabase:

1. Open **Authentication > Users**.
2. Select **Add user > Create new user**.
3. Enter the Admin email, generate a unique temporary password in a password manager, and enable automatic email confirmation.
4. Create the user and copy its UUID. Do not paste the password into SQL or source control.
5. Open **SQL Editor**, replace both UUID placeholders below, and run the transaction.

```sql
begin;

insert into public.workspaces (slug, name)
values ('estimation-uat', 'Estimation Online UAT')
on conflict (slug) do update
set name = excluded.name;

insert into public.profiles (user_id, display_name)
values (
  '<ADMIN_AUTH_USER_UUID>'::uuid,
  'UAT Admin'
)
on conflict (user_id) do update
set display_name = excluded.display_name;

insert into public.workspace_memberships (
  workspace_id,
  user_id,
  role,
  created_by,
  updated_by
)
select
  workspace.id,
  '<ADMIN_AUTH_USER_UUID>'::uuid,
  'admin',
  '<ADMIN_AUTH_USER_UUID>'::uuid,
  '<ADMIN_AUTH_USER_UUID>'::uuid
from public.workspaces workspace
where workspace.slug = 'estimation-uat'
on conflict (workspace_id, user_id) do update
set role = excluded.role,
    updated_by = excluded.updated_by;

commit;
```

The SQL is idempotent for the same workspace slug and user UUID. Confirm exactly one row is returned:

```sql
select workspace.slug, membership.user_id, membership.role
from public.workspace_memberships membership
join public.workspaces workspace on workspace.id = membership.workspace_id
where workspace.slug = 'estimation-uat'
  and membership.user_id = '<ADMIN_AUTH_USER_UUID>'::uuid;
```

## 4. Configure authentication URLs

After Vercel returns the Preview URL, open Supabase **Authentication > URL Configuration**:

1. Set **Site URL** to the deployed UAT origin.
2. Add `<UAT_URL>/**` to **Redirect URLs**.
3. Keep public sign-up disabled.

The browser uses only the Supabase project URL and the project's client-safe publishable/anon key. Never expose the `service_role` key, a secret key, the database password, or a personal access token to Vite or Vercel.

## 5. Link Vercel and configure Preview variables

The Vercel login and project link are interactive:

```powershell
npx vercel login
npx vercel link
```

Add each value through the hidden CLI prompt. Do not append a value to the command or pipe it from shell history.

```powershell
npx vercel env add VITE_SUPABASE_URL preview
npx vercel env add VITE_SUPABASE_ANON_KEY preview
npx vercel env add VITE_UAT_WORKSPACE_SLUG preview
```

Use:

- `VITE_SUPABASE_URL`: the Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: the client-safe publishable/anon key, never `service_role`.
- `VITE_UAT_WORKSPACE_SLUG`: `estimation-uat`.

## 6. Deploy the feature branch

Confirm the checked-out branch again, then create a Preview deployment from the current source:

```powershell
git branch --show-current
npx vercel deploy
```

The branch must be `feature/react-vite-frontend-prototype`. The CLI prints a unique HTTPS deployment URL. Open that URL before sharing it. If Vercel Deployment Protection is enabled, configure access for all named UAT testers or disable protection only for this UAT Preview.

## 7. Invite another Admin or Tester

The reliable invitation procedure for this password-only UAT is:

1. An existing Admin opens Supabase **Authentication > Users > Add user > Create new user**.
2. The Admin creates the user with their email, a unique temporary password, and automatic email confirmation.
3. The Admin copies the new Auth user UUID.
4. In **SQL Editor**, the Admin runs the membership upsert below with role `admin` or `tester`.
5. The Admin sends the UAT URL and email through one approved channel and the temporary password through a separate secure channel.
6. The invited user signs in and the Admin confirms the expected role. A user without the membership row is rejected even if their password is valid.

```sql
insert into public.workspace_memberships (
  workspace_id,
  user_id,
  role,
  created_by,
  updated_by
)
select
  workspace.id,
  '<INVITED_AUTH_USER_UUID>'::uuid,
  '<admin_OR_tester>',
  '<ACTING_ADMIN_AUTH_USER_UUID>'::uuid,
  '<ACTING_ADMIN_AUTH_USER_UUID>'::uuid
from public.workspaces workspace
where workspace.slug = 'estimation-uat'
on conflict (workspace_id, user_id) do update
set role = excluded.role,
    updated_by = excluded.updated_by;
```

Do not use Supabase's public sign-up flow. Do not run Auth Admin APIs from the browser.

## 8. Required live smoke test

Use separate browser profiles for an Admin and a Tester:

1. Sign in with an assigned account; verify an unassigned Auth user is rejected.
2. Create four shared players and verify a case/whitespace-equivalent duplicate player is rejected.
3. Create two games with the same display name and verify both appear as separate cards.
4. Save a valid round, reload the page, and verify bids, actual tricks, calculated scores, applied scores, and the leaderboard persist.
5. Save through Round 18. Verify the finish suggestion appears only after the successful Round 18 save and that **Continue Playing** leaves the game in progress.
6. Select **Finish Game**, cancel once, then confirm. Verify the completed state is read-only after reload.
7. Reopen the completed game and verify all rounds, scores, overrides, and lifecycle history remain.
8. Open the same in-progress game as the second user. Verify the second user is view-only while the first lock is active.
9. As Admin, force-release the other editor's lock and verify editing transfers after refresh.
10. Leave through **History**, reopen, and verify the released/expired lock can be acquired normally.

Record the deployment URL, commit SHA, account roles, UTC time, and pass/fail evidence without recording passwords, tokens, keys, or database credentials.
