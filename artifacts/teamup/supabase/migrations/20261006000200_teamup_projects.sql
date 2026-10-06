-- TeamUp Part 2: project discovery, applications, atomic membership changes, and RLS.
-- Additive; existing profile and user data is preserved.
begin;

alter table public.projects
  add column if not exists member_count integer not null default 0;

create or replace function public.teamup_is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;
revoke all on function public.teamup_is_project_member(uuid) from public, anon;
grant execute on function public.teamup_is_project_member(uuid) to authenticated;

create or replace function public.teamup_adjust_member_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.projects
      set member_count = member_count + 1
      where id = new.project_id;
    return new;
  end if;
  update public.projects
    set member_count = greatest(0, member_count - 1)
    where id = old.project_id;
  return old;
end;
$$;
drop trigger if exists teamup_project_members_count_insert on public.project_members;
create trigger teamup_project_members_count_insert
  after insert on public.project_members
  for each row execute function public.teamup_adjust_member_count();
drop trigger if exists teamup_project_members_count_delete on public.project_members;
create trigger teamup_project_members_count_delete
  after delete on public.project_members
  for each row execute function public.teamup_adjust_member_count();

create or replace function public.teamup_guard_project_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.total_capacity < new.member_count then
    raise exception 'Capacity cannot be lower than the current team size' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists teamup_projects_capacity_guard on public.projects;
create trigger teamup_projects_capacity_guard
  before update of total_capacity on public.projects
  for each row execute function public.teamup_guard_project_capacity();

-- Backfill once for projects created before this migration had member_count.
update public.projects p
  set member_count = (
    select count(*)::integer
    from public.project_members pm
    where pm.project_id = p.id
  );

create or replace function public.teamup_create_project(
  p_title text,
  p_description text,
  p_category text,
  p_required_skills text[],
  p_open_roles text[],
  p_total_capacity integer,
  p_deadline date,
  p_repository_url text,
  p_demo_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_project_id uuid;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_owner) then
    raise exception 'Complete your profile before creating a project' using errcode = 'P0001';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_description), '') is null
     or nullif(trim(p_category), '') is null or coalesce(cardinality(p_open_roles), 0) = 0
     or p_total_capacity < 2 or p_deadline < current_date then
    raise exception 'Project details are invalid' using errcode = '22023';
  end if;
  insert into public.projects (
    owner_id, title, description, category, required_skills, open_roles,
    total_capacity, deadline, repository_url, demo_url
  ) values (
    v_owner, trim(p_title), trim(p_description), trim(p_category),
    coalesce(p_required_skills, '{}'), p_open_roles,
    p_total_capacity, p_deadline, nullif(trim(p_repository_url), ''),
    nullif(trim(p_demo_url), '')
  ) returning id into v_project_id;
  insert into public.project_members (project_id, user_id, role)
    values (v_project_id, v_owner, 'Owner');
  return v_project_id;
end;
$$;
revoke all on function public.teamup_create_project(text,text,text,text[],text[],integer,date,text,text) from public, anon;
grant execute on function public.teamup_create_project(text,text,text,text[],text[],integer,date,text,text) to authenticated;

create or replace function public.teamup_submit_application(
  p_project_id uuid,
  p_selected_role text,
  p_introduction text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_project public.projects%rowtype;
  v_application_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if v_user = v_project.owner_id then
    raise exception 'You cannot apply to your own project' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Complete your profile before applying' using errcode = 'P0001';
  end if;
  if v_project.status <> 'recruiting' or v_project.deadline < current_date
     or v_project.member_count >= v_project.total_capacity then
    raise exception 'This project is closed, expired, or full' using errcode = 'P0001';
  end if;
  if not (p_selected_role = any(v_project.open_roles)) then
    raise exception 'Select one of this project’s open roles' using errcode = '22023';
  end if;
  if nullif(trim(p_introduction), '') is null then
    raise exception 'Introduction cannot be empty' using errcode = '22023';
  end if;
  insert into public.applications (project_id, applicant_id, selected_role, introduction)
    values (p_project_id, v_user, p_selected_role, trim(p_introduction))
    returning id into v_application_id;
  return v_application_id;
end;
$$;
revoke all on function public.teamup_submit_application(uuid,text,text) from public, anon;
grant execute on function public.teamup_submit_application(uuid,text,text) to authenticated;

create or replace function public.teamup_decide_application(
  p_application_id uuid,
  p_decision text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_project public.projects%rowtype;
  v_application public.applications%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Invalid application decision' using errcode = '22023';
  end if;
  select p.* into v_project
    from public.projects p
    join public.applications a on a.project_id = p.id
    where a.id = p_application_id
    for update of p;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if v_project.owner_id <> v_user then
    raise exception 'Only the project owner can decide applications' using errcode = '42501';
  end if;
  select * into v_application
    from public.applications
    where id = p_application_id
    for update;
  if v_application.status <> 'pending' then
    raise exception 'This application is no longer pending' using errcode = 'P0001';
  end if;
  if p_decision = 'accepted' then
    if v_project.status <> 'recruiting' or v_project.deadline < current_date
       or v_project.member_count >= v_project.total_capacity then
      raise exception 'This project is closed, expired, or full' using errcode = 'P0001';
    end if;
    insert into public.project_members (project_id, user_id, role)
      values (v_project.id, v_application.applicant_id, v_application.selected_role);
  end if;
  update public.applications
    set status = p_decision
    where id = p_application_id;
  return p_application_id;
end;
$$;
revoke all on function public.teamup_decide_application(uuid,text) from public, anon;
grant execute on function public.teamup_decide_application(uuid,text) to authenticated;

create or replace function public.teamup_withdraw_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_application public.applications%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into v_application from public.applications
    where id = p_application_id for update;
  if not found or v_application.applicant_id <> v_user then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if v_application.status <> 'pending' then
    raise exception 'Only pending applications can be withdrawn' using errcode = 'P0001';
  end if;
  update public.applications set status = 'withdrawn' where id = p_application_id;
  return p_application_id;
end;
$$;
revoke all on function public.teamup_withdraw_application(uuid) from public, anon;
grant execute on function public.teamup_withdraw_application(uuid) to authenticated;

drop policy if exists teamup_projects_signed_in_read on public.projects;
create policy teamup_projects_signed_in_read
  on public.projects for select to authenticated
  using (auth.uid() is not null);
drop policy if exists teamup_projects_owner_update on public.projects;
create policy teamup_projects_owner_update
  on public.projects for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
drop policy if exists teamup_projects_owner_update_guard on public.projects;
create policy teamup_projects_owner_update_guard
  on public.projects as restrictive for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
drop policy if exists teamup_projects_no_direct_insert on public.projects;
create policy teamup_projects_no_direct_insert
  on public.projects as restrictive for insert to authenticated
  with check (false);

drop policy if exists teamup_applications_relevant_read on public.applications;
create policy teamup_applications_relevant_read
  on public.applications for select to authenticated
  using (
    applicant_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = applications.project_id
        and p.owner_id = auth.uid()
    )
  );
drop policy if exists teamup_applications_relevant_read_guard on public.applications;
create policy teamup_applications_relevant_read_guard
  on public.applications as restrictive for select to authenticated
  using (
    applicant_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = applications.project_id
        and p.owner_id = auth.uid()
    )
  );
drop policy if exists teamup_applications_no_direct_insert on public.applications;
create policy teamup_applications_no_direct_insert
  on public.applications as restrictive for insert to authenticated
  with check (false);
drop policy if exists teamup_applications_no_direct_update on public.applications;
create policy teamup_applications_no_direct_update
  on public.applications as restrictive for update to authenticated
  using (false)
  with check (false);
drop policy if exists teamup_applications_no_direct_delete on public.applications;
create policy teamup_applications_no_direct_delete
  on public.applications as restrictive for delete to authenticated
  using (false);

drop policy if exists teamup_members_project_roster_read on public.project_members;
create policy teamup_members_project_roster_read
  on public.project_members for select to authenticated
  using (public.teamup_is_project_member(project_id));
drop policy if exists teamup_members_project_roster_read_guard on public.project_members;
create policy teamup_members_project_roster_read_guard
  on public.project_members as restrictive for select to authenticated
  using (public.teamup_is_project_member(project_id));
drop policy if exists teamup_members_no_direct_insert on public.project_members;
create policy teamup_members_no_direct_insert
  on public.project_members as restrictive for insert to authenticated
  with check (false);
drop policy if exists teamup_members_no_direct_update on public.project_members;
create policy teamup_members_no_direct_update
  on public.project_members as restrictive for update to authenticated
  using (false)
  with check (false);
drop policy if exists teamup_members_no_direct_delete on public.project_members;
create policy teamup_members_no_direct_delete
  on public.project_members as restrictive for delete to authenticated
  using (false);

revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.applications from public, anon, authenticated;
revoke all on table public.project_members from public, anon, authenticated;
grant select on table public.projects to authenticated;
grant update (
  title, description, category, required_skills, open_roles,
  total_capacity, deadline, status, repository_url, demo_url
) on table public.projects to authenticated;
revoke update (id, owner_id, member_count, created_at, updated_at)
  on table public.projects from public, anon, authenticated;
grant select on table public.applications to authenticated;
grant select on table public.project_members to authenticated;

commit;
