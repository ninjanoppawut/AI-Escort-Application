begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(48);

select has_table('public', 'audit_logs', 'audit_logs table exists');
select has_table('public', 'research_events', 'research_events table exists');

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('audit_logs', 'research_events')
      and relation.relrowsecurity
  ),
  2::bigint,
  'RLS is enabled on trusted provisioning event tables'
);

select is(
  (
    select count(*)
    from unnest(array['public.audit_logs', 'public.research_events']) as table_name
    where has_table_privilege('anon', table_name, 'SELECT')
       or has_table_privilege('anon', table_name, 'INSERT')
       or has_table_privilege('anon', table_name, 'UPDATE')
       or has_table_privilege('anon', table_name, 'DELETE')
  ),
  0::bigint,
  'anonymous users have no event-table privileges'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.platform_admins',
      'public.school_memberships',
      'public.teacher_invitations',
      'public.audit_logs',
      'public.research_events'
    ]) as table_name
    where has_table_privilege('authenticated', table_name, 'INSERT')
       or has_table_privilege('authenticated', table_name, 'UPDATE')
       or has_table_privilege('authenticated', table_name, 'DELETE')
  ),
  0::bigint,
  'authenticated browser roles cannot directly mutate trusted provisioning tables'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.teacher_invitations', 'token_hash', 'SELECT'
  ),
  'teacher invitation token hashes are not selectable through authenticated Data API grants'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.grant_platform_admin(uuid,text)',
      'public.revoke_platform_admin(uuid,text)',
      'public.issue_teacher_invitation(uuid,text,timestamp with time zone)',
      'public.revoke_teacher_invitation(uuid,text)',
      'public.preview_teacher_invitation(text)',
      'public.consume_teacher_invitation(text)'
    ]) as function_name
    where has_function_privilege('authenticated', function_name, 'EXECUTE')
  ),
  6::bigint,
  'authenticated users can execute only the documented trusted provisioning RPCs'
);

select is(
  (
    select count(*)
    from unnest(array[
      'private.hash_invitation_token(text)',
      'private.require_current_admin_aal2()',
      'private.ensure_target_profile_can_be_trusted(uuid)',
      'private.insert_audit_log(uuid,text,text,uuid,uuid,uuid,text,jsonb)'
    ]) as function_name
    where has_function_privilege('authenticated', function_name, 'EXECUTE')
  ),
  0::bigint,
  'authenticated users cannot execute private provisioning helpers'
);

select is(
  (
    select count(*)
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where (
        namespace.nspname = 'private'
        and function_row.proname in (
          'hash_invitation_token',
          'require_current_admin_aal2',
          'ensure_target_profile_can_be_trusted',
          'insert_audit_log'
        )
      )
      or (
        namespace.nspname = 'public'
        and function_row.proname in (
          'grant_platform_admin',
          'revoke_platform_admin',
          'issue_teacher_invitation',
          'revoke_teacher_invitation',
          'preview_teacher_invitation',
          'consume_teacher_invitation'
        )
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  10::bigint,
  'all trusted provisioning helpers and RPCs are security definers with empty search paths'
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000201', 'admin.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000202', 'admin.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000203', 'nonadmin@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000204', 'target.admin@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000205', 'teacher.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000206', 'wrong.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000207', 'inactive.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000208', 'unconfirmed.teacher@example.edu', null, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000209', 'teacher.b@example.edu', now(), '{}'::jsonb);

update public.profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000207';

update public.profiles
set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000000209';

insert into public.platform_admins (user_id, reason)
values
  ('00000000-0000-0000-0000-000000000201', 'Deterministic admin bootstrap'),
  ('00000000-0000-0000-0000-000000000202', 'Deterministic second admin bootstrap');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000201', 'School A', '00000000-0000-0000-0000-000000000201'),
  ('10000000-0000-0000-0000-000000000202', 'School B', '00000000-0000-0000-0000-000000000201'),
  ('10000000-0000-0000-0000-000000000203', 'Archived School', '00000000-0000-0000-0000-000000000201');

update public.schools
set status = 'archived'
where id = '10000000-0000-0000-0000-000000000203';

insert into public.school_memberships (school_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000209',
  'teacher'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000203',
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.grant_platform_admin(
    '00000000-0000-0000-0000-000000000204',
    'Non-admin attempt'
  )$$,
  '42501',
  'ADMIN_REQUIRED',
  'a non-admin cannot grant platform-admin authority'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000201',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.issue_teacher_invitation(
    '10000000-0000-0000-0000-000000000201',
    'teacher.a@example.edu',
    now() + interval '1 day'
  )$$,
  '42501',
  'MFA_REQUIRED',
  'an active admin without aal2 cannot issue a teacher invitation'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000201',
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
set local role authenticated;

select results_eq(
  $$select user_id, status from public.grant_platform_admin(
    '00000000-0000-0000-0000-000000000204',
    'Trusted test grant'
  )$$,
  $$values ('00000000-0000-0000-0000-000000000204'::uuid, 'active'::text)$$,
  'an active admin with aal2 can grant platform-admin authority'
);

reset role;

select is(
  (
    select count(*)
    from public.audit_logs
    where action = 'platform_admin_granted'
      and resource_id = '00000000-0000-0000-0000-000000000204'
  ),
  1::bigint,
  'platform-admin grants create an append-only audit row'
);

set local role authenticated;

select results_eq(
  $$select user_id, status from public.revoke_platform_admin(
    '00000000-0000-0000-0000-000000000204',
    'Trusted test revocation'
  )$$,
  $$values ('00000000-0000-0000-0000-000000000204'::uuid, 'revoked'::text)$$,
  'an active admin with aal2 can revoke platform-admin authority'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000204',
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.issue_teacher_invitation(
    '10000000-0000-0000-0000-000000000201',
    'teacher.a@example.edu',
    now() + interval '1 day'
  )$$,
  '42501',
  'ADMIN_REQUIRED',
  'a revoked platform admin cannot issue teacher invitations'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000201',
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
set local role authenticated;

create temporary table p102a_tokens (
  label text primary key,
  invitation_id uuid not null,
  token text not null
) on commit drop;

select lives_ok(
  $$
    insert into p102a_tokens (label, invitation_id, token)
    select 'valid', invitation_id, token
    from public.issue_teacher_invitation(
      '10000000-0000-0000-0000-000000000201',
      'teacher.a@example.edu',
      now() + interval '1 day'
    )
  $$,
  'admin aal2 can issue a teacher invitation with a database-generated token'
);

reset role;

select ok(
  (
    select char_length(token) >= 43
    from p102a_tokens
    where label = 'valid'
  )
  and (
    select count(*)
    from public.teacher_invitations as invitation
    join p102a_tokens as token_row
      on token_row.invitation_id = invitation.id
    where invitation.token_hash <> token_row.token
      and char_length(invitation.token_hash) = 64
  ) = 1,
  'teacher invitation stores only a hash and returns the plaintext token once'
);

set local role authenticated;

select throws_ok(
  $$select * from public.issue_teacher_invitation(
    '10000000-0000-0000-0000-000000000201',
    'teacher.a@example.edu',
    now() + interval '1 day'
  )$$,
  '23505',
  'TEACHER_INVITE_INVALID',
  'a duplicate pending teacher invitation for the same school and email is rejected'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000205',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select results_eq(
  $$select school_id, email from public.preview_teacher_invitation(
    (select token from p102a_tokens where label = 'valid')
  )$$,
  $$values (
    '10000000-0000-0000-0000-000000000201'::uuid,
    'teacher.a@example.edu'::text
  )$$,
  'invitation preview discloses only the matching email-bound invitation'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000206',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.preview_teacher_invitation(
    (select token from p102a_tokens where label = 'valid')
  )$$,
  '42501',
  'TEACHER_INVITE_INVALID',
  'invitation preview denies a different confirmed email'
);

select throws_ok(
  $$select * from public.consume_teacher_invitation(
    (select token from p102a_tokens where label = 'valid')
  )$$,
  '42501',
  'TEACHER_INVITE_INVALID',
  'invitation consumption denies a different confirmed email'
);

reset role;

select is(
  (
    select count(*)
    from public.teacher_invitations
    where status = 'accepted'
  )
  + (
    select count(*)
    from public.research_events
    where event_name = 'teacher_invitation_consumed'
  ),
  0::bigint,
  'a failed email-mismatch consumption rolls back without invitation or event changes'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000205',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select results_eq(
  $$select school_id, user_id, account_type, membership_role
    from public.consume_teacher_invitation(
      (select token from p102a_tokens where label = 'valid')
    )$$,
  $$values (
    '10000000-0000-0000-0000-000000000201'::uuid,
    '00000000-0000-0000-0000-000000000205'::uuid,
    'teacher'::text,
    'teacher'::text
  )$$,
  'matching confirmed email consumes the teacher invitation atomically'
);

select is(
  (
    select account_type
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000205'
  ),
  'teacher',
  'teacher invitation consumption grants trusted teacher account capability'
);

select is(
  (
    select count(*)
    from public.school_memberships
    where school_id = '10000000-0000-0000-0000-000000000201'
      and user_id = '00000000-0000-0000-0000-000000000205'
      and role = 'teacher'
      and status = 'active'
  ),
  1::bigint,
  'teacher invitation consumption creates exactly one active teacher school membership'
);

reset role;

select is(
  (
    select accepted_by
    from public.teacher_invitations
    where id = (select invitation_id from p102a_tokens where label = 'valid')
  ),
  '00000000-0000-0000-0000-000000000205'::uuid,
  'teacher invitation consumption marks the invitation accepted by the caller'
);

select is(
  (
    select count(*)
    from public.research_events
    where event_name = 'teacher_invitation_consumed'
      and actor_id = '00000000-0000-0000-0000-000000000205'
      and school_id = '10000000-0000-0000-0000-000000000201'
      and payload ? 'invite_age_s'
  ),
  1::bigint,
  'teacher invitation consumption emits the documented research event'
);

select is(
  (
    select count(*)
    from public.audit_logs
    where action = 'teacher_invitation_consumed'
      and actor_id = '00000000-0000-0000-0000-000000000205'
      and resource_id = (select invitation_id from p102a_tokens where label = 'valid')
  ),
  1::bigint,
  'teacher invitation consumption emits an append-only audit row'
);

set local role authenticated;

select throws_ok(
  $$select * from public.consume_teacher_invitation(
    (select token from p102a_tokens where label = 'valid')
  )$$,
  '42501',
  'TEACHER_INVITE_INVALID',
  'a consumed teacher invitation cannot be replayed'
);

reset role;

select is(
  (
    select count(*)
    from public.school_memberships
    where school_id = '10000000-0000-0000-0000-000000000201'
      and user_id = '00000000-0000-0000-0000-000000000205'
  )
  + (
    select count(*)
    from public.research_events
    where event_name = 'teacher_invitation_consumed'
  ),
  2::bigint,
  'replay denial creates no duplicate membership or second research event'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000201',
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
set local role authenticated;

insert into p102a_tokens (label, invitation_id, token)
select 'revoked', invitation_id, token
from public.issue_teacher_invitation(
  '10000000-0000-0000-0000-000000000202',
  'wrong.teacher@example.edu',
  now() + interval '1 day'
);

select results_eq(
  $$select status from public.revoke_teacher_invitation(
    (select invitation_id from p102a_tokens where label = 'revoked'),
    'No longer needed'
  )$$,
  $$values ('revoked'::text)$$,
  'an admin with aal2 can revoke a pending teacher invitation'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000206',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.consume_teacher_invitation(
    (select token from p102a_tokens where label = 'revoked')
  )$$,
  '42501',
  'TEACHER_INVITE_INVALID',
  'a revoked teacher invitation cannot be consumed'
);

reset role;

insert into public.teacher_invitations (
  id,
  school_id,
  email,
  token_hash,
  created_by,
  expires_at,
  created_at
)
values (
  '20000000-0000-0000-0000-000000000208',
  '10000000-0000-0000-0000-000000000201',
  'unconfirmed.teacher@example.edu',
  private.hash_invitation_token('expired-token'),
  '00000000-0000-0000-0000-000000000201',
  now() - interval '1 day',
  now() - interval '2 days'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000208',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.consume_teacher_invitation('expired-token')$$,
  '42501',
  'EMAIL_NOT_CONFIRMED',
  'an unconfirmed account cannot consume a teacher invitation'
);

reset role;
update auth.users
set email_confirmed_at = now()
where id = '00000000-0000-0000-0000-000000000208';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000208',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.consume_teacher_invitation('expired-token')$$,
  '42501',
  'TEACHER_INVITE_EXPIRED',
  'an expired teacher invitation cannot be consumed after confirmation recovers'
);

reset role;

select is(
  (
    select count(*)
    from public.teacher_invitations
    where id = '20000000-0000-0000-0000-000000000208'
      and status = 'pending'
      and accepted_by is null
  ),
  1::bigint,
  'expired invitation denial does not partially change invitation lifecycle state'
);

reset role;

insert into public.teacher_invitations (
  id,
  school_id,
  email,
  token_hash,
  created_by,
  expires_at
)
values (
  '20000000-0000-0000-0000-000000000207',
  '10000000-0000-0000-0000-000000000201',
  'inactive.teacher@example.edu',
  private.hash_invitation_token('inactive-token'),
  '00000000-0000-0000-0000-000000000201',
  now() + interval '1 day'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000207',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.consume_teacher_invitation('inactive-token')$$,
  '42501',
  'ACCOUNT_DISABLED',
  'an inactive account cannot consume a teacher invitation'
);

reset role;

insert into public.teacher_invitations (
  id,
  school_id,
  email,
  token_hash,
  created_by,
  expires_at
)
values (
  '20000000-0000-0000-0000-000000000209',
  '10000000-0000-0000-0000-000000000203',
  'teacher.b@example.edu',
  private.hash_invitation_token('archived-school-token'),
  '00000000-0000-0000-0000-000000000201',
  now() + interval '1 day'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000209',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.consume_teacher_invitation('archived-school-token')$$,
  '42501',
  'TEACHER_INVITE_INVALID',
  'a teacher invitation for an archived school cannot be consumed'
);

select throws_ok(
  $$update public.profiles
    set account_type = 'teacher'
    where id = '00000000-0000-0000-0000-000000000209'$$,
  '42501',
  'permission denied for table profiles',
  'a browser client cannot edit trusted profile account type'
);

select throws_ok(
  $$insert into public.platform_admins (user_id, reason)
    values ('00000000-0000-0000-0000-000000000209', 'Browser escalation')$$,
  '42501',
  'permission denied for table platform_admins',
  'a browser client cannot grant platform-admin status through table writes'
);

select throws_ok(
  $$insert into public.teacher_invitations (
      school_id, email, token_hash, created_by, expires_at
    )
    values (
      '10000000-0000-0000-0000-000000000201',
      'browser@example.edu',
      repeat('f', 64),
      '00000000-0000-0000-0000-000000000209',
      now() + interval '1 day'
    )$$,
  '42501',
  'permission denied for table teacher_invitations',
  'a browser client cannot create teacher invitations through table writes'
);

reset role;

select is(
  (
    select count(*)
    from pg_constraint constraint_row
    join pg_namespace namespace on namespace.oid = constraint_row.connamespace
    join pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = any(constraint_row.conkey)
    where namespace.nspname = 'public'
      and constraint_row.contype = 'f'
      and not exists (
        select 1
        from pg_index index_row
        where index_row.indrelid = constraint_row.conrelid
          and attribute.attnum = any(index_row.indkey)
      )
  ),
  0::bigint,
  'every public foreign-key column has a supporting index'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and cmd = 'UPDATE'
      and (qual is null or with_check is null)
  ),
  0::bigint,
  'every public update policy defines USING and WITH CHECK'
);

select is(
  (
    select count(*)
    from unnest(array['public.audit_logs', 'public.research_events']) as table_name
    where has_table_privilege('authenticated', table_name, 'SELECT')
       or has_table_privilege('authenticated', table_name, 'INSERT')
       or has_table_privilege('authenticated', table_name, 'UPDATE')
       or has_table_privilege('authenticated', table_name, 'DELETE')
  ),
  0::bigint,
  'authenticated users have no direct event-table Data API access'
);

update auth.users
set email_confirmed_at = null
where id = '00000000-0000-0000-0000-000000000208';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000201',
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.issue_teacher_invitation(
    '10000000-0000-0000-0000-000000000201',
    'unconfirmed.teacher@example.edu',
    now() + interval '1 day'
  )$$,
  '42501',
  'EMAIL_NOT_CONFIRMED',
  'issuing to an existing unconfirmed account is denied'
);

select throws_ok(
  $$select * from public.issue_teacher_invitation(
    '10000000-0000-0000-0000-000000000201',
    'inactive.teacher@example.edu',
    now() + interval '1 day'
  )$$,
  '42501',
  'ACCOUNT_DISABLED',
  'issuing to an inactive account is denied'
);

select throws_ok(
  $$select * from public.grant_platform_admin(
    '00000000-0000-0000-0000-000000000208',
    'Unconfirmed target'
  )$$,
  '42501',
  'EMAIL_NOT_CONFIRMED',
  'granting platform-admin authority to an unconfirmed account is denied'
);

select throws_ok(
  $$select * from public.grant_platform_admin(
    '00000000-0000-0000-0000-000000000207',
    'Inactive target'
  )$$,
  '42501',
  'ACCOUNT_DISABLED',
  'granting platform-admin authority to an inactive account is denied'
);

select throws_ok(
  $$select * from public.issue_teacher_invitation(
    '10000000-0000-0000-0000-000000000201',
    'teacher.b@example.edu',
    now() + interval '1 day'
  )$$,
  '23505',
  'TEACHER_INVITE_INVALID',
  'issuing to an already provisioned teacher in the school is denied'
);

select * from finish();
rollback;
