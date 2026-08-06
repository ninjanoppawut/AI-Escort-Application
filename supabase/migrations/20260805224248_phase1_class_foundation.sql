begin;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  name text not null,
  subject text,
  academic_year text,
  semester text,
  description text,
  min_group_size integer not null default 1,
  max_group_size integer not null default 5,
  maximum_groups integer not null default 1,
  allow_student_groups boolean not null default true,
  group_formation_status text not null default 'closed'
    check (group_formation_status in ('open', 'closed')),
  created_by uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_name_not_blank_check check (btrim(name) <> ''),
  constraint classes_min_group_size_check check (min_group_size >= 1),
  constraint classes_max_group_size_check check (max_group_size >= min_group_size),
  constraint classes_maximum_groups_check check (maximum_groups >= 1)
);

create index classes_school_status_created_idx
  on public.classes (school_id, status, created_at desc, id desc);
create index classes_created_by_idx on public.classes (created_by);

create table public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role text not null check (role in ('student', 'teacher')),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  constraint class_members_class_user_unique unique (class_id, user_id),
  constraint class_members_status_time_check check (
    (status = 'active' and left_at is null)
    or (status = 'left' and left_at is not null and left_at >= joined_at)
  )
);

create index class_members_user_class_active_idx
  on public.class_members (user_id, class_id) where status = 'active';
create index class_members_class_status_role_joined_idx
  on public.class_members (class_id, status, role, joined_at, id);

create table public.class_invites (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  code text not null unique,
  token_hash text not null unique,
  created_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'disabled')),
  disabled_by uuid references public.profiles (id) on delete restrict,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_invites_code_format_check check (
    code = upper(btrim(code))
    and char_length(code) between 6 and 32
    and code ~ '^[A-Z0-9-]+$'
  ),
  constraint class_invites_token_hash_check
    check (char_length(token_hash) between 43 and 128),
  constraint class_invites_expiry_check
    check (expires_at is null or expires_at > created_at),
  constraint class_invites_max_uses_check check (max_uses is null or max_uses >= 1),
  constraint class_invites_used_count_check check (
    used_count >= 0 and (max_uses is null or used_count <= max_uses)
  ),
  constraint class_invites_disable_state_check check (
    (status = 'active' and disabled_by is null and disabled_at is null)
    or (
      status = 'disabled'
      and disabled_by is not null
      and disabled_at is not null
      and disabled_at >= created_at
    )
  )
);

create index class_invites_class_status_created_idx
  on public.class_invites (class_id, status, created_at desc, id desc);
create index class_invites_created_by_idx on public.class_invites (created_by);
create index class_invites_disabled_by_idx
  on public.class_invites (disabled_by) where disabled_by is not null;
create index class_invites_active_expiry_idx
  on public.class_invites (expires_at, id)
  where status = 'active' and expires_at is not null;

create function private.is_active_school_teacher(
  actor_user_id uuid,
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select actor_user_id is not null
    and exists (
      select 1
      from public.profiles
      where id = actor_user_id
        and account_type = 'teacher'
        and status = 'active'
        and email_verified_at is not null
    )
    and exists (
      select 1
      from public.schools
      where id = target_school_id
        and status = 'active'
    )
    and exists (
      select 1
      from public.school_memberships
      where school_id = target_school_id
        and user_id = actor_user_id
        and role = 'teacher'
        and status = 'active'
    );
$$;

create function private.is_active_class_teacher(
  actor_user_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select actor_user_id is not null
    and exists (
      select 1
      from public.classes as class_row
      join public.class_members as membership
        on membership.class_id = class_row.id
      join public.school_memberships as school_membership
        on school_membership.school_id = class_row.school_id
       and school_membership.user_id = actor_user_id
      join public.profiles as profile on profile.id = actor_user_id
      where class_row.id = target_class_id
        and membership.user_id = actor_user_id
        and membership.role = 'teacher'
        and membership.status = 'active'
        and school_membership.role = 'teacher'
        and school_membership.status = 'active'
        and profile.account_type = 'teacher'
        and profile.status = 'active'
        and profile.email_verified_at is not null
    );
$$;

create function private.current_user_is_class_member(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_profile_is_active())
    and exists (
      select 1
      from public.class_members
      where class_id = target_class_id
        and user_id = (select auth.uid())
        and status = 'active'
    );
$$;

create function private.current_user_is_class_teacher(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_profile_is_active())
    and (select private.is_active_class_teacher(
      (select auth.uid()),
      target_class_id
    ));
$$;

create function private.validate_class_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_school_teacher(
    new.created_by,
    new.school_id
  )) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create function private.validate_class_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school_id uuid;
begin
  select school_id
  into target_school_id
  from public.classes
  where id = new.class_id
    and status = 'active';

  if target_school_id is null
    or not exists (
      select 1
      from public.profiles
      where id = new.user_id
        and account_type = new.role
        and status = 'active'
        and email_verified_at is not null
    )
    or not exists (
      select 1
      from public.school_memberships
      where school_id = target_school_id
        and user_id = new.user_id
        and role = new.role
        and status = 'active'
    ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create function private.validate_class_invite_actors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_class_teacher(
    new.created_by,
    new.class_id
  )) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if new.status = 'disabled'
    and not (select private.is_active_class_teacher(
      new.disabled_by,
      new.class_id
    )) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return new;
end;
$$;

revoke execute on function private.is_active_school_teacher(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.is_active_class_teacher(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.current_user_is_class_member(uuid)
  from public, anon;
revoke execute on function private.current_user_is_class_teacher(uuid)
  from public, anon;
revoke execute on function private.validate_class_creator()
  from public, anon, authenticated;
revoke execute on function private.validate_class_membership()
  from public, anon, authenticated;
revoke execute on function private.validate_class_invite_actors()
  from public, anon, authenticated;

grant execute on function private.current_user_is_class_member(uuid)
  to authenticated;
grant execute on function private.current_user_is_class_teacher(uuid)
  to authenticated;

create trigger classes_validate_creator
before insert or update of school_id, created_by on public.classes
for each row execute function private.validate_class_creator();

create trigger classes_set_updated_at
before update on public.classes
for each row execute function private.set_updated_at();

create trigger class_members_validate_membership
before insert or update of class_id, user_id, role on public.class_members
for each row execute function private.validate_class_membership();

create trigger class_invites_validate_actors
before insert or update of class_id, created_by, status, disabled_by
on public.class_invites
for each row execute function private.validate_class_invite_actors();

create trigger class_invites_set_updated_at
before update on public.class_invites
for each row execute function private.set_updated_at();

alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_invites enable row level security;

create policy classes_select_authorized
on public.classes
for select
to authenticated
using ((select private.current_user_is_class_member(id)));

create policy class_members_select_authorized
on public.class_members
for select
to authenticated
using (
  (select private.current_user_is_class_teacher(class_id))
  or (
    status = 'active'
    and (select private.current_user_is_class_member(class_id))
  )
);

create policy class_invites_select_teacher
on public.class_invites
for select
to authenticated
using ((select private.current_user_is_class_teacher(class_id)));

revoke all on table public.classes from anon, authenticated;
revoke all on table public.class_members from anon, authenticated;
revoke all on table public.class_invites from anon, authenticated;

grant select on table public.classes to authenticated;
grant select on table public.class_members to authenticated;
grant select (
  id,
  class_id,
  code,
  created_by,
  expires_at,
  max_uses,
  used_count,
  status,
  disabled_by,
  disabled_at,
  created_at,
  updated_at
) on table public.class_invites to authenticated;

comment on table public.classes is
  'Class identity and teacher-controlled group-formation configuration.';
comment on column public.classes.created_by is
  'Trusted active teacher who created the class; browser writes are not granted.';
comment on table public.class_members is
  'Authoritative class-scoped teacher/student membership; mutated only by trusted operations.';
comment on table public.class_invites is
  'Reusable code/link/QR class invitations; trusted operations own creation, disablement, and consumption.';
comment on column public.class_invites.code is
  'Teacher-visible classroom code; access is restricted to active teachers in the class.';
comment on column public.class_invites.token_hash is
  'One-way hash of the opaque link/QR bearer token; never granted through the Data API.';
comment on column public.class_invites.used_count is
  'Reserved for atomic increment by the P1-04 invitation-consumption operation.';

commit;
