begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(11);

-- P15-01: admin console views need an active grant and aal2, and each
-- successful view is audited. Identities: admin, revoked admin, teacher.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000150001', 'p15.admin@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000150002', 'p15.revoked@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000150003', 'p15.teacher@example.edu', now(), '{"account_type":"admin","is_admin":true}'::jsonb);

update public.profiles set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000150003';

insert into public.platform_admins (user_id, status, reason)
values ('00000000-0000-0000-0000-000000150001', 'active', 'P15 test bootstrap');
insert into public.platform_admins (user_id, status, reason, revoked_by, revoked_at)
values (
  '00000000-0000-0000-0000-000000150002', 'revoked', 'P15 test bootstrap',
  '00000000-0000-0000-0000-000000150001', now()
);

create function pg_temp.act_as(user_id uuid, aal text)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', 'authenticated', 'aal', aal)::text,
    true
  );
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.console(view_key text)
returns text
language sql
as $$
  select outcome || '|' || coalesce(error_code, '-')
  from public.open_admin_console(view_key);
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000150001', 'aal1');
select is(pg_temp.console('home'), 'denied|MFA_REQUIRED', 'an admin at aal1 must complete MFA');

select pg_temp.act_as('00000000-0000-0000-0000-000000150001', 'aal2');
select is(pg_temp.console('home'), 'ok|-', 'an admin at aal2 opens the console');
select is(pg_temp.console('secrets'), 'denied|VALIDATION_FAILED', 'unknown views are refused');

select pg_temp.act_as('00000000-0000-0000-0000-000000150002', 'aal2');
select is(pg_temp.console('home'), 'denied|ADMIN_REQUIRED', 'a revoked grant is refused even at aal2');

select pg_temp.act_as('00000000-0000-0000-0000-000000150003', 'aal2');
select is(
  pg_temp.console('home'),
  'denied|ADMIN_REQUIRED',
  'user-editable metadata never grants admin access'
);

select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);
select ok(
  not has_function_privilege('anon', 'public.open_admin_console(text)', 'execute'),
  'anonymous callers cannot reach the admin gate'
);

reset role;
select is(
  (select count(*) from public.audit_logs
   where actor_id = '00000000-0000-0000-0000-000000150001'
     and action = 'admin.console.viewed'),
  1::bigint,
  'only the successful view is audited'
);
select is(
  (select actor_kind || '|' || outcome || '|' || (payload ->> 'view')
   from public.audit_logs
   where actor_id = '00000000-0000-0000-0000-000000150001'
     and action = 'admin.console.viewed'),
  'admin|succeeded|home',
  'the audit row names the admin and the view'
);
select is(
  (select count(*) from public.audit_logs
   where actor_id in ('00000000-0000-0000-0000-000000150002', '00000000-0000-0000-0000-000000150003')),
  0::bigint,
  'refused callers leave no admin view record'
);

-- P15-07 sweep: every admin RPC gates on the grant and aal2 in the
-- database, and none is callable anonymously.
select is(
  (select coalesce(string_agg(proc.proname, ',' order by proc.proname), '')
   from pg_proc as proc
   join pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public'
     and (
       proc.proname like 'admin\_%'
       or proc.proname in (
         'open_admin_console', 'issue_teacher_invitation', 'revoke_teacher_invitation',
         'grant_platform_admin', 'revoke_platform_admin',
         'acknowledge_operational_incident', 'append_operational_incident_note'
       )
     )
     and proc.prosrc not like '%require_current_admin_aal2%'),
  '',
  'every admin RPC checks the grant and aal2 in the database'
);
select is(
  (select coalesce(string_agg(proc.proname, ',' order by proc.proname), '')
   from pg_proc as proc
   join pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public'
     and (proc.proname like 'admin\_%' or proc.proname = 'open_admin_console')
     and has_function_privilege('anon', proc.oid, 'execute')),
  '',
  'no admin RPC is executable anonymously'
);

select * from finish();
rollback;
