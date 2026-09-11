begin;

create function private.class_group_topic_class_id(topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when topic ~ '^class:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:groups$'
      then split_part(topic, ':', 2)::uuid
    else null
  end;
$$;

create function private.send_class_group_signal(
  signal_type text,
  target_class_id uuid,
  target_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The payload is a pointer only: clients refetch the authoritative board.
  perform realtime.send(
    jsonb_build_object(
      'type', signal_type,
      'version', 1,
      'classId', target_class_id,
      'groupId', target_group_id,
      'changedAt', now()
    ),
    signal_type,
    'class:' || target_class_id::text || ':groups',
    true
  );
end;
$$;

create function private.broadcast_group_row_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  signal_type text;
begin
  if tg_op = 'INSERT' then
    signal_type := 'group.created';
  elsif tg_op = 'DELETE' then
    perform private.send_class_group_signal('group.deleted', old.class_id, old.id);
    return null;
  elsif new.deleted_at is not null and old.deleted_at is null then
    signal_type := 'group.deleted';
  elsif new.status = 'archived' and old.status <> 'archived' then
    signal_type := 'group.archived';
  elsif new.status = 'locked' and old.status <> 'locked' then
    signal_type := 'group.locked';
  elsif old.status = 'locked' and new.status <> 'locked' then
    signal_type := 'group.unlocked';
  else
    signal_type := 'group.updated';
  end if;

  perform private.send_class_group_signal(signal_type, new.class_id, new.id);
  return null;
end;
$$;

create function private.broadcast_group_member_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  signal_type text;
begin
  if tg_op = 'INSERT' then
    signal_type := 'group.member_joined';
  elsif tg_op = 'DELETE' then
    perform private.send_class_group_signal('group.member_left', old.class_id, old.group_id);
    return null;
  elsif new.group_id <> old.group_id then
    signal_type := 'group.member_moved';
  elsif new.status <> old.status then
    signal_type := case
      when new.status = 'active' then 'group.member_joined'
      else 'group.member_left'
    end;
  elsif new.role <> old.role then
    signal_type := 'group.leader_changed';
  else
    signal_type := 'group.updated';
  end if;

  perform private.send_class_group_signal(signal_type, new.class_id, new.group_id);
  return null;
end;
$$;

create function private.broadcast_class_group_settings_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.allow_student_groups, new.group_formation_status, new.status)
    is distinct from (old.allow_student_groups, old.group_formation_status, old.status) then
    perform private.send_class_group_signal('group.formation_changed', new.id, null);
  end if;

  if (new.min_group_size, new.max_group_size, new.maximum_groups)
    is distinct from (old.min_group_size, old.max_group_size, old.maximum_groups) then
    perform private.send_class_group_signal('group.capacity_changed', new.id, null);
  end if;

  return null;
end;
$$;

create function private.broadcast_group_claim_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Claim resets change a student's create eligibility without a group row change.
  perform private.send_class_group_signal('group.updated', new.class_id, new.group_id);
  return null;
end;
$$;

create trigger groups_broadcast_class_group_signal
after insert or update or delete on public.groups
for each row execute function private.broadcast_group_row_signal();

create trigger group_members_broadcast_class_group_signal
after insert or update or delete on public.group_members
for each row execute function private.broadcast_group_member_signal();

create trigger classes_broadcast_class_group_settings_signal
after update of min_group_size, max_group_size, maximum_groups, allow_student_groups, group_formation_status, status
on public.classes
for each row execute function private.broadcast_class_group_settings_signal();

create trigger student_group_creation_claims_broadcast_class_group_signal
after update on public.student_group_creation_claims
for each row execute function private.broadcast_group_claim_signal();

drop policy if exists class_group_realtime_receive_member_broadcasts
  on realtime.messages;
create policy class_group_realtime_receive_member_broadcasts
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.topic = (select realtime.topic())
  and (select private.class_group_topic_class_id((select realtime.topic()))) is not null
  and (
    select private.current_user_is_class_member(
      private.class_group_topic_class_id((select realtime.topic()))
    )
  )
);

revoke execute on function private.class_group_topic_class_id(text)
  from public, anon;
grant execute on function private.class_group_topic_class_id(text)
  to authenticated;
revoke execute on function private.send_class_group_signal(text, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.broadcast_group_row_signal()
  from public, anon, authenticated;
revoke execute on function private.broadcast_group_member_signal()
  from public, anon, authenticated;
revoke execute on function private.broadcast_class_group_settings_signal()
  from public, anon, authenticated;
revoke execute on function private.broadcast_group_claim_signal()
  from public, anon, authenticated;

comment on function private.class_group_topic_class_id(text) is
  'Parses a strict class:{uuid}:groups Realtime topic; returns null for any other topic.';
comment on function private.send_class_group_signal(text, uuid, uuid) is
  'Emits a private class-group Broadcast signal carrying only type, version, class, group, and time.';
comment on policy class_group_realtime_receive_member_broadcasts on realtime.messages is
  'P3-04: only active members of the class in class:{classId}:groups receive its group signals.';

commit;
