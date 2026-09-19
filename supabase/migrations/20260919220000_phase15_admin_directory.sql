begin;

-- P15-02: school provisioning, teacher invitation listing, and the
-- teacher/student directory for platform admins (ADM-002, ADM-003,
-- ADM-009, ADM-012). Every function requires an active grant and aal2 via
-- private.require_current_admin_aal2, raises stable codes, pages by keyset
-- (created_at desc, id desc) with a default of 50 and a cap of 100 rows, and
-- audits each read or change. Admins are never added to school or class
-- memberships. Student emails are masked in the directory.

create index schools_created_keyset_idx on public.schools (created_at desc, id desc);
create index profiles_created_keyset_idx on public.profiles (created_at desc, id desc);
create index teacher_invitations_school_created_idx
  on public.teacher_invitations (school_id, created_at desc, id desc);
create unique index schools_active_name_unique_idx
  on public.schools (lower(btrim(name)))
  where status = 'active';

create function private.admin_page_size(requested integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when requested is null then 50
    when requested < 1 then 1
    when requested > 100 then 100
    else requested
  end;
$$;

create function private.admin_cursor_pair_valid(cursor_created_at timestamptz, cursor_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (cursor_created_at is null) = (cursor_id is null);
$$;

create function private.mask_email(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(split_part(email, '@', 1), 1) || '***@' || split_part(email, '@', 2);
$$;

revoke all on function private.admin_page_size(integer) from public, anon, authenticated;
revoke all on function private.admin_cursor_pair_valid(timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.mask_email(text) from public, anon, authenticated;

create function public.admin_create_school(school_name text)
returns table (school_id uuid, name text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  trimmed text := btrim(coalesce(school_name, ''));
  created public.schools%rowtype;
begin
  if char_length(trimmed) not between 1 and 160 then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;

  begin
    insert into public.schools (name, created_by)
    values (trimmed, actor)
    returning * into created;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'SCHOOL_NAME_TAKEN';
  end;

  perform private.insert_audit_log(
    actor, 'admin.school.created', 'school', created.id, created.id, null,
    'succeeded', '{}'::jsonb
  );

  return query select created.id, created.name, created.status, created.created_at;
end;
$$;

create function public.admin_archive_school(target_school_id uuid, reason text)
returns table (school_id uuid, status text, changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  trimmed_reason text := btrim(coalesce(reason, ''));
  current_status text;
begin
  if char_length(trimmed_reason) not between 1 and 500 then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;

  select school.status
  into current_status
  from public.schools as school
  where school.id = target_school_id
  for update;

  if current_status is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if current_status = 'archived' then
    return query select target_school_id, 'archived'::text, false;
    return;
  end if;

  update public.schools as school
  set status = 'archived', updated_at = now()
  where school.id = target_school_id;

  -- Pending invitations to an archived school can no longer be accepted.
  update public.teacher_invitations as invitation
  set status = 'revoked', revoked_by = actor, revoked_at = now()
  where invitation.school_id = target_school_id
    and invitation.status = 'pending';

  perform private.insert_audit_log(
    actor, 'admin.school.archived', 'school', target_school_id, target_school_id, null,
    'succeeded', jsonb_build_object('reason_length', char_length(trimmed_reason))
  );

  return query select target_school_id, 'archived'::text, true;
end;
$$;

create function public.admin_list_schools(
  status_filter text default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 50
)
returns table (
  school_id uuid,
  name text,
  status text,
  created_at timestamptz,
  teacher_count bigint,
  student_count bigint,
  class_count bigint,
  pending_invitation_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
begin
  if status_filter is not null and status_filter not in ('active', 'archived') then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;
  if not private.admin_cursor_pair_valid(cursor_created_at, cursor_id) then
    raise exception using errcode = '23514', message = 'INVALID_CURSOR';
  end if;

  perform private.insert_audit_log(
    actor, 'admin.schools.listed', 'admin_view', null, null, null, 'succeeded',
    jsonb_build_object('status_filter', status_filter, 'paged', cursor_id is not null)
  );

  return query
  select
    school.id,
    school.name,
    school.status,
    school.created_at,
    (select count(*) from public.school_memberships as membership
      where membership.school_id = school.id and membership.role = 'teacher' and membership.status = 'active'),
    (select count(*) from public.school_memberships as membership
      where membership.school_id = school.id and membership.role = 'student' and membership.status = 'active'),
    (select count(*) from public.classes as class where class.school_id = school.id),
    (select count(*) from public.teacher_invitations as invitation
      where invitation.school_id = school.id and invitation.status = 'pending'
        and invitation.expires_at > now())
  from public.schools as school
  where (status_filter is null or school.status = status_filter)
    and (cursor_id is null or (school.created_at, school.id) < (cursor_created_at, cursor_id))
  order by school.created_at desc, school.id desc
  limit private.admin_page_size(page_size);
end;
$$;

create function public.admin_get_school(target_school_id uuid)
returns table (
  school_id uuid,
  name text,
  status text,
  created_at timestamptz,
  teacher_count bigint,
  student_count bigint,
  class_count bigint,
  pending_invitation_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
begin
  if not exists (select 1 from public.schools as school where school.id = target_school_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform private.insert_audit_log(
    actor, 'admin.school.viewed', 'school', target_school_id, target_school_id, null,
    'succeeded', '{}'::jsonb
  );

  return query
  select
    school.id,
    school.name,
    school.status,
    school.created_at,
    (select count(*) from public.school_memberships as membership
      where membership.school_id = school.id and membership.role = 'teacher' and membership.status = 'active'),
    (select count(*) from public.school_memberships as membership
      where membership.school_id = school.id and membership.role = 'student' and membership.status = 'active'),
    (select count(*) from public.classes as class where class.school_id = school.id),
    (select count(*) from public.teacher_invitations as invitation
      where invitation.school_id = school.id and invitation.status = 'pending'
        and invitation.expires_at > now())
  from public.schools as school
  where school.id = target_school_id;
end;
$$;

create function public.admin_list_teacher_invitations(
  target_school_id uuid,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 50
)
returns table (
  invitation_id uuid,
  email text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
begin
  if not private.admin_cursor_pair_valid(cursor_created_at, cursor_id) then
    raise exception using errcode = '23514', message = 'INVALID_CURSOR';
  end if;
  if not exists (select 1 from public.schools as school where school.id = target_school_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform private.insert_audit_log(
    actor, 'admin.teacher_invitations.listed', 'school', target_school_id, target_school_id, null,
    'succeeded', jsonb_build_object('paged', cursor_id is not null)
  );

  return query
  select
    invitation.id,
    invitation.email,
    case
      when invitation.status = 'pending' and invitation.expires_at <= now() then 'expired'
      else invitation.status
    end,
    invitation.expires_at,
    invitation.created_at,
    invitation.accepted_at,
    invitation.revoked_at
  from public.teacher_invitations as invitation
  where invitation.school_id = target_school_id
    and (cursor_id is null or (invitation.created_at, invitation.id) < (cursor_created_at, cursor_id))
  order by invitation.created_at desc, invitation.id desc
  limit private.admin_page_size(page_size);
end;
$$;

create function public.admin_list_users(
  account_filter text default null,
  search text default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 50
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  account_type text,
  status text,
  created_at timestamptz,
  is_admin boolean,
  school_names text[],
  class_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  pattern text;
begin
  if account_filter is not null and account_filter not in ('student', 'teacher') then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;
  if search is not null and char_length(btrim(search)) > 120 then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;
  if not private.admin_cursor_pair_valid(cursor_created_at, cursor_id) then
    raise exception using errcode = '23514', message = 'INVALID_CURSOR';
  end if;

  if nullif(btrim(search), '') is not null then
    pattern := '%' || replace(replace(replace(lower(btrim(search)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  -- The search text itself is never stored; only that one was used.
  perform private.insert_audit_log(
    actor, 'admin.directory.listed', 'admin_view', null, null, null, 'succeeded',
    jsonb_build_object(
      'account_filter', account_filter,
      'has_search', pattern is not null,
      'paged', cursor_id is not null
    )
  );

  return query
  select
    profile.id,
    profile.display_name,
    case when profile.account_type = 'teacher' then profile.email else private.mask_email(profile.email) end,
    profile.account_type,
    profile.status,
    profile.created_at,
    exists (
      select 1 from public.platform_admins as grant_row
      where grant_row.user_id = profile.id and grant_row.status = 'active'
    ),
    coalesce((
      select array_agg(school.name order by school.name)
      from public.school_memberships as membership
      join public.schools as school on school.id = membership.school_id
      where membership.user_id = profile.id and membership.status = 'active'
    ), array[]::text[]),
    (select count(*) from public.class_members as member
      where member.user_id = profile.id and member.status = 'active')
  from public.profiles as profile
  where (account_filter is null or profile.account_type = account_filter)
    and (
      pattern is null
      or lower(profile.display_name) like pattern escape '\'
      or profile.email like pattern escape '\'
    )
    and (cursor_id is null or (profile.created_at, profile.id) < (cursor_created_at, cursor_id))
  order by profile.created_at desc, profile.id desc
  limit private.admin_page_size(page_size);
end;
$$;

revoke all on function public.admin_create_school(text) from public, anon;
revoke all on function public.admin_archive_school(uuid, text) from public, anon;
revoke all on function public.admin_get_school(uuid) from public, anon;
revoke all on function public.admin_list_schools(text, timestamptz, uuid, integer) from public, anon;
revoke all on function public.admin_list_teacher_invitations(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.admin_list_users(text, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_create_school(text) to authenticated;
grant execute on function public.admin_archive_school(uuid, text) to authenticated;
grant execute on function public.admin_get_school(uuid) to authenticated;
grant execute on function public.admin_list_schools(text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.admin_list_teacher_invitations(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.admin_list_users(text, text, timestamptz, uuid, integer) to authenticated;

commit;
