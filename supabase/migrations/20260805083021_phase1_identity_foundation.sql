begin;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  email text not null,
  display_name text not null default 'New user',
  avatar_path text,
  account_type text not null default 'student'
    check (account_type in ('student', 'teacher')),
  status text not null default 'active'
    check (status in ('active', 'deactivated')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_normalized_check
    check (email = lower(btrim(email)) and email <> ''),
  constraint profiles_display_name_length_check
    check (char_length(btrim(display_name)) between 1 and 120)
);

create unique index profiles_email_unique
  on public.profiles (lower(email));

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  granted_by uuid references public.profiles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  reason text not null,
  constraint platform_admins_reason_check
    check (char_length(btrim(reason)) between 1 and 500),
  constraint platform_admins_revocation_state_check
    check (
      (status = 'active' and revoked_by is null and revoked_at is null)
      or
      (status = 'revoked' and revoked_by is not null and revoked_at is not null)
    )
);

create index platform_admins_granted_by_idx
  on public.platform_admins (granted_by)
  where granted_by is not null;

create index platform_admins_revoked_by_idx
  on public.platform_admins (revoked_by)
  where revoked_by is not null;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_name_length_check
    check (char_length(btrim(name)) between 1 and 160)
);

create index schools_created_by_idx
  on public.schools (created_by);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role text not null check (role in ('student', 'teacher')),
  status text not null default 'active'
    check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  constraint school_memberships_school_user_unique
    unique (school_id, user_id),
  constraint school_memberships_status_time_check
    check (
      (status = 'active' and left_at is null)
      or
      (status = 'left' and left_at is not null and left_at >= joined_at)
    )
);

create index school_memberships_user_school_active_idx
  on public.school_memberships (user_id, school_id)
  where status = 'active';

create table public.teacher_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id) on delete restrict,
  accepted_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint teacher_invitations_email_normalized_check
    check (email = lower(btrim(email)) and email <> ''),
  constraint teacher_invitations_token_hash_check
    check (char_length(token_hash) >= 43),
  constraint teacher_invitations_expiry_check
    check (expires_at > created_at),
  constraint teacher_invitations_state_check
    check (
      (status = 'pending' and accepted_by is null and accepted_at is null and revoked_by is null and revoked_at is null)
      or
      (status = 'accepted' and accepted_by is not null and accepted_at is not null and revoked_by is null and revoked_at is null)
      or
      (status = 'revoked' and accepted_by is null and accepted_at is null and revoked_by is not null and revoked_at is not null)
      or
      (status = 'expired' and accepted_by is null and accepted_at is null and revoked_by is null and revoked_at is null)
    )
);

create unique index teacher_invitations_one_pending_school_email_idx
  on public.teacher_invitations (school_id, lower(email))
  where status = 'pending';

create index teacher_invitations_created_by_idx
  on public.teacher_invitations (created_by);

create index teacher_invitations_accepted_by_idx
  on public.teacher_invitations (accepted_by)
  where accepted_by is not null;

create index teacher_invitations_revoked_by_idx
  on public.teacher_invitations (revoked_by)
  where revoked_by is not null;

create index teacher_invitations_pending_expiry_idx
  on public.teacher_invitations (expires_at, id)
  where status = 'pending';

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger schools_set_updated_at
before update on public.schools
for each row execute function private.set_updated_at();

create function private.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
begin
  normalized_email := lower(btrim(new.email));

  if normalized_email is null or normalized_email = '' then
    raise exception using
      errcode = '23514',
      message = 'AUTH_EMAIL_REQUIRED';
  end if;

  insert into public.profiles (
    id,
    email,
    email_verified_at
  )
  values (
    new.id,
    normalized_email,
    new.email_confirmed_at
  )
  on conflict (id) do update
  set email = excluded.email,
      email_verified_at = excluded.email_verified_at;

  return new;
end;
$$;

revoke execute on function private.sync_profile_from_auth_user()
  from public, anon, authenticated;

create trigger auth_users_sync_profile
after insert or update of email, email_confirmed_at on auth.users
for each row execute function private.sync_profile_from_auth_user();

create function private.current_profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and status = 'active'
        and email_verified_at is not null
    );
$$;

create function private.current_user_is_active_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_profile_is_active())
    and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and exists (
      select 1
      from public.platform_admins
      where user_id = (select auth.uid())
        and status = 'active'
    );
$$;

create function private.current_user_is_school_member(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_profile_is_active())
    and exists (
      select 1
      from public.school_memberships
      where school_id = target_school_id
        and user_id = (select auth.uid())
        and status = 'active'
    );
$$;

revoke execute on function private.current_profile_is_active()
  from public, anon;
revoke execute on function private.current_user_is_active_admin_aal2()
  from public, anon;
revoke execute on function private.current_user_is_school_member(uuid)
  from public, anon;

grant execute on function private.current_profile_is_active()
  to authenticated;
grant execute on function private.current_user_is_active_admin_aal2()
  to authenticated;
grant execute on function private.current_user_is_school_member(uuid)
  to authenticated;

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.teacher_invitations enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  and (select private.current_profile_is_active())
);

create policy profiles_update_own_presentation
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  and (select private.current_profile_is_active())
)
with check (
  id = (select auth.uid())
  and (select private.current_profile_is_active())
);

create policy platform_admins_select_own
on public.platform_admins
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.current_profile_is_active())
);

create policy schools_select_authorized
on public.schools
for select
to authenticated
using (
  (select private.current_user_is_school_member(id))
  or (select private.current_user_is_active_admin_aal2())
);

create policy school_memberships_select_own
on public.school_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.current_profile_is_active())
);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.platform_admins from anon, authenticated;
revoke all on table public.schools from anon, authenticated;
revoke all on table public.school_memberships from anon, authenticated;
revoke all on table public.teacher_invitations from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_path) on table public.profiles to authenticated;
grant select on table public.platform_admins to authenticated;
grant select on table public.schools to authenticated;
grant select on table public.school_memberships to authenticated;

comment on table public.profiles is
  'Trusted account capability and safe presentation data synchronized from auth.users.';
comment on column public.profiles.account_type is
  'Trusted ordinary account capability; never sourced from user-editable metadata.';
comment on table public.teacher_invitations is
  'Server-managed, email-bound teacher provisioning invitations; plaintext tokens are never stored.';

commit;
