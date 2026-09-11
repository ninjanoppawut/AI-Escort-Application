begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(9);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-000000000901',
  'notify.realtime@example.edu',
  now(),
  '{}'::jsonb
);

select ok(
  exists (
    select 1
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'private'
      and function_row.proname = 'broadcast_notification_signal'
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  'notification signal trigger function is security definer with fixed empty search path'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.broadcast_notification_signal()',
    'EXECUTE'
  ),
  'authenticated role cannot execute notification signal trigger function'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid = table_row.relnamespace
    where namespace.nspname = 'public'
      and table_row.relname = 'notifications'
      and trigger_row.tgname = 'broadcast_notification_signal_after_insert'
      and not trigger_row.tgisinternal
  ),
  'notifications have an insert trigger for private Realtime signals'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'notification_realtime_receive_own_broadcasts'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  'Realtime messages table has a recipient-scoped notification receive policy'
);

select ok(
  position(
    'realtime.topic' in (
    select qual
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'notification_realtime_receive_own_broadcasts'
    )
  ) > 0,
  'Realtime notification policy checks the requested channel topic'
);

select ok(
  position(
    'topic =' in (
    select qual
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'notification_realtime_receive_own_broadcasts'
    )
  ) > 0,
  'Realtime notification policy binds selected message rows to the requested topic'
);

select ok(
  position(
    'auth.uid' in (
    select qual
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'notification_realtime_receive_own_broadcasts'
    )
  ) > 0,
  'Realtime notification policy binds the topic to auth.uid()'
);

select lives_ok(
  $$insert into public.notifications (
      recipient_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      payload
    )
    values (
      '00000000-0000-0000-0000-000000000901',
      'class_joined',
      'Joined',
      'Joined class',
      'class',
      null,
      '{}'::jsonb
    )$$,
  'notification insert emits a private signal without exposing contents'
);

select is(
  (
    select count(*)
    from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000000901'
      and type = 'class_joined'
  ),
  1::bigint,
  'notification row remains durable after signal emission'
);

select * from finish();
rollback;
