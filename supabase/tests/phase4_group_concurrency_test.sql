begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public;

select plan(12);

-- Each race uses real concurrent sessions through dblink. Fixtures are
-- committed by those sessions, so every run uses fresh IDs and cleans up.
create temporary table race (
  key text primary key,
  value text not null
);

insert into race (key, value)
select key, gen_random_uuid()::text
from unnest(array[
  'teacher', 'leader', 'other_leader', 's1', 's2', 's3', 'm1', 'm2',
  'school', 'class'
]) as key;
insert into race (key, value) values ('suffix', substr(md5(random()::text), 1, 12));

create function pg_temp.id(key_value text)
returns uuid
language sql
as $$
  select value::uuid from race where key = key_value;
$$;

-- dblink requires password authentication for non-superusers. Loopback is
-- trust-authenticated in the local stack, so connect through the address the
-- test session itself used, which requires the password.
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

create function pg_temp.claims_sql(key_value text)
returns text
language sql
as $$
  select format(
    'select set_config(%L, %L, true)',
    'request.jwt.claims',
    jsonb_build_object('sub', pg_temp.id(key_value), 'role', 'authenticated', 'aal', 'aal1')::text
  );
$$;

create function pg_temp.autocommit_claims_sql(key_value text)
returns text
language sql
as $$
  select format(
    'select set_config(%L, %L, false)',
    'request.jwt.claims',
    jsonb_build_object('sub', pg_temp.id(key_value), 'role', 'authenticated', 'aal', 'aal1')::text
  );
$$;

select lives_ok(
  $$select dblink_connect('race_setup', pg_temp.connection_string())$$,
  'dblink can open a separate session to the local database'
);

select dblink_connect('race_one', pg_temp.connection_string());
select dblink_connect('race_two', pg_temp.connection_string());

-- Committed fixtures.
select dblink_exec('race_setup', format($fixture$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values
    (%1$L, %11$L || '.teacher@example.edu', now(), '{}'::jsonb),
    (%2$L, %11$L || '.leader@example.edu', now(), '{}'::jsonb),
    (%3$L, %11$L || '.other-leader@example.edu', now(), '{}'::jsonb),
    (%4$L, %11$L || '.s1@example.edu', now(), '{}'::jsonb),
    (%5$L, %11$L || '.s2@example.edu', now(), '{}'::jsonb),
    (%6$L, %11$L || '.s3@example.edu', now(), '{}'::jsonb),
    (%7$L, %11$L || '.m1@example.edu', now(), '{}'::jsonb),
    (%8$L, %11$L || '.m2@example.edu', now(), '{}'::jsonb);
  update public.profiles set account_type = 'teacher' where id = %1$L;
  insert into public.schools (id, name, created_by) values (%9$L, 'Race School', %1$L);
  insert into public.school_memberships (school_id, user_id, role)
  select %9$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L, %4$L, %5$L, %6$L, %7$L, %8$L]::uuid[]) as user_id;
  insert into public.classes (
    id, school_id, name, min_group_size, max_group_size, maximum_groups,
    allow_student_groups, group_formation_status, created_by
  )
  values (%10$L, %9$L, 'Race Class', 1, 3, 5, true, 'open', %1$L);
  insert into public.class_members (class_id, user_id, role)
  select %10$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L, %4$L, %5$L, %6$L, %7$L, %8$L]::uuid[]) as user_id;
$fixture$,
  pg_temp.id('teacher'), pg_temp.id('leader'), pg_temp.id('other_leader'),
  pg_temp.id('s1'), pg_temp.id('s2'), pg_temp.id('s3'), pg_temp.id('m1'), pg_temp.id('m2'),
  pg_temp.id('school'), pg_temp.id('class'),
  'p4race-' || (select value from race where key = 'suffix')
));

select dblink_exec('race_setup', pg_temp.autocommit_claims_sql('leader'));
insert into race (key, value)
select 'g1', group_id::text
from dblink('race_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)',
  pg_temp.id('class'), 'Race Leaf'
)) as created(group_id uuid);

select dblink_exec('race_setup', pg_temp.autocommit_claims_sql('other_leader'));
insert into race (key, value)
select 'g2', group_id::text
from dblink('race_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)',
  pg_temp.id('class'), 'Race Root'
)) as created(group_id uuid);

select dblink_exec('race_setup', pg_temp.autocommit_claims_sql('leader'));
insert into race (key, value)
select 'inv_s1', invitation_id::text
from dblink('race_setup', format(
  'select invitation_id from public.send_group_invitation(%L, %L)', pg_temp.id('g1'), pg_temp.id('s1')
)) as sent(invitation_id uuid);
insert into race (key, value)
select 'inv_s2', invitation_id::text
from dblink('race_setup', format(
  'select invitation_id from public.send_group_invitation(%L, %L)', pg_temp.id('g1'), pg_temp.id('s2')
)) as sent(invitation_id uuid);

-- Race 1: two invitees accept the final seat. The teacher lowers capacity
-- after both invitations were valid, so only one acceptance can fit.
select dblink_exec('race_setup', format(
  'update public.classes set max_group_size = 2 where id = %L', pg_temp.id('class')
));

select dblink_exec('race_one', 'begin');
select dblink_exec('race_one', pg_temp.claims_sql('s1'));
insert into race (key, value)
select 'race1_first', outcome || ':' || coalesce(error_code, '')
from dblink('race_one', format(
  'select outcome, error_code from public.accept_group_invitation(%L)', pg_temp.id('inv_s1')
)) as accepted(outcome text, error_code text);

select dblink_exec('race_two', 'begin');
select dblink_exec('race_two', pg_temp.claims_sql('s2'));
select dblink_send_query('race_two', format(
  'select outcome, error_code from public.accept_group_invitation(%L)', pg_temp.id('inv_s2')
));
select pg_sleep(0.5);
insert into race (key, value) values ('race1_blocked', dblink_is_busy('race_two')::text);
select dblink_exec('race_one', 'commit');
insert into race (key, value)
select 'race1_second', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('race_two') as accepted(outcome text, error_code text);
select * from dblink_get_result('race_two') as drained(outcome text, error_code text);
select dblink_exec('race_two', 'commit');

select is((select value from race where key = 'race1_first'), 'accepted:', 'first final-seat acceptance succeeds');
select is((select value from race where key = 'race1_blocked'), '1', 'second acceptance waits on the group lock');
select is((select value from race where key = 'race1_second'), 'denied:GROUP_FULL', 'second acceptance revalidates capacity and is refused');
select is(
  (
    select active_members
    from dblink('race_setup', format(
      'select count(*) from public.group_members where group_id = %L and status = %L',
      pg_temp.id('g1'), 'active'
    )) as counted(active_members bigint)
  ),
  2::bigint,
  'the group never exceeds capacity'
);

-- Race 2: one student accepts invitations from two groups at once.
select dblink_exec('race_setup', format(
  'update public.classes set max_group_size = 3 where id = %L', pg_temp.id('class')
));
select dblink_exec('race_setup', pg_temp.autocommit_claims_sql('leader'));
insert into race (key, value)
select 'inv_s3_g1', invitation_id::text
from dblink('race_setup', format(
  'select invitation_id from public.send_group_invitation(%L, %L)', pg_temp.id('g1'), pg_temp.id('s3')
)) as sent(invitation_id uuid);
select dblink_exec('race_setup', pg_temp.autocommit_claims_sql('other_leader'));
insert into race (key, value)
select 'inv_s3_g2', invitation_id::text
from dblink('race_setup', format(
  'select invitation_id from public.send_group_invitation(%L, %L)', pg_temp.id('g2'), pg_temp.id('s3')
)) as sent(invitation_id uuid);

select dblink_exec('race_one', 'begin');
select dblink_exec('race_one', pg_temp.claims_sql('s3'));
select * from dblink('race_one', format(
  'select outcome from public.accept_group_invitation(%L)', pg_temp.id('inv_s3_g1')
)) as accepted(outcome text);

select dblink_exec('race_two', 'begin');
select dblink_exec('race_two', pg_temp.claims_sql('s3'));
select dblink_send_query('race_two', format(
  'select outcome, error_code from public.accept_group_invitation(%L)', pg_temp.id('inv_s3_g2')
));
select pg_sleep(0.5);
insert into race (key, value) values ('race2_blocked', dblink_is_busy('race_two')::text);
select dblink_exec('race_one', 'commit');
insert into race (key, value)
select 'race2_second', coalesce(error_code, outcome)
from dblink_get_result('race_two') as accepted(outcome text, error_code text);
select * from dblink_get_result('race_two') as drained(outcome text, error_code text);
select dblink_exec('race_two', 'commit');

select is((select value from race where key = 'race2_blocked'), '1', 'the student''s second acceptance waits on their membership lock');
select ok(
  (select value from race where key = 'race2_second') in ('INVITATION_NOT_PENDING', 'STUDENT_ALREADY_IN_GROUP'),
  'the second acceptance is refused after the first commits'
);
select is(
  (
    select active_groups
    from dblink('race_setup', format(
      'select count(*) from public.group_members where class_id = %L and user_id = %L and status = %L',
      pg_temp.id('class'), pg_temp.id('s3'), 'active'
    )) as counted(active_groups bigint)
  ),
  1::bigint,
  'the student ends with exactly one current group'
);

-- Race 3: the leader starts two transfers to different members at once.
select dblink_exec('race_setup', format($members$
  insert into public.group_members (class_id, group_id, user_id, role, invited_by)
  values
    (%1$L, %2$L, %3$L, 'member', %5$L),
    (%1$L, %2$L, %4$L, 'member', %5$L)
$members$, pg_temp.id('class'), pg_temp.id('g2'), pg_temp.id('m1'), pg_temp.id('m2'), pg_temp.id('other_leader')));

select dblink_exec('race_one', 'begin');
select dblink_exec('race_one', pg_temp.claims_sql('other_leader'));
select * from dblink('race_one', format(
  'select outcome from public.transfer_group_leadership(%L, %L)', pg_temp.id('g2'), pg_temp.id('m1')
)) as transferred(outcome text);

select dblink_exec('race_two', 'begin');
select dblink_exec('race_two', pg_temp.claims_sql('other_leader'));
select dblink_send_query('race_two', format(
  'select outcome from public.transfer_group_leadership(%L, %L)', pg_temp.id('g2'), pg_temp.id('m2')
));
select pg_sleep(0.5);
insert into race (key, value) values ('race3_blocked', dblink_is_busy('race_two')::text);
select dblink_exec('race_one', 'commit');
select * from dblink_get_result('race_two', false) as transferred(outcome text);
insert into race (key, value) values ('race3_error', coalesce(dblink_error_message('race_two'), ''));
select * from dblink_get_result('race_two', false) as drained(outcome text);
select dblink_exec('race_two', 'rollback');

select is((select value from race where key = 'race3_blocked'), '1', 'the second transfer waits on the group lock');
select ok(
  position('NOT_GROUP_LEADER' in (select value from race where key = 'race3_error')) > 0,
  'the stale second transfer is refused because the caller is no longer leader'
);
select is(
  (
    select leaders
    from dblink('race_setup', format(
      'select string_agg(user_id::text, %L) from public.group_members where group_id = %L and role = %L and status = %L',
      ',', pg_temp.id('g2'), 'leader', 'active'
    )) as counted(leaders text)
  ),
  pg_temp.id('m1')::text,
  'exactly one leader remains and it is the first transfer target'
);

-- Cleanup committed fixtures.
select lives_ok(
  format($cleanup$
    select dblink_exec('race_setup', %L)
  $cleanup$, format($statements$
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
    delete from public.groups where class_id = %1$L;
    delete from public.class_members where class_id = %1$L;
    delete from public.classes where id = %1$L;
    delete from public.school_memberships where school_id = %2$L;
    delete from public.schools where id = %2$L;
    delete from public.profiles where id = any(%3$L::uuid[]);
    delete from auth.users where id = any(%3$L::uuid[]);
  $statements$,
    pg_temp.id('class'),
    pg_temp.id('school'),
    array[
      pg_temp.id('teacher'), pg_temp.id('leader'), pg_temp.id('other_leader'),
      pg_temp.id('s1'), pg_temp.id('s2'), pg_temp.id('s3'), pg_temp.id('m1'), pg_temp.id('m2')
    ]::text
  )),
  'committed race fixtures are removed'
);

select dblink_disconnect('race_one');
select dblink_disconnect('race_two');
select dblink_disconnect('race_setup');

select * from finish();
rollback;
