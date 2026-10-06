# TeamUp Supabase setup

## Environment variables

The frontend project URL is configured in the imported Replit environment.
The backend URL is set to the same project. Add the same Supabase publishable
key to both the web and API environments:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Find the publishable key under **Supabase → Project Settings → API Keys**.
Add it in Replit **Tools → Secrets** under both key names
`VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY`. These should
contain the same `sb_publishable_...` value. The frontend key is public by
design; do not substitute an administrative/service-role key.

The API verifies each bearer token with Supabase Auth and uses that same
student's token for PostgREST and RPC calls. It never has an administrative
key, so PostgreSQL Row Level Security remains in force.

## Apply the database migrations

In the Supabase dashboard for project `pupdhcsdptswtzostqya`, open **SQL
Editor**. Run these files as separate queries, in order:

1. `artifacts/teamup/supabase/migrations/20261006000100_teamup_part1.sql`
2. `artifacts/teamup/supabase/migrations/20261006000200_teamup_projects.sql`

Both migrations are additive and do not delete user data. Part 1 creates the
core tables and profile access. Part 2 adds project discovery permissions,
application access rules, private member rosters, and authenticated database
functions for atomic project creation and application decisions. Acceptance
locks the project row and updates membership and application status in one
transaction, preventing two concurrent accepts from exceeding capacity.

If these tables already exist with a different schema, inspect their columns
and constraints before applying the scripts. The Part 2 functions and policies
are designed to be re-runnable.

## Authentication redirect URLs

In **Authentication → URL Configuration**:

1. Set **Site URL** to this TeamUp app's published Replit origin after it is
   published.
2. Add the current TeamUp Replit development origin and published origin to
   **Redirect URLs**. The app sends email confirmation links to
   `<app-origin>/dashboard` and password recovery links to
   `<app-origin>/reset-password`; allow those paths, for example
   `https://<teamup-replit-dev-domain>/**` and
   `https://<teamup-published-domain>/**`.
3. If you run Vite locally, also allow `http://localhost:5173/**`.

Supabase's redirect allow-list must include each actual app origin. The
published domain is not available until the TeamUp artifact is published.
