# TeamUp Supabase setup

## Environment variables

The Supabase project URL is already configured. Add the same Supabase
publishable key to both the web and API environments:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

`VITE_` variables are public and used by the browser. The API verifies each
bearer token with Supabase Auth and uses that same student's token for
PostgREST requests, so Row Level Security remains in force. Do not add a
service-role key.

## Apply the database migration

In the Supabase dashboard for project `pupdhcsdptswtzostqya`, open **SQL
Editor**, create a query, and run:

`artifacts/teamup/supabase/migrations/20261006000100_teamup_part1.sql`

The migration is additive and does not delete existing data. It creates the
four core tables when absent, enables RLS immediately, grants signed-in
students access only to profiles, and leaves projects, applications, and
project memberships inaccessible until their policies are implemented. Review
the existing table definitions before running it if the project already has
TeamUp tables with a different schema.

## Authentication redirect URLs

In **Authentication → URL Configuration**:

1. Set **Site URL** to this TeamUp app's published Replit origin after it is
   published. Do not use the older reference app's URL.
2. Add the current TeamUp Replit development origin and published origin to
   **Redirect URLs**. The app sends email confirmation links to
   `<app-origin>/dashboard` and password recovery links to
   `<app-origin>/reset-password`; allow those paths, for example
   `https://<teamup-replit-dev-domain>/**` and
   `https://<teamup-published-domain>/**`.
3. If you run Vite locally, also allow `http://localhost:5173/**`.

Supabase's redirect allow-list must include each actual app origin. The
published domain is not available until the new TeamUp artifact is published.
