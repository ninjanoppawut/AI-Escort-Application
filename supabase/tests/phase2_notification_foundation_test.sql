begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(26);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000801', 'notify.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000802', 'notify.student.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000803', 'notify.student.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000804', 'notify.inactive@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000000801';

update public.profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000804';

insert into public.schools (id, name, created_by)
values ('10000000-0000-0000-0000-000000000801', 'Notification School', '00000000-0000-0000-0000-000000000801');

insert into public.school_memberships (school_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000801', 'teacher', 'active'),
  ('10000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000802', 'student', 'active'),
  ('10000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000803', 'student', 'active');

insert into public.classes (
  id,
  school_id,
  name,
  subject,
  created_by,
  min_group_size,
  max_group_size,
  maximum_groups,
  group_formation_status
)
values (
  '20000000-0000-0000-0000-000000000801',
  '10000000-0000-0000-0000-000000000801',
  'Notification Biology',
  'Biology',
  '00000000-0000-0000-0000-000000000801',
  2,
  4,
  4,
  'open'
);

insert into public.class_members (class_id, user_id, role, status)
values
  ('20000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000801', 'teacher', 'active'),
  ('20000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000802', 'student', 'active'),
  ('20000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000803', 'student', 'active');

select has_table('public', 'notification_types', 'notification type registry exists');
select has_table('public', 'notifications', 'notification table exists');
select col_is_fk('public', 'notifications', 'type', 'notification type is registry-backed');

select is(
  (select count(*) from public.notification_types),
  31::bigint,
  'registry contains every notification type from UI_CONTRACTS section 4'
);

select is(
  (
    select count(*)
    from public.notification_types
    where status = 'active'
      and left(deep_link_template, 1) = '/'
      and copy_key like 'notifications.%'
      and layout in (
        'membership',
        'invitation',
        'group_status',
        'session_status',
        'observation_status',
        'request',
        'warning',
        'export'
      )
  ),
  31::bigint,
  'all registry rows have active layout, copy key, and deep-link metadata'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_types'
      and policyname = 'notification_types_select_active'
  ),
  'notification type registry has an authenticated active-profile select policy'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.notifications',
      'public.notification_types'
    ]) as table_name
    where (
      select relrowsecurity
      from pg_class
      where oid = table_name::regclass
    )
  ),
  2::bigint,
  'notification tables have RLS enabled'
);

select ok(
  has_table_privilege('authenticated', 'public.notification_types', 'SELECT'),
  'authenticated role can read the type registry through RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.notification_types', 'INSERT'),
  'authenticated role cannot write the type registry'
);

select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'INSERT'),
  'authenticated role cannot forge notification rows'
);

select ok(
  has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE'),
  'authenticated role can update read_at'
);

select ok(
  not has_column_privilege('authenticated', 'public.notifications', 'recipient_id', 'UPDATE'),
  'authenticated role cannot update recipient_id'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.insert_notification(uuid,text,text,text,text,uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated role cannot execute private notification producer helper'
);

select ok(
  (
    select function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'private'
      and function_row.proname = 'insert_notification'
  ),
  'private notification producer is security definer with fixed empty search path'
);

select lives_ok(
  $$select private.insert_notification(
    '00000000-0000-0000-0000-000000000802',
    'class_joined',
    'Joined',
    'Joined class',
    'class',
    '20000000-0000-0000-0000-000000000801',
    '{"classId":"20000000-0000-0000-0000-000000000801"}'::jsonb
  )$$,
  'trusted producer inserts a registered notification type'
);

select is(
  (
    select count(*)
    from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000000802'
      and type = 'class_joined'
      and class_id = '20000000-0000-0000-0000-000000000801'
      and school_id = '10000000-0000-0000-0000-000000000801'
  ),
  1::bigint,
  'notification target trigger derives class and school relational IDs'
);

select throws_ok(
  $$select private.insert_notification(
    '00000000-0000-0000-0000-000000000802',
    'not_a_real_type',
    'Bad',
    'Bad',
    'class',
    '20000000-0000-0000-0000-000000000801',
    '{}'::jsonb
  )$$,
  '23514',
  'NOTIFICATION_TYPE_INVALID',
  'trusted producer rejects unknown notification types'
);

select throws_ok(
  $$select private.insert_notification(
    '00000000-0000-0000-0000-000000000802',
    'class_joined',
    'Bad',
    'Bad',
    'class',
    '20000000-0000-0000-0000-000000000801',
    '[]'::jsonb
  )$$,
  '23514',
  'NOTIFICATION_PAYLOAD_INVALID',
  'trusted producer rejects non-object payloads'
);

select throws_ok(
  $$select private.insert_notification(
    '00000000-0000-0000-0000-000000000804',
    'class_joined',
    'Bad',
    'Bad',
    'class',
    '20000000-0000-0000-0000-000000000801',
    '{}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN',
  'trusted producer rejects inactive recipients'
);

select throws_ok(
  $$insert into public.notifications (recipient_id, type, title, message)
    values (
      '00000000-0000-0000-0000-000000000802',
      'not_a_real_type',
      'Bad',
      'Bad'
    )$$,
  '23503',
  null,
  'database foreign key rejects unknown notification type on direct trusted insert'
);

insert into public.notifications (id, recipient_id, type, title, message, entity_type, entity_id)
values
  (
    '50000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000802',
    'class_joined',
    'Own',
    'Own notification',
    'class',
    '20000000-0000-0000-0000-000000000801'
  ),
  (
    '50000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000803',
    'class_joined',
    'Other',
    'Other notification',
    'class',
    '20000000-0000-0000-0000-000000000801'
  );

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000802', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.notification_types),
  31::bigint,
  'active authenticated user can read active registry rows'
);

select is(
  (select count(*) from public.notifications),
  2::bigint,
  'recipient sees only their own notification rows'
);

update public.notifications
set read_at = now()
where id = '50000000-0000-0000-0000-000000000801';

select is(
  (
    select count(*)
    from public.notifications
    where id = '50000000-0000-0000-0000-000000000801'
      and read_at is not null
  ),
  1::bigint,
  'recipient can mark their own notification read'
);

update public.notifications
set read_at = now()
where id = '50000000-0000-0000-0000-000000000802';

select is(
  (
    select count(*)
    from public.notifications
    where id = '50000000-0000-0000-0000-000000000802'
      and read_at is not null
  ),
  0::bigint,
  'recipient cannot mark another user notification read'
);

select throws_ok(
  $$insert into public.notifications (recipient_id, type, title, message)
    values (
      '00000000-0000-0000-0000-000000000802',
      'class_joined',
      'Forged',
      'Forged'
    )$$,
  '42501',
  null,
  'authenticated browser caller cannot insert notifications'
);

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000804', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.notification_types),
  0::bigint,
  'inactive profile cannot read notification registry rows'
);

select * from finish();
rollback;
