-- TeamUp Part 1: profiles and the minimal schema needed by the next part.
-- Additive and idempotent: this migration does not drop tables or user data.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  college text not null default '',
  bio text not null default '',
  skills text[] not null default '{}',
  preferred_role text not null default '',
  hours_available_per_week integer not null default 1,
  portfolio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If profiles already exists, add only fields the profile API needs.
alter table public.profiles
  add column if not exists name text not null default '',
  add column if not exists college text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists skills text[] not null default '{}',
  add column if not exists preferred_role text not null default '',
  add column if not exists hours_available_per_week integer not null default 1,
  add column if not exists portfolio_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,
  required_skills text[] not null default '{}',
  open_roles text[] not null default '{}',
  -- Counts every team member, including the owner.
  total_capacity integer not null check (total_capacity >= 1),
  deadline date not null,
  status text not null default 'recruiting'
    check (status in ('recruiting', 'closed')),
  repository_url text,
  demo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  selected_role text not null,
  introduction text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_project_applicant_unique unique (project_id, applicant_id)
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  constraint project_members_project_user_unique unique (project_id, user_id)
);

alter table public.projects
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.applications
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.teamup_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teamup_profiles_set_updated_at on public.profiles;
create trigger teamup_profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.teamup_set_updated_at();

drop trigger if exists teamup_projects_set_updated_at on public.projects;
create trigger teamup_projects_set_updated_at
  before update on public.projects
  for each row execute function public.teamup_set_updated_at();

drop trigger if exists teamup_applications_set_updated_at on public.applications;
create trigger teamup_applications_set_updated_at
  before update on public.applications
  for each row execute function public.teamup_set_updated_at();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.applications enable row level security;
alter table public.project_members enable row level security;

drop policy if exists teamup_profiles_signed_in_read on public.profiles;
create policy teamup_profiles_signed_in_read
  on public.profiles for select to authenticated
  using (auth.uid() is not null);

drop policy if exists teamup_profiles_insert_self on public.profiles;
create policy teamup_profiles_insert_self
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists teamup_profiles_insert_self_guard on public.profiles;
create policy teamup_profiles_insert_self_guard
  on public.profiles as restrictive for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists teamup_profiles_update_self on public.profiles;
create policy teamup_profiles_update_self
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists teamup_profiles_update_self_guard on public.profiles;
create policy teamup_profiles_update_self_guard
  on public.profiles as restrictive for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Leave next-part tables closed until their specific access rules are added.
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.applications from public, anon, authenticated;
revoke all on table public.project_members from public, anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;

commit;
