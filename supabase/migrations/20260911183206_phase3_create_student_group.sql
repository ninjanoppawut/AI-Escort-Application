begin;

alter table public.research_events
  add column group_id uuid references public.groups (id) on delete restrict;

create index research_events_group_time_idx
  on public.research_events (group_id, occurred_at desc, id desc)
  where group_id is not null;

create function private.insert_group_research_event(
  event_name text,
  event_actor_id uuid,
  event_school_id uuid,
  event_class_id uuid,
  event_group_id uuid,
  event_payload jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.research_events (
    event_name,
    schema_version,
    actor_id,
    school_id,
    class_id,
    group_id,
    occurred_at,
    payload
  )
  values (
    event_name,
    1,
    event_actor_id,
    event_school_id,
    event_class_id,
    event_group_id,
    now(),
    coalesce(event_payload, '{}'::jsonb)
  );
$$;

create function private.count_current_class_groups(target_class_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.groups as group_row
  where group_row.class_id = target_class_id
    and group_row.deleted_at is null
    and group_row.status <> 'archived';
$$;

create function public.create_student_group(
  target_class_id uuid,
  group_name text,
  group_description text default null
)
returns table(
  outcome text,
  error_code text,
  group_id uuid,
  class_id uuid,
  name text,
  description text,
  status text,
  leader_id uuid,
  current_group_count integer,
  maximum_groups integer,
  remaining_group_slots integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  school_status text;
  trimmed_name text := btrim(coalesce(group_name, ''));
  trimmed_description text := nullif(btrim(coalesce(group_description, '')), '');
  existing_group_count integer;
  denial_code text;
  inserted_group public.groups%rowtype;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into actor_profile
  from public.profiles as profile
  where profile.id = actor_user_id;

  if actor_profile.id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if actor_profile.status <> 'active' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DISABLED';
  end if;

  if actor_profile.email_verified_at is null then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_CONFIRMED';
  end if;

  -- Lock order: class configuration first. Every student group creation for the
  -- class serializes here, so the final-slot check below cannot be raced.
  select *
  into class_row
  from public.classes as class
  where class.id = target_class_id
  for update;

  if class_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.class_members as membership
    where membership.class_id = target_class_id
      and membership.user_id = actor_user_id
      and membership.role = 'student'
      and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select school.status
  into school_status
  from public.schools as school
  where school.id = class_row.school_id;

  if class_row.status <> 'active' or school_status is distinct from 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  if actor_profile.account_type <> 'student'
    or not (select private.is_active_class_student(actor_user_id, target_class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if char_length(trimmed_name) not between 1 and 120
    or (trimmed_description is not null and char_length(trimmed_description) > 1000) then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  existing_group_count := private.count_current_class_groups(target_class_id);

  if not class_row.allow_student_groups then
    denial_code := 'STUDENT_GROUP_CREATION_DISABLED';
  elsif class_row.group_formation_status <> 'open' then
    denial_code := 'GROUP_FORMATION_CLOSED';
  elsif exists (
    select 1
    from public.group_members as member
    where member.class_id = target_class_id
      and member.user_id = actor_user_id
      and member.status = 'active'
  ) then
    denial_code := 'STUDENT_ALREADY_IN_GROUP';
  elsif exists (
    select 1
    from public.student_group_creation_claims as claim
    where claim.class_id = target_class_id
      and claim.student_id = actor_user_id
      and claim.status = 'claimed'
  ) then
    denial_code := 'STUDENT_GROUP_ALREADY_CREATED';
  elsif existing_group_count >= class_row.maximum_groups then
    denial_code := 'GROUP_LIMIT_REACHED';
  end if;

  if denial_code is not null then
    -- Domain denials return a result instead of raising so the denial audit and
    -- research event commit; nothing else is written.
    perform private.insert_audit_log(
      actor_user_id,
      'group_created',
      'class',
      class_row.id,
      class_row.school_id,
      class_row.id,
      'denied',
      jsonb_build_object('error_code', denial_code)
    );

    perform private.insert_group_research_event(
      'group_creation_failed',
      actor_user_id,
      class_row.school_id,
      class_row.id,
      null,
      jsonb_build_object('error_code', denial_code)
    );

    return query
    select
      'denied'::text,
      denial_code,
      null::uuid,
      class_row.id,
      null::text,
      null::text,
      null::text,
      null::uuid,
      existing_group_count,
      class_row.maximum_groups,
      greatest(class_row.maximum_groups - existing_group_count, 0),
      null::timestamptz;
    return;
  end if;

  insert into public.groups (
    class_id,
    name,
    description,
    created_by,
    creator_type,
    status
  )
  values (
    class_row.id,
    trimmed_name,
    trimmed_description,
    actor_user_id,
    'student',
    'forming'
  )
  returning * into inserted_group;

  insert into public.group_members (
    class_id,
    group_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    class_row.id,
    inserted_group.id,
    actor_user_id,
    'leader',
    'active',
    now()
  );

  insert into public.student_group_creation_claims (
    class_id,
    student_id,
    group_id
  )
  values (
    class_row.id,
    actor_user_id,
    inserted_group.id
  );

  insert into public.group_membership_history (
    class_id,
    group_id,
    user_id,
    event_type,
    actor_id,
    payload
  )
  values
    (
      class_row.id,
      inserted_group.id,
      actor_user_id,
      'creation_claimed',
      actor_user_id,
      jsonb_build_object('creator_type', 'student')
    ),
    (
      class_row.id,
      inserted_group.id,
      actor_user_id,
      'joined',
      actor_user_id,
      jsonb_build_object('role', 'leader', 'source', 'student_group_creation')
    ),
    (
      class_row.id,
      inserted_group.id,
      actor_user_id,
      'became_leader',
      actor_user_id,
      jsonb_build_object('source', 'student_group_creation')
    );

  perform private.insert_audit_log(
    actor_user_id,
    'group_created',
    'group',
    inserted_group.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object(
      'creator_type', 'student',
      'current_group_count', existing_group_count + 1,
      'maximum_groups', class_row.maximum_groups
    )
  );

  perform private.insert_group_research_event(
    'group_created',
    actor_user_id,
    class_row.school_id,
    class_row.id,
    inserted_group.id,
    jsonb_build_object(
      'creator_type', 'student',
      'remaining_slots', greatest(class_row.maximum_groups - existing_group_count - 1, 0)
    )
  );

  return query
  select
    'created'::text,
    null::text,
    inserted_group.id,
    class_row.id,
    inserted_group.name,
    inserted_group.description,
    inserted_group.status,
    actor_user_id,
    existing_group_count + 1,
    class_row.maximum_groups,
    greatest(class_row.maximum_groups - existing_group_count - 1, 0),
    inserted_group.created_at;
end;
$$;

revoke execute on function private.insert_group_research_event(text, uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function private.count_current_class_groups(uuid)
  from public, anon, authenticated;
revoke execute on function public.create_student_group(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.create_student_group(uuid, text, text)
  to authenticated;

comment on column public.research_events.group_id is
  'Optional group scope for group-formation research events; pseudonymize or exclude on research export.';
comment on function private.count_current_class_groups(uuid) is
  'Counts groups that occupy a class group slot: not soft-deleted and not archived.';
comment on function public.create_student_group(uuid, text, text) is
  'P3-02 atomic student group creation. Locks the class row, validates membership, formation settings, current group, creation claim, and maximum group count, then creates the group, sole leader, claim, history, audit, and research events. Domain denials return outcome=denied with a stable error_code.';

commit;
