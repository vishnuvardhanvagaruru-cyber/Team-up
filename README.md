# TeamUp

TeamUp helps students find teammates for hackathons and academic projects. Students create profiles, discover projects and collaborators, apply for open roles, and manage teams.

## Supabase setup

1. In Supabase **Project Settings → API Keys**, copy the project's **publishable key**. Do not use a service-role or secret key.
2. Add the same publishable key to Replit Secrets as `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY`. `VITE_SUPABASE_URL` and `SUPABASE_URL` must both contain the Supabase project URL. The frontend URL is already configured in this import.
3. In the Supabase SQL Editor, run the migration files in order:
   - `artifacts/teamup/supabase/migrations/20261006000100_teamup_part1.sql`
   - `artifacts/teamup/supabase/migrations/20261006000200_teamup_projects.sql`
4. In **Authentication → URL Configuration**, set the Site URL to the app's published origin and add the current Replit preview origin and published origin to Redirect URLs, for example `https://<app-origin>/**`. For local Vite, also allow `http://localhost:5173/**`. Confirmation redirects to `/dashboard`; password reset redirects to `/reset-password`.

More detail, including migration behavior and access-control boundaries, is in [the Supabase setup guide](artifacts/teamup/docs/supabase-setup.md).

## Run and build

- Install from the workspace lockfile: `pnpm install --frozen-lockfile`
- In Replit, use **Run** to start the TeamUp web app and API workflows with their configured ports and routing.
- Run all TypeScript checks: `pnpm run typecheck`
- Build the TeamUp frontend: `PORT=18832 BASE_PATH=/ pnpm --filter @workspace/teamup run build`
- Build the API server: `pnpm --filter @workspace/api-server run build`

The frontend is `artifacts/teamup`; the authenticated API is `artifacts/api-server`. The API forwards the signed-in student's bearer token to Supabase so database permissions remain enforced by RLS. No service-role key is used.

## Demo flow

1. Apply both migrations, configure the publishable key and auth redirects, then sign up with a first account and complete its profile.
2. Create a project with open roles, a capacity that includes the owner, and a future application deadline.
3. Sign up with a second account, complete its profile, find the project in **Discover projects**, and apply for one of its roles.
4. Sign back in as the owner, accept the request, and confirm both accounts see the same project team roster after refresh.

## Deployment

Publishing requires the same Supabase project URL and publishable key to be available to the frontend build and API runtime, both SQL migrations applied, and the published origin added to Supabase Auth redirects. This project does not require purchasing another service.
