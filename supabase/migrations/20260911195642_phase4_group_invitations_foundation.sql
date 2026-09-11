begin;

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  group_id uuid not null,
  invitee_id uuid not null references public.profiles (id) on delete restrict,
  invited_by uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  responded_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_invitations_group_class_fk foreign key (group_id, class_id)
    references public.groups (id, class_id) on delete cascade,
  constraint group_invitations_not_self_check check (invitee_id <> invited_by),
  constraint group_invitations_expiry_check check (expires_at > created_at),
  constraint group_invitations_response_state_check check (
    (status = 'pending' and responded_at is null and cancelled_by is null)
    or (status in ('accepted', 'declined') and responded_at is not null and cancelled_by is null)
    or (status = 'cancelled' and responded_at is not null)
    or (status = 'expired' and responded_at is null and cancelled_by is null)
  )
);

-- A declined, cancelled, or expired invitation does not block a later invite.
create unique index one_pending_group_invitation_per_invitee
  on public.group_invitations (group_id, invitee_id)
  where status = 'pending';
create index group_invitations_invitee_status_created_idx
  on public.group_invitations (invitee_id, status, created_at desc, id desc);
create index group_invitations_group_status_created_idx
  on public.group_invitations (group_id, status, created_at desc, id desc);
create index group_invitations_class_status_idx
  on public.group_invitations (class_id, status, invitee_id);
create index group_invitations_invited_by_idx
  on public.group_invitations (invited_by);
create index group_invitations_cancelled_by_idx
  on public.group_invitations (cancelled_by)
  where cancelled_by is not null;

create function private.current_user_is_group_leader(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_profile_is_active())
    and (select private.is_active_group_leader((select auth.uid()), target_group_id));
$$;

create function private.validate_group_invitation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    raise exception using errcode = '23514', message = 'INVITATION_NOT_PENDING';
  end if;

  if not exists (
    select 1
    from public.groups as group_row
    where group_row.id = new.group_id
      and group_row.class_id = new.class_id
      and group_row.deleted_at is null
      and group_row.status <> 'archived'
  ) then
    raise exception using errcode = '42501', message = 'DESTINATION_GROUP_INVALID';
  end if;

  if not (select private.is_active_class_student(new.invitee_id, new.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if not (
    (select private.is_active_group_leader(new.invited_by, new.group_id))
    or (select private.is_active_class_teacher(new.invited_by, new.class_id))
  ) then
    raise exception using errcode = '42501', message = 'NOT_GROUP_LEADER';
  end if;

  return new;
end;
$$;

create function private.guard_group_invitation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.class_id, new.group_id, new.invitee_id, new.invited_by, new.created_at, new.expires_at)
    is distinct from
    (old.class_id, old.group_id, old.invitee_id, old.invited_by, old.created_at, old.expires_at) then
    raise exception using errcode = '42501', message = 'INVITATION_IDENTITY_IMMUTABLE';
  end if;

  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception using errcode = '23514', message = 'INVITATION_NOT_PENDING';
  end if;

  if old.status <> 'pending'
    and (new.responded_at, new.cancelled_by) is distinct from (old.responded_at, old.cancelled_by) then
    raise exception using errcode = '23514', message = 'INVITATION_NOT_PENDING';
  end if;

  if new.cancelled_by is not null
    and not (
      (select private.is_active_group_leader(new.cancelled_by, new.group_id))
      or (select private.is_active_class_teacher(new.cancelled_by, new.class_id))
    ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create function private.broadcast_group_invitation_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.send_class_group_signal('group.invitation_changed', new.class_id, new.group_id);
  return null;
end;
$$;

create trigger group_invitations_validate_insert
before insert on public.group_invitations
for each row execute function private.validate_group_invitation_insert();

create trigger group_invitations_guard_update
before update on public.group_invitations
for each row execute function private.guard_group_invitation_update();

create trigger group_invitations_set_updated_at
before update on public.group_invitations
for each row execute function private.set_updated_at();

create trigger group_invitations_broadcast_class_group_signal
after insert or update on public.group_invitations
for each row execute function private.broadcast_group_invitation_signal();

alter table public.group_invitations enable row level security;

create policy group_invitations_select_participants
on public.group_invitations
for select
to authenticated
using (
  (
    invitee_id = (select auth.uid())
    and (select private.current_user_is_class_student(class_id))
  )
  or (select private.current_user_is_group_leader(group_id))
  or (select private.current_user_is_class_teacher(class_id))
);

revoke all on table public.group_invitations from anon, authenticated;
grant select on table public.group_invitations to authenticated;

revoke execute on function private.current_user_is_group_leader(uuid)
  from public, anon;
grant execute on function private.current_user_is_group_leader(uuid)
  to authenticated;
revoke execute on function private.validate_group_invitation_insert()
  from public, anon, authenticated;
revoke execute on function private.guard_group_invitation_update()
  from public, anon, authenticated;
revoke execute on function private.broadcast_group_invitation_signal()
  from public, anon, authenticated;

comment on table public.group_invitations is
  'P4-01 consent-based group invitations. One pending invitation per group and invitee; terminal states and identity columns are immutable; pending rows past expires_at are treated as expired and marked lazily by trusted RPCs.';
comment on function private.current_user_is_group_leader(uuid) is
  'True when the current active profile is the active leader of a current, unlocked group.';

commit;
