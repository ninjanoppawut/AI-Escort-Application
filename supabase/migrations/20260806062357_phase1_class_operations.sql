begin;

create function private.generate_class_invite_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select upper(
    substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 4)
    || '-'
    || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 4)
  );
$$;

create function private.generate_class_invite_token()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select replace(
    replace(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+', '-'),
    '/',
    '_'
  );
$$;

create function private.insert_research_event(
  event_name text,
  event_actor_id uuid,
  event_school_id uuid,
  event_class_id uuid,
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
    occurred_at,
    payload
  )
  values (
    event_name,
    1,
    event_actor_id,
    event_school_id,
    event_class_id,
    now(),
    coalesce(event_payload, '{}'::jsonb)
  );
$$;

create function public.create_class(
  target_school_id uuid,
  class_name text,
  class_subject text,
  class_academic_year text,
  class_semester text,
  class_description text,
  minimum_group_size integer,
  maximum_group_size integer,
  maximum_group_count integer,
  allow_student_group_creation boolean,
  initial_formation_status text
)
returns table(
  class_id uuid,
  school_id uuid,
  name text,
  subject text,
  academic_year text,
  semester text,
  description text,
  min_group_size integer,
  max_group_size integer,
  maximum_groups integer,
  allow_student_groups boolean,
  group_formation_status text,
  status text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  inserted_class public.classes%rowtype;
  trimmed_name text := btrim(coalesce(class_name, ''));
  trimmed_subject text := nullif(btrim(coalesce(class_subject, '')), '');
  trimmed_academic_year text := nullif(btrim(coalesce(class_academic_year, '')), '');
  trimmed_semester text := nullif(btrim(coalesce(class_semester, '')), '');
  trimmed_description text := nullif(btrim(coalesce(class_description, '')), '');
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not (select private.is_active_school_teacher(actor_user_id, target_school_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if char_length(trimmed_name) not between 1 and 120
    or (trimmed_subject is not null and char_length(trimmed_subject) > 120)
    or (trimmed_academic_year is not null and char_length(trimmed_academic_year) > 16)
    or (trimmed_semester is not null and char_length(trimmed_semester) > 24)
    or (trimmed_description is not null and char_length(trimmed_description) > 1000)
    or minimum_group_size < 1
    or maximum_group_size < minimum_group_size
    or maximum_group_count < 1
    or initial_formation_status not in ('open', 'closed') then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.schools as school
  where school.id = target_school_id
    and school.status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  insert into public.classes (
    school_id,
    name,
    subject,
    academic_year,
    semester,
    description,
    min_group_size,
    max_group_size,
    maximum_groups,
    allow_student_groups,
    group_formation_status,
    created_by
  )
  values (
    target_school_id,
    trimmed_name,
    trimmed_subject,
    trimmed_academic_year,
    trimmed_semester,
    trimmed_description,
    minimum_group_size,
    maximum_group_size,
    maximum_group_count,
    allow_student_group_creation,
    initial_formation_status,
    actor_user_id
  )
  returning * into inserted_class;

  insert into public.class_members (class_id, user_id, role, status, joined_at, left_at)
  values (inserted_class.id, actor_user_id, 'teacher', 'active', now(), null);

  perform private.insert_audit_log(
    actor_user_id,
    'class_created',
    'class',
    inserted_class.id,
    inserted_class.school_id,
    inserted_class.id,
    'succeeded',
    jsonb_build_object(
      'minimum_group_size', inserted_class.min_group_size,
      'maximum_group_size', inserted_class.max_group_size,
      'maximum_groups', inserted_class.maximum_groups,
      'allow_student_groups', inserted_class.allow_student_groups,
      'formation_status', inserted_class.group_formation_status
    )
  );

  perform private.insert_research_event(
    'class_created',
    actor_user_id,
    inserted_class.school_id,
    inserted_class.id,
    jsonb_build_object(
      'minimum_group_size', inserted_class.min_group_size,
      'maximum_group_size', inserted_class.max_group_size,
      'maximum_groups', inserted_class.maximum_groups,
      'allow_student_groups', inserted_class.allow_student_groups,
      'formation_status', inserted_class.group_formation_status
    )
  );

  return query
  select
    inserted_class.id,
    inserted_class.school_id,
    inserted_class.name,
    inserted_class.subject,
    inserted_class.academic_year,
    inserted_class.semester,
    inserted_class.description,
    inserted_class.min_group_size,
    inserted_class.max_group_size,
    inserted_class.maximum_groups,
    inserted_class.allow_student_groups,
    inserted_class.group_formation_status,
    inserted_class.status,
    inserted_class.created_by,
    inserted_class.created_at;
end;
$$;

create function public.update_class_group_settings(
  target_class_id uuid,
  minimum_group_size integer,
  maximum_group_size integer,
  maximum_group_count integer,
  allow_student_group_creation boolean,
  formation_status text
)
returns table(
  class_id uuid,
  min_group_size integer,
  max_group_size integer,
  maximum_groups integer,
  allow_student_groups boolean,
  group_formation_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  class_row public.classes%rowtype;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into class_row
  from public.classes as class
  where class.id = target_class_id
  for update;

  if class_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if class_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  if not (select private.is_active_class_teacher(actor_user_id, target_class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if minimum_group_size < 1
    or maximum_group_size < minimum_group_size
    or maximum_group_count < 1
    or formation_status not in ('open', 'closed') then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  update public.classes as class
  set min_group_size = minimum_group_size,
      max_group_size = maximum_group_size,
      maximum_groups = maximum_group_count,
      allow_student_groups = allow_student_group_creation,
      group_formation_status = formation_status
  where class.id = target_class_id
  returning * into class_row;

  perform private.insert_audit_log(
    actor_user_id,
    'class_group_settings_updated',
    'class',
    target_class_id,
    class_row.school_id,
    target_class_id,
    'succeeded',
    jsonb_build_object(
      'minimum_group_size', class_row.min_group_size,
      'maximum_group_size', class_row.max_group_size,
      'maximum_groups', class_row.maximum_groups,
      'allow_student_groups', class_row.allow_student_groups,
      'formation_status', class_row.group_formation_status
    )
  );

  perform private.insert_research_event(
    'class_group_settings_updated',
    actor_user_id,
    class_row.school_id,
    target_class_id,
    jsonb_build_object(
      'minimum_group_size', class_row.min_group_size,
      'maximum_group_size', class_row.max_group_size,
      'maximum_groups', class_row.maximum_groups,
      'allow_student_groups', class_row.allow_student_groups,
      'formation_status', class_row.group_formation_status
    )
  );

  return query
  select
    class_row.id,
    class_row.min_group_size,
    class_row.max_group_size,
    class_row.maximum_groups,
    class_row.allow_student_groups,
    class_row.group_formation_status,
    class_row.updated_at;
end;
$$;

create function public.issue_class_invite(
  target_class_id uuid,
  invitation_expires_at timestamptz default null,
  maximum_uses integer default null
)
returns table(
  invite_id uuid,
  code text,
  token text,
  expires_at timestamptz,
  max_uses integer,
  used_count integer,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  class_row public.classes%rowtype;
  generated_code text;
  generated_token text;
  inserted_invite public.class_invites%rowtype;
  attempt_count integer := 0;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into class_row
  from public.classes as class
  where class.id = target_class_id
  for update;

  if class_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if class_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  if not (select private.is_active_class_teacher(actor_user_id, target_class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if (invitation_expires_at is not null and invitation_expires_at <= now())
    or (maximum_uses is not null and maximum_uses < 1) then
    raise exception using errcode = '23514', message = 'INVITE_INVALID';
  end if;

  loop
    attempt_count := attempt_count + 1;
    generated_code := private.generate_class_invite_code();
    generated_token := private.generate_class_invite_token();

    begin
      insert into public.class_invites (
        class_id,
        code,
        token_hash,
        created_by,
        expires_at,
        max_uses
      )
      values (
        target_class_id,
        generated_code,
        private.hash_invitation_token(generated_token),
        actor_user_id,
        invitation_expires_at,
        maximum_uses
      )
      returning * into inserted_invite;
      exit;
    exception
      when unique_violation then
        if attempt_count >= 5 then
          raise exception using errcode = '23505', message = 'INVITE_INVALID';
        end if;
    end;
  end loop;

  perform private.insert_audit_log(
    actor_user_id,
    'class_invitation_issued',
    'class_invite',
    inserted_invite.id,
    class_row.school_id,
    target_class_id,
    'succeeded',
    jsonb_build_object(
      'has_expiry', inserted_invite.expires_at is not null,
      'has_max_uses', inserted_invite.max_uses is not null
    )
  );

  perform private.insert_research_event(
    'class_invitation_issued',
    actor_user_id,
    class_row.school_id,
    target_class_id,
    jsonb_build_object(
      'has_expiry', inserted_invite.expires_at is not null,
      'has_max_uses', inserted_invite.max_uses is not null
    )
  );

  return query
  select
    inserted_invite.id,
    inserted_invite.code,
    generated_token,
    inserted_invite.expires_at,
    inserted_invite.max_uses,
    inserted_invite.used_count,
    inserted_invite.status,
    inserted_invite.created_at;
end;
$$;

create function public.disable_class_invite(target_invite_id uuid)
returns table(invite_id uuid, status text, disabled_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  invite_row public.class_invites%rowtype;
  class_row public.classes%rowtype;
  changed boolean := false;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into invite_row
  from public.class_invites as invite
  where invite.id = target_invite_id
  for update;

  if invite_row.id is null then
    raise exception using errcode = '42501', message = 'INVITE_INVALID';
  end if;

  select *
  into class_row
  from public.classes as class
  where class.id = invite_row.class_id
  for update;

  if class_row.id is null then
    raise exception using errcode = '42501', message = 'INVITE_INVALID';
  end if;

  if class_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  if not (select private.is_active_class_teacher(actor_user_id, invite_row.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if invite_row.status = 'active' then
    update public.class_invites as invite
    set status = 'disabled',
        disabled_by = actor_user_id,
        disabled_at = now()
    where invite.id = target_invite_id
    returning * into invite_row;
    changed := true;
  end if;

  if changed then
    perform private.insert_audit_log(
      actor_user_id,
      'class_invitation_disabled',
      'class_invite',
      invite_row.id,
      class_row.school_id,
      class_row.id,
      'succeeded',
      jsonb_build_object('used_count', invite_row.used_count)
    );

    perform private.insert_research_event(
      'class_invitation_disabled',
      actor_user_id,
      class_row.school_id,
      class_row.id,
      jsonb_build_object('used_count', invite_row.used_count)
    );
  end if;

  return query select invite_row.id, invite_row.status, invite_row.disabled_at;
end;
$$;

create function public.rotate_class_invite(
  target_invite_id uuid,
  invitation_expires_at timestamptz default null,
  maximum_uses integer default null
)
returns table(
  invite_id uuid,
  code text,
  token text,
  expires_at timestamptz,
  max_uses integer,
  used_count integer,
  status text,
  created_at timestamptz,
  superseded_invite_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  old_invite public.class_invites%rowtype;
  class_row public.classes%rowtype;
  new_invite public.class_invites%rowtype;
  generated_code text;
  generated_token text;
  attempt_count integer := 0;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into old_invite
  from public.class_invites as invite
  where invite.id = target_invite_id
  for update;

  if old_invite.id is null then
    raise exception using errcode = '42501', message = 'INVITE_INVALID';
  end if;

  select *
  into class_row
  from public.classes as class
  where class.id = old_invite.class_id
  for update;

  if class_row.id is null then
    raise exception using errcode = '42501', message = 'INVITE_INVALID';
  end if;

  if class_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  if old_invite.status <> 'active' then
    raise exception using errcode = '42501', message = 'INVITE_DISABLED';
  end if;

  if not (select private.is_active_class_teacher(actor_user_id, old_invite.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if (invitation_expires_at is not null and invitation_expires_at <= now())
    or (maximum_uses is not null and maximum_uses < 1) then
    raise exception using errcode = '23514', message = 'INVITE_INVALID';
  end if;

  update public.class_invites as invite
  set status = 'disabled',
      disabled_by = actor_user_id,
      disabled_at = now()
  where invite.id = target_invite_id;

  loop
    attempt_count := attempt_count + 1;
    generated_code := private.generate_class_invite_code();
    generated_token := private.generate_class_invite_token();

    begin
      insert into public.class_invites (
        class_id,
        code,
        token_hash,
        created_by,
        expires_at,
        max_uses
      )
      values (
        old_invite.class_id,
        generated_code,
        private.hash_invitation_token(generated_token),
        actor_user_id,
        invitation_expires_at,
        maximum_uses
      )
      returning * into new_invite;
      exit;
    exception
      when unique_violation then
        if attempt_count >= 5 then
          raise exception using errcode = '23505', message = 'INVITE_INVALID';
        end if;
    end;
  end loop;

  perform private.insert_audit_log(
    actor_user_id,
    'class_invitation_rotated',
    'class_invite',
    new_invite.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object(
      'superseded_invite_id', old_invite.id,
      'previous_used_count', old_invite.used_count,
      'has_expiry', new_invite.expires_at is not null,
      'has_max_uses', new_invite.max_uses is not null
    )
  );

  perform private.insert_research_event(
    'class_invitation_rotated',
    actor_user_id,
    class_row.school_id,
    class_row.id,
    jsonb_build_object(
      'previous_used_count', old_invite.used_count,
      'has_expiry', new_invite.expires_at is not null,
      'has_max_uses', new_invite.max_uses is not null
    )
  );

  return query
  select
    new_invite.id,
    new_invite.code,
    generated_token,
    new_invite.expires_at,
    new_invite.max_uses,
    new_invite.used_count,
    new_invite.status,
    new_invite.created_at,
    old_invite.id;
end;
$$;

revoke execute on function private.generate_class_invite_code()
  from public, anon, authenticated;
revoke execute on function private.generate_class_invite_token()
  from public, anon, authenticated;
revoke execute on function private.insert_research_event(text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

revoke execute on function public.create_class(uuid, text, text, text, text, text, integer, integer, integer, boolean, text)
  from public, anon, authenticated;
revoke execute on function public.update_class_group_settings(uuid, integer, integer, integer, boolean, text)
  from public, anon, authenticated;
revoke execute on function public.issue_class_invite(uuid, timestamptz, integer)
  from public, anon, authenticated;
revoke execute on function public.disable_class_invite(uuid)
  from public, anon, authenticated;
revoke execute on function public.rotate_class_invite(uuid, timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.create_class(uuid, text, text, text, text, text, integer, integer, integer, boolean, text)
  to authenticated;
grant execute on function public.update_class_group_settings(uuid, integer, integer, integer, boolean, text)
  to authenticated;
grant execute on function public.issue_class_invite(uuid, timestamptz, integer)
  to authenticated;
grant execute on function public.disable_class_invite(uuid)
  to authenticated;
grant execute on function public.rotate_class_invite(uuid, timestamptz, integer)
  to authenticated;

comment on function public.create_class(uuid, text, text, text, text, text, integer, integer, integer, boolean, text) is
  'P1-03 trusted class creation RPC; creates the teacher membership and events atomically.';
comment on function public.issue_class_invite(uuid, timestamptz, integer) is
  'P1-03 trusted class-invitation issue RPC; returns plaintext code/token only on issuance and stores only a hash.';
comment on function public.rotate_class_invite(uuid, timestamptz, integer) is
  'P1-03 trusted class-invitation rotation RPC; disables the superseded invite before returning a replacement.';

commit;
