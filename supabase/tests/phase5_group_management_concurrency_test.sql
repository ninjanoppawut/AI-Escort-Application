begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public;

select plan(9);

-- Real concurrent sessions through dblink. Fixtures are committed by those
-- sessions, so every run uses fresh IDs and cleans up.
create temporary table race (
  key text primary key,
  value text not null
);

insert into race (key, value)
select key, gen_random_uuid()::text
from unnest(array['teacher', 'leader', 's1', 's2', 's3', 'school', 'class']) as key;
insert into race (key, value) values ('suffix', substr(md5(random()::text), 1, 12));

create function pg_temp.id(key_value text)
returns uuid
language sql
as $$
  select value::uuid from race where key = key_value;
$$;

-- dblink requires password authentication for non-superusers.
create function pg_temp.connection_string()
returns text
language sql
as $$
  select format(
    'host=%s port=%s dbname=postgres user=postgres password=postgres',
    coalesce(host(inet_server_addr()), '127.0.0.1'),
    coalesce(inet_server_port(), 5432)
  );
$$;

-- dblink_exec refuses statements that return rows, so claims use SET.
create function pg_temp.claims_sql(key_value text)
returns text
language sql
as $$
  select 'set local request.jwt.claims to ' || quote_literal(
    jsonb_build_object('sub', pg_temp.id(key_value), 'role', 'authenticated', 'aal', 'aal1')::text
  );
$$;

create function pg_temp.autocommit_claims_sql(key_value text)
returns text
language sql
as $$
  select 'set request.jwt.claims to ' || quote_literal(
    jsonb_build_object('sub', pg_temp.id(key_value), 'role', 'authenticated', 'aal', 'aal1')::text
  );
$$;

select lives_ok(
  $$select dblink_connect('p5_setup', pg_temp.connection_string())$$,
  'dblink can open a separate session to the local database'
);

select dblink_connect('p5_one', pg_temp.connection_string());
select dblink_connect('p5_two', pg_temp.connection_string());

select dblink_exec('p5_setup', format($fixture$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values
    (%1$L, %8$L || '.teacher@example.edu', now(), '{}'::jsonb),
    (%2$L, %8$L || '.leader@example.edu', now(), '{}'::jsonb),
    (%3$L, %8$L || '.s1@example.edu', now(), '{}'::jsonb),
    (%4$L, %8$L || '.s2@example.edu', now(), '{}'::jsonb),
    (%5$L, %8$L || '.s3@example.edu', now(), '{}'::jsonb);
  update public.profiles set account_type = 'teacher' where id = %1$L;
  insert into public.schools (id, name, created_by) values (%6$L, 'P5 Race School', %1$L);
  insert into public.school_memberships (school_id, user_id, role)
  select %6$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L, %4$L, %5$L]::uuid[]) as user_id;
  insert into public.classes (
    id, school_id, name, min_group_size, max_group_size, maximum_groups,
    allow_student_groups, group_formation_status, created_by
  )
  values (%7$L, %6$L, 'P5 Race Class', 1, 2, 2, true, 'open', %1$L);
  insert into public.class_members (class_id, user_id, role)
  select %7$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L, %4$L, %5$L]::uuid[]) as user_id;
$fixture$,
  pg_temp.id('teacher'), pg_temp.id('leader'), pg_temp.id('s1'), pg_temp.id('s2'),
  pg_temp.id('s3'), pg_temp.id('school'), pg_temp.id('class'),
  'p5race-' || (select value from race where key = 'suffix')
));

select dblink_exec('p5_setup', pg_temp.autocommit_claims_sql('leader'));
insert into race (key, value)
select 'group', group_id::text
from dblink('p5_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)',
  pg_temp.id('class'), 'P5 Leaf'
)) as created(group_id uuid);

-- Race 1: two teacher sessions move different students into the final seat.
select dblink_exec('p5_one', 'begin');
select dblink_exec('p5_one', pg_temp.claims_sql('teacher'));
insert into race (key, value)
select 'move_first', outcome || ':' || coalesce(error_code, '')
from dblink('p5_one', format(
  'select outcome, error_code from public.move_student_between_groups(%L, %L, %L)',
  pg_temp.id('class'), pg_temp.id('s1'), pg_temp.id('group')
)) as moved(outcome text, error_code text);

select dblink_exec('p5_two', 'begin');
select dblink_exec('p5_two', pg_temp.claims_sql('teacher'));
select dblink_send_query('p5_two', format(
  'select outcome, error_code from public.move_student_between_groups(%L, %L, %L)',
  pg_temp.id('class'), pg_temp.id('s2'), pg_temp.id('group')
));
select pg_sleep(0.5);
insert into race (key, value) values ('move_blocked', dblink_is_busy('p5_two')::text);
select dblink_exec('p5_one', 'commit');
insert into race (key, value)
select 'move_second', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p5_two') as moved(outcome text, error_code text);
select * from dblink_get_result('p5_two') as drained(outcome text, error_code text);
select dblink_exec('p5_two', 'commit');

select is((select value from race where key = 'move_first'), 'moved:', 'first move into the final seat succeeds');
select is((select value from race where key = 'move_blocked'), '1', 'second move waits on the destination lock');
select is((select value from race where key = 'move_second'), 'denied:GROUP_FULL', 'second move revalidates capacity and is refused');
select is(
  (
    select active_members
    from dblink('p5_setup', format(
      'select count(*) from public.group_members where group_id = %L and status = %L',
      pg_temp.id('group'), 'active'
    )) as counted(active_members bigint)
  ),
  2::bigint,
  'the destination never exceeds capacity'
);

-- Race 2: teacher creation and student creation race for the final group slot.
select dblink_exec('p5_one', 'begin');
select dblink_exec('p5_one', pg_temp.claims_sql('teacher'));
insert into race (key, value)
select 'create_teacher', outcome || ':' || coalesce(error_code, '')
from dblink('p5_one', format(
  'select outcome, error_code from public.create_teacher_group(%L, %L)',
  pg_temp.id('class'), 'P5 Teacher Team'
)) as created(outcome text, error_code text);

select dblink_exec('p5_two', 'begin');
select dblink_exec('p5_two', pg_temp.claims_sql('s2'));
select dblink_send_query('p5_two', format(
  'select outcome, error_code from public.create_student_group(%L, %L, null)',
  pg_temp.id('class'), 'P5 Student Team'
));
select pg_sleep(0.5);
insert into race (key, value) values ('create_blocked', dblink_is_busy('p5_two')::text);
select dblink_exec('p5_one', 'commit');
insert into race (key, value)
select 'create_student', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p5_two') as created(outcome text, error_code text);
select * from dblink_get_result('p5_two') as drained(outcome text, error_code text);
select dblink_exec('p5_two', 'commit');

select is((select value from race where key = 'create_teacher'), 'created:', 'teacher creation takes the final slot');
select is((select value from race where key = 'create_blocked'), '1', 'student creation waits on the same class lock');
select is(
  (select value from race where key = 'create_student'),
  'denied:GROUP_LIMIT_REACHED',
  'student creation is refused because teachers share the absolute maximum'
);
select is(
  (
    select current_groups
    from dblink('p5_setup', format(
      'select count(*) from public.groups where class_id = %L and deleted_at is null and status <> %L',
      pg_temp.id('class'), 'archived'
    )) as counted(current_groups bigint)
  ),
  2::bigint,
  'the class never exceeds maximum_groups'
);

select dblink_exec('p5_setup', format($cleanup$
  delete from public.notifications where class_id = %1$L;
  delete from public.research_events where class_id = %1$L;
  delete from public.audit_logs where class_id = %1$L;
  delete from public.group_invitations where class_id = %1$L;
  alter table public.group_membership_history disable trigger group_membership_history_prevent_delete;
  delete from public.group_membership_history where class_id = %1$L;
  alter table public.group_membership_history enable trigger group_membership_history_prevent_delete;
  delete from public.student_group_creation_claims where class_id = %1$L;
  alter table public.group_members disable trigger group_members_one_active_leader;
  delete from public.group_members where class_id = %1$L;
  alter table public.group_members enable trigger group_members_one_active_leader;
  alter table public.groups disable trigger groups_one_active_leader;
  delete from public.groups where class_id = %1$L;
  alter table public.groups enable trigger groups_one_active_leader;
  delete from public.class_members where class_id = %1$L;
  delete from public.classes where id = %1$L;
  delete from public.school_memberships where school_id = %2$L;
  delete from public.schools where id = %2$L;
  delete from public.profiles where id = any(%3$L::uuid[]);
  delete from auth.users where id = any(%3$L::uuid[]);
$cleanup$,
  pg_temp.id('class'),
  pg_temp.id('school'),
  array[
    pg_temp.id('teacher'), pg_temp.id('leader'), pg_temp.id('s1'), pg_temp.id('s2'), pg_temp.id('s3')
  ]::text
));

select dblink_disconnect('p5_one');
select dblink_disconnect('p5_two');
select dblink_disconnect('p5_setup');

select * from finish();
rollback;
