begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(41);

-- Identities: teacher, other-school teacher, Leaf leader a1 and member a2,
-- Root leader a3, an unassigned classmate u1.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000007301', 'p7-03.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007302', 'p7-03.other.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007303', 'p7-03.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007304', 'p7-03.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007305', 'p7-03.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007306', 'p7-03.u1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000007301', '00000000-0000-0000-0000-000000007302');

update public.profiles as profile
set display_name = names.display_name
from (
  values
    ('00000000-0000-0000-0000-000000007303'::uuid, 'Ada Leader'),
    ('00000000-0000-0000-0000-000000007304'::uuid, 'Bo Member'),
    ('00000000-0000-0000-0000-000000007305'::uuid, 'Cy Leader'),
    ('00000000-0000-0000-0000-000000007306'::uuid, 'Di Solo')
) as names(id, display_name)
where profile.id = names.id;

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000007301', 'P7-03 School', '00000000-0000-0000-0000-000000007301'),
  ('10000000-0000-0000-0000-000000007302', 'P7-03 Other School', '00000000-0000-0000-0000-000000007302');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000007301', user_id,
  case when user_id = '00000000-0000-0000-0000-000000007301'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000007301', '00000000-0000-0000-0000-000000007303',
  '00000000-0000-0000-0000-000000007304', '00000000-0000-0000-0000-000000007305',
  '00000000-0000-0000-0000-000000007306'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000007302', '00000000-0000-0000-0000-000000007302', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000007301', '10000000-0000-0000-0000-000000007301', 'P7-03 Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000007301'),
  ('20000000-0000-0000-0000-000000007302', '10000000-0000-0000-0000-000000007302', 'P7-03 Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000007302');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000007301', user_id,
  case when user_id = '00000000-0000-0000-0000-000000007301'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000007301', '00000000-0000-0000-0000-000000007303',
  '00000000-0000-0000-0000-000000007304', '00000000-0000-0000-0000-000000007305',
  '00000000-0000-0000-0000-000000007306'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000007302', '00000000-0000-0000-0000-000000007302', 'teacher');

create temporary table p7_03_results (label text primary key, row jsonb not null);
grant all on table p7_03_results to authenticated, anon;

create function pg_temp.act_as(actor uuid, topic text)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  ),
  set_config('realtime.topic', topic, true);
$$;

create function pg_temp.call(label_value text, statement text)
returns void
language plpgsql
as $$
begin
  execute format('insert into p7_03_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000007301' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p7_03_results where label = 'session';
$$;

create function pg_temp.group_topic(group_name text)
returns text
language sql
as $$
  select 'session:' || pg_temp.session_id()::text || ':group:' || pg_temp.group_named(group_name)::text;
$$;

create function pg_temp.teachers_topic()
returns text
language sql
as $$
  select 'session:' || pg_temp.session_id()::text || ':teachers';
$$;

create function pg_temp.location_topic(owner_id uuid)
returns text
language sql
as $$
  select 'session:' || pg_temp.session_id()::text || ':location:' || owner_id::text;
$$;

-- Counts rows on a topic as the given actor subscribed to that topic.
create function pg_temp.visible_count(actor uuid, topic text, message_extension text)
returns bigint
language plpgsql
as $$
declare
  visible bigint;
begin
  perform pg_temp.act_as(actor, topic);
  set local role authenticated;
  select count(*) into visible
  from realtime.messages as message
  where message.topic = visible_count.topic
    and message.extension = message_extension;
  reset role;
  return visible;
end;
$$;

-- Attempts a client write on a topic as the given actor; returns true when RLS allows it.
create function pg_temp.can_write(actor uuid, topic text, message_extension text)
returns boolean
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor, topic);
  set local role authenticated;
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
    values (can_write.topic, message_extension, 'probe', '{}'::jsonb, true);
  exception when insufficient_privilege then
    reset role;
    return false;
  end;
  reset role;
  return true;
end;
$$;

-- Server-side probe rows so receive policies can be checked on client-only topics.
create function pg_temp.probe(topic text, message_extension text)
returns void
language sql
as $$
  insert into realtime.messages (topic, extension, event, payload, private)
  values (topic, message_extension, 'probe', '{}'::jsonb, true);
$$;


-- Groups: Leaf (a1 leader, a2 member) and Root (a3 leader); u1 stays unassigned.
select pg_temp.act_as('00000000-0000-0000-0000-000000007303', '');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000007301', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000007301', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000007304', 'member', '00000000-0000-0000-0000-000000007303');

select pg_temp.act_as('00000000-0000-0000-0000-000000007305', '');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000007301', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000007301', '20000000-0000-0000-0000-000000007301', 'Garden survey', 'published', '00000000-0000-0000-0000-000000007301');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000007301', '60000000-0000-0000-0000-000000007301', '20000000-0000-0000-0000-000000007301', 1, 'Garden survey', '00000000-0000-0000-0000-000000007301');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000007301', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000007301'
where id = '61000000-0000-0000-0000-000000007301';

-- Topic parsing and posture --------------------------------------------------------

select is(
  (select topic_kind || ':' || session_id::text || ':' || subject_id::text
   from private.parse_session_topic('session:70000000-0000-0000-0000-000000007301:location:00000000-0000-0000-0000-000000007303')),
  'location:70000000-0000-0000-0000-000000007301:00000000-0000-0000-0000-000000007303',
  'a strict location topic parses to its session and owner'
);

select is(
  (select count(*) from (
    select * from private.parse_session_topic('session:70000000-0000-0000-0000-000000007301:location:00000000-0000-0000-0000-00000000730A')
    union all select * from private.parse_session_topic('session:70000000-0000-0000-0000-000000007301:teachers:extra')
    union all select * from private.parse_session_topic('class:20000000-0000-0000-0000-000000007301:groups')
    union all select * from private.parse_session_topic('session:70000000-0000-0000-0000-000000007301:location')
    union all select * from private.parse_session_topic(null)
  ) as parsed),
  0::bigint,
  'uppercase, suffixed, foreign, truncated, and null topics do not parse'
);

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where (namespace.nspname, function_row.proname) in (
      ('private', 'live_location_publish_allowed'), ('private', 'current_user_session_topic_allows'),
      ('private', 'send_session_signal'), ('public', 'record_live_location_sample'),
      ('public', 'get_session_live_locations')
    )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  5::bigint,
  'live-location functions are security definer with empty search paths'
);

select ok(
  has_function_privilege('authenticated', 'public.record_live_location_sample(uuid,uuid,double precision,double precision,double precision,timestamp with time zone)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_session_live_locations(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.record_live_location_sample(uuid,uuid,double precision,double precision,double precision,timestamp with time zone)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_session_live_locations(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.current_user_session_topic_allows(text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.live_location_publish_allowed(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.send_session_signal(text,text,uuid,uuid,uuid)', 'EXECUTE'),
  'RPCs are authenticated-only and the publish rule and signal sender stay private'
);

select is(
  (
    select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ',' order by policyname)
    from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname like 'session\_%'
  ),
  'session_group_presence_receive:SELECT:authenticated,session_group_presence_track:INSERT:authenticated,'
    || 'session_group_realtime_receive:SELECT:authenticated,session_location_publish:INSERT:authenticated,'
    || 'session_location_receive:SELECT:authenticated,session_teachers_realtime_receive:SELECT:authenticated',
  'six session policies cover receive, presence, and location publish for authenticated users only'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and cmd in ('UPDATE', 'DELETE', 'ALL')
  ),
  0::bigint,
  'no realtime policy allows updating or deleting messages'
);

-- Open the session with Leaf first and activate it; Root becomes ready.
select pg_temp.act_as('00000000-0000-0000-0000-000000007301', '');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000007301', 'Morning round')$$);
select pg_temp.call('open', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.session_id(), pg_temp.group_named('Leaf'), pg_temp.group_named('Root')
));
select pg_temp.call('activate', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
reset role;

select pg_temp.probe(pg_temp.group_topic('Leaf'), 'presence');
select pg_temp.probe(pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast');
select pg_temp.probe(pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast');

-- Group topic --------------------------------------------------------------------

select ok(
  pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.group_topic('Leaf'), 'broadcast') > 0,
  'the class teacher receives group signals'
);

select ok(
  pg_temp.visible_count('00000000-0000-0000-0000-000000007304', pg_temp.group_topic('Leaf'), 'broadcast') > 0,
  'an active participant receives their own group signals'
);

select ok(
  pg_temp.visible_count('00000000-0000-0000-0000-000000007305', pg_temp.group_topic('Root'), 'broadcast') > 0,
  'a waiting group receives its signals, including being promoted to next'
);

select is(
  array[
    pg_temp.visible_count('00000000-0000-0000-0000-000000007305', pg_temp.group_topic('Leaf'), 'broadcast'),
    pg_temp.visible_count('00000000-0000-0000-0000-000000007306', pg_temp.group_topic('Leaf'), 'broadcast'),
    pg_temp.visible_count('00000000-0000-0000-0000-000000007302', pg_temp.group_topic('Leaf'), 'broadcast')
  ],
  array[0, 0, 0]::bigint[],
  'another group, an unassigned classmate, and another school teacher cannot read a group topic'
);

select is(
  pg_temp.visible_count('00000000-0000-0000-0000-000000007304', pg_temp.teachers_topic(), 'broadcast'),
  0::bigint,
  'group signals are not readable through a different subscribed topic'
);

select ok(
  pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.teachers_topic(), 'broadcast') > 0
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007302', pg_temp.teachers_topic(), 'broadcast') = 0,
  'only the class teacher reads the teachers topic'
);

select ok(
  pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.group_topic('Leaf'), 'presence') = 1
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007303', pg_temp.group_topic('Leaf'), 'presence') = 0,
  'group presence is readable by the teacher only'
);

select ok(
  pg_temp.can_write('00000000-0000-0000-0000-000000007303', pg_temp.group_topic('Leaf'), 'presence')
    and pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.group_topic('Root'), 'presence'),
  'participants of active and waiting groups can track presence on their own group topic'
);

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.group_topic('Leaf'), 'presence')
    and not pg_temp.can_write('00000000-0000-0000-0000-000000007301', pg_temp.group_topic('Leaf'), 'presence'),
  'other groups and the teacher cannot track presence on a group topic'
);

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007303', pg_temp.group_topic('Leaf'), 'broadcast')
    and not pg_temp.can_write('00000000-0000-0000-0000-000000007301', pg_temp.group_topic('Leaf'), 'broadcast')
    and not pg_temp.can_write('00000000-0000-0000-0000-000000007301', pg_temp.teachers_topic(), 'broadcast'),
  'nobody broadcasts on group or teachers topics from a client'
);

-- Location topics ----------------------------------------------------------------

select ok(
  pg_temp.can_write('00000000-0000-0000-0000-000000007303', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast'),
  'an active participant publishes on their own location topic'
);

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007303', pg_temp.location_topic('00000000-0000-0000-0000-000000007304'), 'broadcast')
    and not pg_temp.can_write('00000000-0000-0000-0000-000000007304', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast'),
  'groupmates cannot publish on each other''s location topics'
);

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007301', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast'),
  'the teacher cannot publish on a student location topic'
);

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007303', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'presence'),
  'presence is not allowed on location topics'
);

select ok(
  pg_temp.visible_count('00000000-0000-0000-0000-000000007303', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast') > 0
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast') > 0,
  'the owner and the class teacher read an active participant location topic'
);

select is(
  array[
    pg_temp.visible_count('00000000-0000-0000-0000-000000007304', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast'),
    pg_temp.visible_count('00000000-0000-0000-0000-000000007305', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast'),
    pg_temp.visible_count('00000000-0000-0000-0000-000000007306', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast'),
    pg_temp.visible_count('00000000-0000-0000-0000-000000007302', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast')
  ],
  array[0, 0, 0, 0]::bigint[],
  'groupmates, other groups, unassigned classmates, and other teachers never read named locations'
);

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast')
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast') = 0,
  'a waiting group cannot publish and the teacher sees nothing on its location topics'
);

select ok(
  pg_temp.can_write('00000000-0000-0000-0000-000000007304', pg_temp.location_topic('00000000-0000-0000-0000-000000007304'), 'broadcast'),
  'every active participant of the active group publishes on their own topic'
);

select is(
  (
    select count(*) from pg_proc as function_row
    where function_row.proname = 'current_user_session_topic_allows'
      and has_function_privilege('anon', function_row.oid, 'EXECUTE')
  ),
  0::bigint,
  'anonymous sockets cannot evaluate session topic access'
);

-- Publish-stop matrix --------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-000000007301', '');
set local role authenticated;
select pg_temp.call('pause', format($$select * from public.pause_exploration_session(%L)$$, pg_temp.session_id()));
reset role;

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007303', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast')
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast') = 0,
  'pausing stops publishing and hides the location topic from the teacher'
);

select ok(
  (select count(*) from realtime.messages
   where topic = pg_temp.teachers_topic() and event = 'session.status_changed') >= 2
    and (select count(*) from realtime.messages
         where topic = pg_temp.group_topic('Leaf') and event = 'session.status_changed') >= 2
    and (select count(*) from realtime.messages
         where topic = pg_temp.group_topic('Root') and event = 'session.status_changed') >= 2,
  'open and pause signal the teachers topic and every group topic'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007301', '');
set local role authenticated;
select pg_temp.call('resume', format($$select * from public.resume_exploration_session(%L)$$, pg_temp.session_id()));
reset role;

select ok(
  pg_temp.can_write('00000000-0000-0000-0000-000000007303', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast'),
  'resuming allows the active group to publish again'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007301', '');
set local role authenticated;
select pg_temp.call('complete_leaf', format(
  $$select * from public.complete_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
reset role;

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007303', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast')
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.location_topic('00000000-0000-0000-0000-000000007303'), 'broadcast') = 0,
  'completing a group stops its publishing'
);

select ok(
  (select count(*) from realtime.messages
   where topic = pg_temp.group_topic('Leaf') and event = 'session.group_status_changed') >= 2
    and (select count(*) from realtime.messages
         where topic = pg_temp.teachers_topic() and event = 'session.group_status_changed') >= 3,
  'group activation, promotion, and completion signal the group and teachers topics'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007301', '');
set local role authenticated;
select pg_temp.call('activate_root', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Root')
));
reset role;

select ok(
  pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast')
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast') > 0,
  'the next activated group may publish and the teacher reads it'
);

update public.session_participants
set participation_status = 'left', left_at = now()
where session_id = pg_temp.session_id() and user_id = '00000000-0000-0000-0000-000000007305';

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast'),
  'a participant who left the session stops publishing'
);

select ok(
  (select count(*) from realtime.messages
   where topic = pg_temp.group_topic('Root') and event = 'session.participant_changed') = 1,
  'participation changes signal the group topic'
);

update public.session_participants
set participation_status = 'active', left_at = null
where session_id = pg_temp.session_id() and user_id = '00000000-0000-0000-0000-000000007305';

update public.class_members
set status = 'left', left_at = now()
where class_id = '20000000-0000-0000-0000-000000007301' and user_id = '00000000-0000-0000-0000-000000007305';

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast')
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007305', pg_temp.group_topic('Root'), 'broadcast') = 0,
  'leaving the class stops publishing and group signals'
);

update public.class_members
set status = 'active', left_at = null
where class_id = '20000000-0000-0000-0000-000000007301' and user_id = '00000000-0000-0000-0000-000000007305';

update public.profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-000000007305';

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast'),
  'a deactivated account stops publishing'
);

update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000007305';

select ok(
  pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast'),
  'restoring the account restores publishing while the group is active'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007301', '');
set local role authenticated;
select pg_temp.call('complete_session', format(
  $$select * from public.complete_exploration_session(%L)$$, pg_temp.session_id()
));
reset role;

select ok(
  not pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast')
    and not pg_temp.can_write('00000000-0000-0000-0000-000000007305', pg_temp.group_topic('Root'), 'presence')
    and pg_temp.visible_count('00000000-0000-0000-0000-000000007301', pg_temp.location_topic('00000000-0000-0000-0000-000000007305'), 'broadcast') = 0,
  'completing the session stops publishing and presence'
);

-- Signal payloads ----------------------------------------------------------------

select is(
  (
    select count(*)
    from realtime.messages as message
    cross join lateral jsonb_object_keys(message.payload) as payload_key
    where message.topic like 'session:' || pg_temp.session_id()::text || ':%'
      and message.event like 'session.%'
      and payload_key not in ('id', 'type', 'version', 'sessionId', 'sessionGroupId', 'groupId', 'changedAt')
  ),
  0::bigint,
  'session signals carry only message id, type, version, session, group, and time'
);

select ok(
  (
    select bool_and(message.private)
      and bool_and(message.payload::text !~* '(lat|lng|lon|display|@example)')
    from realtime.messages as message
    where message.topic like 'session:' || pg_temp.session_id()::text || ':%'
      and message.event like 'session.%'
  ),
  'session signals are private and carry no coordinates, names, or emails'
);

select is(
  (
    select count(*)
    from realtime.messages as message
    where message.topic like 'session:%:location:%'
      and message.event like 'session.%'
  ),
  0::bigint,
  'the database never sends signals on location topics'
);

select is(
  (select count(*) from public.location_events),
  0::bigint,
  'channel authorization writes no durable location rows'
);

select * from finish();
rollback;
