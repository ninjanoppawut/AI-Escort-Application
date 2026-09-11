begin;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null,
  description text,
  icon_key text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  creator_type text not null check (creator_type in ('student', 'teacher')),
  status text not null default 'forming'
    check (status in ('forming', 'ready', 'approved', 'locked', 'archived')),
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  locked_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_id_class_unique unique (id, class_id),
  constraint groups_name_not_blank_check check (btrim(name) <> ''),
  constraint groups_name_length_check check (char_length(btrim(name)) <= 120),
  constraint groups_description_length_check check (
    description is null or char_length(description) <= 1000
  ),
  constraint groups_icon_key_format_check check (
    icon_key is null
    or (
      char_length(icon_key) <= 64
      and icon_key = lower(btrim(icon_key))
      and icon_key ~ '^[a-z0-9][a-z0-9_-]*$'
    )
  ),
  constraint groups_approval_state_check check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null and approved_at >= created_at)
  ),
  constraint groups_locked_state_check check (
    locked_at is null or locked_at >= created_at
  ),
  constraint groups_archived_state_check check (
    (status <> 'archived' and archived_at is null)
    or (
      status = 'archived'
      and archived_at is not null
      and archived_at >= created_at
    )
  ),
  constraint groups_deleted_time_check check (
    deleted_at is null or deleted_at >= created_at
  )
);

create index groups_class_status_created_idx
  on public.groups (class_id, status, created_at desc, id desc)
  where deleted_at is null;
create index groups_created_by_idx on public.groups (created_by);
create index groups_approved_by_idx on public.groups (approved_by)
  where approved_by is not null;
create index groups_current_count_idx
  on public.groups (class_id, id)
  where deleted_at is null and status <> 'archived';

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  group_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role text not null check (role in ('leader', 'member')),
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  invited_by uuid references public.profiles (id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  constraint group_members_group_user_unique unique (group_id, user_id),
  constraint group_members_group_class_fk foreign key (group_id, class_id)
    references public.groups (id, class_id) on delete cascade,
  constraint group_members_status_time_check check (
    (status = 'active' and left_at is null)
    or (status in ('left', 'removed') and left_at is not null and left_at >= joined_at)
  )
);

create unique index one_active_leader_per_group
  on public.group_members (group_id)
  where role = 'leader' and status = 'active';
create unique index one_active_group_per_student_per_class
  on public.group_members (class_id, user_id)
  where status = 'active';
create index group_members_class_status_role_idx
  on public.group_members (class_id, status, role, group_id, user_id);
create index group_members_user_status_idx
  on public.group_members (user_id, status, class_id);
create index group_members_invited_by_idx on public.group_members (invited_by)
  where invited_by is not null;

create table public.student_group_creation_claims (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete restrict,
  group_id uuid,
  status text not null default 'claimed'
    check (status in ('claimed', 'reset_by_teacher')),
  reset_by uuid references public.profiles (id) on delete restrict,
  reset_at timestamptz,
  reset_reason text,
  created_at timestamptz not null default now(),
  constraint student_group_creation_claims_group_class_fk
    foreign key (group_id, class_id) references public.groups (id, class_id)
    on delete restrict,
  constraint student_group_creation_claims_reset_state_check check (
    (
      status = 'claimed'
      and reset_by is null
      and reset_at is null
      and reset_reason is null
    )
    or (
      status = 'reset_by_teacher'
      and reset_by is not null
      and reset_at is not null
      and reset_at >= created_at
      and reset_reason is not null
      and btrim(reset_reason) <> ''
      and char_length(reset_reason) <= 1000
    )
  )
);

create unique index one_unreset_student_group_creation_claim_per_class
  on public.student_group_creation_claims (class_id, student_id)
  where status = 'claimed';
create index student_group_creation_claims_student_idx
  on public.student_group_creation_claims (student_id, class_id, status);
create index student_group_creation_claims_group_idx
  on public.student_group_creation_claims (group_id)
  where group_id is not null;
create index student_group_creation_claims_reset_by_idx
  on public.student_group_creation_claims (reset_by)
  where reset_by is not null;

create table public.group_membership_history (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  group_id uuid references public.groups (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  event_type text not null check (
    event_type in (
      'joined',
      'left',
      'removed',
      'moved_in',
      'moved_out',
      'became_leader',
      'leadership_transferred',
      'creation_claimed',
      'claim_reset'
    )
  ),
  actor_id uuid references public.profiles (id) on delete restrict,
  related_group_id uuid references public.groups (id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint group_membership_history_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  )
);

create index group_membership_history_class_created_idx
  on public.group_membership_history (class_id, created_at desc, id desc);
create index group_membership_history_group_created_idx
  on public.group_membership_history (group_id, created_at desc, id desc)
  where group_id is not null;
create index group_membership_history_user_created_idx
  on public.group_membership_history (user_id, created_at desc, id desc);
create index group_membership_history_actor_created_idx
  on public.group_membership_history (actor_id, created_at desc, id desc)
  where actor_id is not null;
create index group_membership_history_related_group_idx
  on public.group_membership_history (related_group_id)
  where related_group_id is not null;

create function private.is_active_class_student(
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
        and class_row.status = 'active'
        and membership.user_id = actor_user_id
        and membership.role = 'student'
        and membership.status = 'active'
        and school_membership.role = 'student'
        and school_membership.status = 'active'
        and profile.account_type = 'student'
        and profile.status = 'active'
        and profile.email_verified_at is not null
    );
$$;

create function private.current_user_is_class_student(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_profile_is_active())
    and (select private.is_active_class_student((select auth.uid()), target_class_id));
$$;

create function private.is_active_group_leader(
  actor_user_id uuid,
  target_group_id uuid
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
      from public.group_members as member
      join public.groups as group_row on group_row.id = member.group_id
      where member.group_id = target_group_id
        and member.user_id = actor_user_id
        and member.role = 'leader'
        and member.status = 'active'
        and group_row.deleted_at is null
        and group_row.status in ('forming', 'ready', 'approved')
    );
$$;

create function private.validate_group_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.classes
    where id = new.class_id
      and status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  if new.creator_type = 'student' then
    if not (select private.is_active_class_student(new.created_by, new.class_id)) then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
  elsif new.creator_type = 'teacher' then
    if not (select private.is_active_class_teacher(new.created_by, new.class_id)) then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
  end if;

  if new.approved_by is not null
    and not (select private.is_active_class_teacher(new.approved_by, new.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create function private.validate_group_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_status text;
begin
  select group_row.status
  into target_status
  from public.groups as group_row
  where group_row.id = new.group_id
    and group_row.class_id = new.class_id
    and group_row.deleted_at is null;

  if target_status is null or target_status = 'archived' then
    raise exception using errcode = '42501', message = 'DESTINATION_GROUP_INVALID';
  end if;

  if not (select private.is_active_class_student(new.user_id, new.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if new.invited_by is not null
    and not (
      (select private.is_active_class_teacher(new.invited_by, new.class_id))
      or (select private.is_active_group_leader(new.invited_by, new.group_id))
    ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create function private.validate_student_group_creation_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_class_student(new.student_id, new.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if new.group_id is not null
    and not exists (
      select 1
      from public.groups as group_row
      where group_row.id = new.group_id
        and group_row.class_id = new.class_id
        and group_row.creator_type = 'student'
        and group_row.created_by = new.student_id
    ) then
    raise exception using errcode = '42501', message = 'DESTINATION_GROUP_INVALID';
  end if;

  if new.reset_by is not null
    and not (select private.is_active_class_teacher(new.reset_by, new.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create function private.validate_group_membership_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id is not null
    and not exists (
      select 1
      from public.groups as group_row
      where group_row.id = new.group_id
        and group_row.class_id = new.class_id
    ) then
    raise exception using errcode = '42501', message = 'DESTINATION_GROUP_INVALID';
  end if;

  if new.related_group_id is not null
    and not exists (
      select 1
      from public.groups as group_row
      where group_row.id = new.related_group_id
        and group_row.class_id = new.class_id
    ) then
    raise exception using errcode = '42501', message = 'DESTINATION_GROUP_INVALID';
  end if;

  if not exists (
    select 1
    from public.class_members as member
    where member.class_id = new.class_id
      and member.user_id = new.user_id
      and member.role = 'student'
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if new.actor_id is not null
    and not (
      (select private.is_active_class_teacher(new.actor_id, new.class_id))
      or (select private.is_active_class_student(new.actor_id, new.class_id))
    ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create function private.prevent_group_membership_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'HISTORY_APPEND_ONLY';
end;
$$;

create function private.enforce_group_active_leader()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_group_id uuid;
  active_member_count integer;
  active_leader_count integer;
  target_group_status text;
  target_deleted_at timestamptz;
begin
  if TG_TABLE_NAME = 'groups' then
    affected_group_id := coalesce(new.id, old.id);
  else
    affected_group_id := coalesce(new.group_id, old.group_id);
  end if;

  select status, deleted_at
  into target_group_status, target_deleted_at
  from public.groups
  where id = affected_group_id;

  if target_group_status is null
    or target_deleted_at is not null
    or target_group_status = 'archived' then
    return null;
  end if;

  select count(*)
  into active_member_count
  from public.group_members
  where group_id = affected_group_id
    and status = 'active';

  if active_member_count = 0 then
    return null;
  end if;

  select count(*)
  into active_leader_count
  from public.group_members
  where group_id = affected_group_id
    and role = 'leader'
    and status = 'active';

  if active_leader_count <> 1 then
    raise exception using errcode = '23514', message = 'ONE_ACTIVE_LEADER_REQUIRED';
  end if;

  return null;
end;
$$;

revoke execute on function private.is_active_class_student(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.current_user_is_class_student(uuid)
  from public, anon;
revoke execute on function private.is_active_group_leader(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.validate_group_actor()
  from public, anon, authenticated;
revoke execute on function private.validate_group_member()
  from public, anon, authenticated;
revoke execute on function private.validate_student_group_creation_claim()
  from public, anon, authenticated;
revoke execute on function private.validate_group_membership_history()
  from public, anon, authenticated;
revoke execute on function private.prevent_group_membership_history_mutation()
  from public, anon, authenticated;
revoke execute on function private.enforce_group_active_leader()
  from public, anon, authenticated;

grant execute on function private.current_user_is_class_student(uuid)
  to authenticated;

create trigger groups_validate_actor
before insert or update of class_id, created_by, creator_type, approved_by
on public.groups
for each row execute function private.validate_group_actor();

create trigger groups_set_updated_at
before update on public.groups
for each row execute function private.set_updated_at();

create trigger group_members_validate_member
before insert or update of class_id, group_id, user_id, invited_by
on public.group_members
for each row execute function private.validate_group_member();

create constraint trigger group_members_one_active_leader
after insert or update of group_id, role, status or delete
on public.group_members
deferrable initially deferred
for each row execute function private.enforce_group_active_leader();

create constraint trigger groups_one_active_leader
after update of status, deleted_at
on public.groups
deferrable initially deferred
for each row execute function private.enforce_group_active_leader();

create trigger student_group_creation_claims_validate
before insert or update of class_id, student_id, group_id, status, reset_by
on public.student_group_creation_claims
for each row execute function private.validate_student_group_creation_claim();

create trigger group_membership_history_validate
before insert on public.group_membership_history
for each row execute function private.validate_group_membership_history();

create trigger group_membership_history_prevent_update
before update on public.group_membership_history
for each row execute function private.prevent_group_membership_history_mutation();

create trigger group_membership_history_prevent_delete
before delete on public.group_membership_history
for each row execute function private.prevent_group_membership_history_mutation();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.student_group_creation_claims enable row level security;
alter table public.group_membership_history enable row level security;

create policy groups_select_class_members
on public.groups
for select
to authenticated
using (
  (select private.current_user_is_class_teacher(class_id))
  or (
    deleted_at is null
    and status <> 'archived'
    and (select private.current_user_is_class_member(class_id))
  )
);

create policy group_members_select_class_members
on public.group_members
for select
to authenticated
using (
  (select private.current_user_is_class_teacher(class_id))
  or (
    status = 'active'
    and (select private.current_user_is_class_member(class_id))
  )
);

create policy student_group_creation_claims_select_authorized
on public.student_group_creation_claims
for select
to authenticated
using (
  (student_id = (select auth.uid()) and (select private.current_user_is_class_student(class_id)))
  or (select private.current_user_is_class_teacher(class_id))
);

create policy group_membership_history_select_teacher
on public.group_membership_history
for select
to authenticated
using ((select private.current_user_is_class_teacher(class_id)));

revoke all on table public.groups from anon, authenticated;
revoke all on table public.group_members from anon, authenticated;
revoke all on table public.student_group_creation_claims from anon, authenticated;
revoke all on table public.group_membership_history from anon, authenticated;

grant select on table public.groups to authenticated;
grant select on table public.group_members to authenticated;
grant select on table public.student_group_creation_claims to authenticated;
grant select on table public.group_membership_history to authenticated;

comment on table public.groups is
  'P3-01 current class groups; current slot counts exclude archived or deleted rows.';
comment on table public.group_members is
  'P3-01 current group memberships; unique partial indexes enforce one leader and one current group per class.';
comment on table public.student_group_creation_claims is
  'P3-01 student-created group claims; one unreset claim per student per class.';
comment on table public.group_membership_history is
  'P3-01 append-only group membership and leadership history.';
comment on function private.enforce_group_active_leader() is
  'Deferred P3-01 invariant: any non-archived, non-deleted group with active members has exactly one active leader.';

commit;
