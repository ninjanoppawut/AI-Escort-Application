begin;

-- The next waiting group becomes `ready` (UI status "กลุ่มถัดไป") as soon as the
-- current group starts, so its members are told to prepare (SES-006). The
-- earlier helper also skipped promotion while any group was `active`, which
-- meant activation never promoted anyone. Only an existing `ready` group
-- blocks promotion now, and its ID is returned so completion still reports
-- which group is next.
create or replace function private.promote_next_session_group(target_session_id uuid, actor_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ready_group_id uuid;
  next_group public.exploration_session_groups%rowtype;
begin
  select session_group.id into ready_group_id
  from public.exploration_session_groups as session_group
  where session_group.session_id = target_session_id
    and session_group.status = 'ready'
  order by session_group.queue_position
  limit 1;

  if ready_group_id is not null then
    return ready_group_id;
  end if;

  select * into next_group
  from public.exploration_session_groups as session_group
  where session_group.session_id = target_session_id
    and session_group.status = 'waiting'
  order by session_group.queue_position
  limit 1;

  if next_group.id is null then
    return null;
  end if;

  update public.exploration_session_groups as session_group
  set status = 'ready'
  where session_group.id = next_group.id;

  perform private.notify_session_group(
    next_group.id, 'session_group_next', 'กลุ่มของคุณเป็นกลุ่มถัดไป',
    'กลุ่มของคุณเป็นกลุ่มถัดไป เตรียมพร้อมสำรวจ', actor_user_id
  );

  return next_group.id;
end;
$$;

revoke execute on function private.promote_next_session_group(uuid, uuid) from public, anon, authenticated;

commit;
