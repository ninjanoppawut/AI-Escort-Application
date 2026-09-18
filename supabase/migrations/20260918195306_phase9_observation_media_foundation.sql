begin;

-- P9-01: observation media rows and the private observation-images bucket
-- (OBS-005 to OBS-008; DATABASE_DESIGN §§9, 16, 17; D-021; D-026).
-- Media of a draft is private to its owner. Storage access is authorized by
-- exact equality with the relationally generated object path, never by path
-- segments alone. Deletion uses restrict: observations are never deleted and
-- retention (P14) removes Storage objects before rows.

alter table public.observations
  add constraint observations_owner_scope_unique unique (id, observer_id, class_id, session_id);

create table public.observation_media (
  id uuid primary key default gen_random_uuid(),
  client_media_id uuid not null,
  observation_id uuid not null,
  observer_id uuid not null,
  class_id uuid not null,
  session_id uuid not null,
  position integer not null,
  category text not null,
  status text not null default 'pending',
  mime_type text not null,
  byte_size bigint not null,
  width_px integer not null,
  height_px integer not null,
  image_hash text not null,
  preprocessing_version text not null,
  captured_at timestamptz not null,
  upload_attempt_count integer,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  storage_path text generated always as (
    class_id::text || '/' || session_id::text || '/' || observation_id::text || '/' || id::text || '.'
      || case mime_type when 'image/webp' then 'webp' when 'image/jpeg' then 'jpg' else 'png' end
  ) stored,
  constraint observation_media_observation_fk foreign key (observation_id, observer_id, class_id, session_id)
    references public.observations (id, observer_id, class_id, session_id) on delete restrict,
  constraint observation_media_client_id_unique unique (observer_id, client_media_id),
  constraint observation_media_storage_path_unique unique (storage_path),
  constraint observation_media_position_check check (position between 1 and 10),
  constraint observation_media_category_check check (
    category in ('whole_plant', 'leaf', 'leaf_underside', 'stem_trunk', 'flower', 'fruit', 'habitat', 'other')
  ),
  constraint observation_media_status_check check (status in ('pending', 'uploaded', 'deleting')),
  constraint observation_media_mime_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint observation_media_size_check check (byte_size > 0 and byte_size <= 5242880),
  constraint observation_media_dimension_check check (
    width_px between 1 and 2048 and height_px between 1 and 2048
  ),
  constraint observation_media_hash_check check (image_hash ~ '^[0-9a-f]{64}$'),
  constraint observation_media_preprocessing_check check (preprocessing_version ~ '^img-v[0-9]+$'),
  constraint observation_media_attempt_check check (
    upload_attempt_count is null or upload_attempt_count between 1 and 50
  ),
  constraint observation_media_uploaded_check check ((status = 'uploaded') = (uploaded_at is not null) or status = 'deleting')
);

-- At most ten live images per observation, enforced without a counting race.
create unique index observation_media_live_position_unique
  on public.observation_media (observation_id, position)
  where status <> 'deleting';
create index observation_media_owner_scope_idx
  on public.observation_media (observation_id, observer_id, class_id, session_id);
create index observation_media_observation_status_idx
  on public.observation_media (observation_id, status);
create index observation_media_class_idx on public.observation_media (class_id);
create index observation_media_session_idx on public.observation_media (session_id);

-- Guards -------------------------------------------------------------------------

create function private.guard_observation_media_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' or new.uploaded_at is not null then
    raise exception using errcode = '23514', message = 'OBSERVATION_MEDIA_MUST_START_PENDING';
  end if;
  return new;
end;
$$;

create function private.guard_observation_media_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.id, new.client_media_id, new.observation_id, new.observer_id, new.class_id, new.session_id,
      new.position, new.mime_type, new.byte_size, new.width_px, new.height_px, new.image_hash,
      new.preprocessing_version, new.captured_at, new.created_at)
    is distinct from
     (old.id, old.client_media_id, old.observation_id, old.observer_id, old.class_id, old.session_id,
      old.position, old.mime_type, old.byte_size, old.width_px, old.height_px, old.image_hash,
      old.preprocessing_version, old.captured_at, old.created_at) then
    raise exception using errcode = '42501', message = 'OBSERVATION_MEDIA_IMMUTABLE';
  end if;

  if new.status is distinct from old.status
    and (old.status, new.status) not in (('pending', 'uploaded'), ('pending', 'deleting'), ('uploaded', 'deleting')) then
    raise exception using errcode = '23514', message = 'INVALID_STATUS_TRANSITION';
  end if;

  if new.category is distinct from old.category and old.status = 'deleting' then
    raise exception using errcode = '23514', message = 'INVALID_STATUS_TRANSITION';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create function private.guard_observation_media_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An uploaded row is never deleted while its object may still exist.
  if old.status = 'uploaded' then
    raise exception using errcode = '42501', message = 'OBSERVATION_MEDIA_DELETE_REQUIRES_DELETING';
  end if;
  return old;
end;
$$;

create trigger observation_media_guard_insert
before insert on public.observation_media
for each row execute function private.guard_observation_media_insert();

create trigger observation_media_guard_update
before update on public.observation_media
for each row execute function private.guard_observation_media_update();

create trigger observation_media_guard_delete
before delete on public.observation_media
for each row execute function private.guard_observation_media_delete();

-- Helpers ------------------------------------------------------------------------

-- Media follows the draft edit rule in P9; later phases extend this one rule.
create function private.observation_media_edit_denial(target_observation_id uuid)
returns table(code text, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select denial.code, denial.reason from private.observation_edit_denial(target_observation_id) as denial;
$$;

create function private.observation_media_object_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.observation_media as media
    where media.storage_path = object_name
      and media.observer_id = (select auth.uid())
      and (select private.current_user_is_class_student(media.class_id))
  );
$$;

-- Volatile on purpose: the share lock makes a Storage write wait behind the
-- delete/complete RPCs that hold the media row for update, so an upload can
-- never land after its row was withdrawn.
create function private.observation_media_object_writable(object_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  media_row public.observation_media%rowtype;
  denial record;
begin
  select * into media_row
  from public.observation_media as media
  where media.storage_path = object_name
  for share;

  if media_row.id is null
    or media_row.status <> 'pending'
    or media_row.observer_id <> (select auth.uid())
    or not (select private.current_user_is_class_student(media_row.class_id))
    or not exists (
      select 1
      from public.observations as observation
      join public.session_participants as participant on participant.id = observation.session_participant_id
      where observation.id = media_row.observation_id
        and participant.participation_status = 'active'
    ) then
    return false;
  end if;

  select * into denial from private.observation_media_edit_denial(media_row.observation_id);
  return denial.code is null;
end;
$$;

create function private.observation_media_object_deletable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.observation_media as media
    where media.storage_path = object_name
      and media.status = 'deleting'
      and media.observer_id = (select auth.uid())
  );
$$;

-- RLS ------------------------------------------------------------------------------

alter table public.observation_media enable row level security;
revoke all on table public.observation_media from public, anon, authenticated;
grant select on table public.observation_media to authenticated;

create policy observation_media_select_owner
on public.observation_media
for select
to authenticated
using (
  observer_id = (select auth.uid())
  and (select private.current_user_is_class_student(class_id))
);

-- Private bucket (created here rather than config.toml to avoid drift).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('observation-images', 'observation-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy observation_images_select_owner
on storage.objects
for select
to authenticated
using (
  bucket_id = 'observation-images'
  and (select private.observation_media_object_readable(name))
);

create policy observation_images_insert_owner_pending
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'observation-images'
  and owner_id = (select auth.uid())::text
  and private.observation_media_object_writable(name)
);

create policy observation_images_update_owner_pending
on storage.objects
for update
to authenticated
using (
  bucket_id = 'observation-images'
  and private.observation_media_object_writable(name)
)
with check (
  bucket_id = 'observation-images'
  and owner_id = (select auth.uid())::text
  and private.observation_media_object_writable(name)
);

create policy observation_images_delete_owner_deleting
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'observation-images'
  and (select private.observation_media_object_deletable(name))
);

revoke execute on function private.guard_observation_media_insert() from public, anon, authenticated;
revoke execute on function private.guard_observation_media_update() from public, anon, authenticated;
revoke execute on function private.guard_observation_media_delete() from public, anon, authenticated;
revoke execute on function private.observation_media_edit_denial(uuid) from public, anon, authenticated;
revoke execute on function private.observation_media_object_readable(text) from public, anon;
revoke execute on function private.observation_media_object_writable(text) from public, anon;
revoke execute on function private.observation_media_object_deletable(text) from public, anon;
grant execute on function private.observation_media_object_readable(text) to authenticated;
grant execute on function private.observation_media_object_writable(text) to authenticated;
grant execute on function private.observation_media_object_deletable(text) to authenticated;

comment on table public.observation_media is
  'P9-01 observation images. Owner-only while draft; objects live in the private observation-images bucket at storage_path.';

commit;
