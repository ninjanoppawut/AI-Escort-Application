begin;

-- GeoJSON boundary conversion (SES-001, API_AND_REALTIME §22) -----------------

create function private.activity_geometry_from_geojson(geojson jsonb, expected_type text)
returns extensions.geometry
language plpgsql
immutable
set search_path = ''
as $$
begin
  if geojson is null or jsonb_typeof(geojson) = 'null' then
    return null;
  end if;

  if jsonb_typeof(geojson) <> 'object' or geojson ->> 'type' is distinct from expected_type then
    raise exception using errcode = '22023', message = 'ACTIVITY_GEOMETRY_INVALID';
  end if;

  return extensions.st_setsrid(extensions.st_geomfromgeojson(geojson::text), 4326);
end;
$$;

create function private.activity_version_payload(target_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', version.id,
    'versionNumber', version.version_number,
    'title', version.title,
    'instructions', version.instructions,
    'status', version.status,
    'publishedAt', version.published_at,
    'updatedAt', version.updated_at,
    'geometry', jsonb_build_object(
      'boundary', (
        select extensions.st_asgeojson(boundary_row.boundary, 7)::jsonb
        from public.activity_boundaries as boundary_row
        where boundary_row.activity_version_id = version.id
      ),
      'route', (
        select extensions.st_asgeojson(route_row.route, 7)::jsonb
        from public.activity_routes as route_row
        where route_row.activity_version_id = version.id
      ),
      'checkpoints', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'sequenceNumber', checkpoint_row.sequence_number,
            'title', checkpoint_row.title,
            'instructions', checkpoint_row.instructions,
            'location', extensions.st_asgeojson(checkpoint_row.location, 7)::jsonb,
            'radiusM', checkpoint_row.radius_m
          )
          order by checkpoint_row.sequence_number
        )
        from public.activity_checkpoints as checkpoint_row
        where checkpoint_row.activity_version_id = version.id
      ), '[]'::jsonb)
    ),
    'plugin', (
      select jsonb_build_object(
        'key', plugin_row.plugin_key,
        'schemaVersion', plugin_row.schema_version,
        'config', plugin_row.config
      )
      from public.activity_plugin_configs as plugin_row
      where plugin_row.activity_version_id = version.id
    ),
    'summary', jsonb_build_object(
      'boundaryAreaM2', (
        select round(extensions.st_area(boundary_row.boundary::extensions.geography))::bigint
        from public.activity_boundaries as boundary_row
        where boundary_row.activity_version_id = version.id
      ),
      'routeLengthM', (
        select round(extensions.st_length(route_row.route::extensions.geography))::bigint
        from public.activity_routes as route_row
        where route_row.activity_version_id = version.id
      ),
      'checkpointCount', (
        select count(*)
        from public.activity_checkpoints as checkpoint_row
        where checkpoint_row.activity_version_id = version.id
      )
    )
  )
  from public.activity_versions as version
  where version.id = target_version_id;
$$;

-- Save draft (P6-02) -----------------------------------------------------------

-- Create with target_class_id; save an existing activity with target_activity_id
-- and the version number the editor started from.
create function public.save_activity_draft(
  draft jsonb,
  target_class_id uuid default null,
  target_activity_id uuid default null,
  expected_version_number integer default null
)
returns table(
  outcome text,
  error_code text,
  activity_id uuid,
  activity_version_id uuid,
  version_number integer,
  error_details jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  activity_row public.activities%rowtype;
  latest_version public.activity_versions%rowtype;
  draft_version public.activity_versions%rowtype;
  current_field text := 'title';
  checkpoint_json jsonb;
  plugin_json jsonb;
  result_outcome text;
begin
  actor_profile := private.require_active_verified_actor();

  if draft is null or jsonb_typeof(draft) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if target_activity_id is null then
    class_row := private.require_class_teacher(target_class_id, false);
  else
    select *
    into activity_row
    from public.activities as activity
    where activity.id = target_activity_id;

    if activity_row.id is null
      or (target_class_id is not null and target_class_id <> activity_row.class_id) then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;

    class_row := private.require_class_teacher(activity_row.class_id, false);

    perform 1 from public.activities as activity where activity.id = activity_row.id for update;

    select *
    into latest_version
    from public.activity_versions as version
    where version.activity_id = activity_row.id
    order by version.version_number desc
    limit 1;

    if expected_version_number is distinct from latest_version.version_number then
      return query
      select 'denied'::text, 'ACTIVITY_VERSION_CONFLICT'::text, activity_row.id, latest_version.id,
        latest_version.version_number,
        jsonb_build_object(
          'currentVersionNumber', latest_version.version_number,
          'currentStatus', latest_version.status
        );
      return;
    end if;
  end if;

  plugin_json := coalesce(draft -> 'plugin', '{}'::jsonb);

  -- Every write below is one unit: a validation failure rolls all of it back.
  begin
    if target_activity_id is null then
      insert into public.activities (class_id, title, description, created_by)
      values (
        class_row.id,
        btrim(draft ->> 'title'),
        nullif(btrim(draft ->> 'description'), ''),
        actor_profile.id
      )
      returning * into activity_row;

      insert into public.activity_versions (activity_id, class_id, version_number, title, instructions, created_by)
      values (
        activity_row.id, class_row.id, 1, activity_row.title,
        nullif(btrim(draft ->> 'instructions'), ''), actor_profile.id
      )
      returning * into draft_version;

      result_outcome := 'created';
    else
      update public.activities as activity
      set title = btrim(draft ->> 'title'),
          description = nullif(btrim(draft ->> 'description'), '')
      where activity.id = activity_row.id
      returning * into activity_row;

      if latest_version.status = 'draft' then
        update public.activity_versions as version
        set title = activity_row.title,
            instructions = nullif(btrim(draft ->> 'instructions'), '')
        where version.id = latest_version.id
        returning * into draft_version;
      else
        insert into public.activity_versions (activity_id, class_id, version_number, title, instructions, created_by)
        values (
          activity_row.id, activity_row.class_id, latest_version.version_number + 1, activity_row.title,
          nullif(btrim(draft ->> 'instructions'), ''), actor_profile.id
        )
        returning * into draft_version;
      end if;

      result_outcome := 'saved';
    end if;

    delete from public.activity_boundaries as boundary_row where boundary_row.activity_version_id = draft_version.id;
    delete from public.activity_routes as route_row where route_row.activity_version_id = draft_version.id;
    delete from public.activity_checkpoints as checkpoint_row where checkpoint_row.activity_version_id = draft_version.id;
    delete from public.activity_plugin_configs as plugin_row where plugin_row.activity_version_id = draft_version.id;

    current_field := 'boundary';
    if jsonb_typeof(draft #> '{geometry,boundary}') is distinct from 'null'
      and draft #> '{geometry,boundary}' is not null then
      insert into public.activity_boundaries (activity_version_id, boundary)
      values (draft_version.id, private.activity_geometry_from_geojson(draft #> '{geometry,boundary}', 'Polygon'));
    end if;

    current_field := 'route';
    if jsonb_typeof(draft #> '{geometry,route}') is distinct from 'null'
      and draft #> '{geometry,route}' is not null then
      insert into public.activity_routes (activity_version_id, route)
      values (draft_version.id, private.activity_geometry_from_geojson(draft #> '{geometry,route}', 'LineString'));
    end if;

    current_field := 'checkpoints';
    for checkpoint_json in
      select element.value
      from jsonb_array_elements(coalesce(draft #> '{geometry,checkpoints}', '[]'::jsonb)) as element
    loop
      insert into public.activity_checkpoints (
        activity_version_id, sequence_number, title, instructions, location, radius_m
      )
      values (
        draft_version.id,
        (checkpoint_json ->> 'sequenceNumber')::integer,
        btrim(checkpoint_json ->> 'title'),
        nullif(btrim(checkpoint_json ->> 'instructions'), ''),
        private.activity_geometry_from_geojson(checkpoint_json -> 'location', 'Point'),
        coalesce((checkpoint_json ->> 'radiusM')::numeric, 20)
      );
    end loop;

    current_field := 'plugin';
    insert into public.activity_plugin_configs (activity_version_id, plugin_key, schema_version, config)
    values (
      draft_version.id,
      coalesce(plugin_json ->> 'key', 'plant_survey'),
      coalesce((plugin_json ->> 'schemaVersion')::integer, 1),
      coalesce(plugin_json -> 'config', '{}'::jsonb)
    );

    if result_outcome = 'created' then
      perform private.insert_audit_log(
        actor_profile.id, 'activity_created', 'activity', activity_row.id,
        class_row.school_id, class_row.id, 'succeeded', jsonb_build_object('version_number', 1)
      );
    end if;
  exception
    when data_exception or integrity_constraint_violation or internal_error then
      return query
      select 'denied'::text,
        case
          when current_field in ('boundary', 'route', 'checkpoints') then 'ACTIVITY_GEOMETRY_INVALID'
          else 'VALIDATION_FAILED'
        end,
        target_activity_id, latest_version.id, latest_version.version_number,
        jsonb_build_object('field', current_field);
      return;
  end;

  return query
  select result_outcome, null::text, activity_row.id, draft_version.id, draft_version.version_number, null::jsonb;
end;
$$;

-- Publish (P6-02) --------------------------------------------------------------

create function public.publish_activity(target_activity_id uuid, expected_version_number integer)
returns table(
  outcome text,
  error_code text,
  activity_id uuid,
  activity_version_id uuid,
  version_number integer,
  error_details jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  activity_row public.activities%rowtype;
  draft_version public.activity_versions%rowtype;
  published_version public.activity_versions%rowtype;
  boundary_geometry extensions.geometry;
  route_geometry extensions.geometry;
  checkpoint_total integer;
  outside_sequence integer;
  denial jsonb;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into activity_row
  from public.activities as activity
  where activity.id = target_activity_id;

  if activity_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  class_row := private.require_class_teacher(activity_row.class_id, false);

  perform 1 from public.activities as activity where activity.id = activity_row.id for update;

  select * into draft_version
  from public.activity_versions as version
  where version.activity_id = activity_row.id and version.status = 'draft';

  select * into published_version
  from public.activity_versions as version
  where version.activity_id = activity_row.id and version.status = 'published';

  if draft_version.id is null then
    if published_version.id is not null and published_version.version_number = expected_version_number then
      return query
      select 'published'::text, null::text, activity_row.id, published_version.id,
        published_version.version_number, null::jsonb;
      return;
    end if;

    return query
    select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, activity_row.id, published_version.id,
      published_version.version_number, null::jsonb;
    return;
  end if;

  if draft_version.version_number is distinct from expected_version_number then
    return query
    select 'denied'::text, 'ACTIVITY_VERSION_CONFLICT'::text, activity_row.id, draft_version.id,
      draft_version.version_number,
      jsonb_build_object('currentVersionNumber', draft_version.version_number, 'currentStatus', 'draft');
    return;
  end if;

  select boundary_row.boundary into boundary_geometry
  from public.activity_boundaries as boundary_row
  where boundary_row.activity_version_id = draft_version.id;

  select route_row.route into route_geometry
  from public.activity_routes as route_row
  where route_row.activity_version_id = draft_version.id;

  select count(*)::integer into checkpoint_total
  from public.activity_checkpoints as checkpoint_row
  where checkpoint_row.activity_version_id = draft_version.id;

  if boundary_geometry is not null then
    select min(checkpoint_row.sequence_number) into outside_sequence
    from public.activity_checkpoints as checkpoint_row
    where checkpoint_row.activity_version_id = draft_version.id
      and not extensions.st_covers(boundary_geometry, checkpoint_row.location);
  end if;

  denial := case
    when boundary_geometry is null then jsonb_build_object('reason', 'boundary_required')
    when route_geometry is null then jsonb_build_object('reason', 'route_required')
    when checkpoint_total = 0 then jsonb_build_object('reason', 'checkpoint_required')
    when not extensions.st_intersects(route_geometry, boundary_geometry)
      then jsonb_build_object('reason', 'route_outside_boundary')
    when outside_sequence is not null
      then jsonb_build_object('reason', 'checkpoint_outside_boundary', 'sequenceNumber', outside_sequence)
    else null
  end;

  if denial is not null then
    return query
    select 'denied'::text, 'ACTIVITY_GEOMETRY_INVALID'::text, activity_row.id, draft_version.id,
      draft_version.version_number, denial;
    return;
  end if;

  if not exists (
    select 1 from public.activity_plugin_configs as plugin_row
    where plugin_row.activity_version_id = draft_version.id
  ) then
    insert into public.activity_plugin_configs (activity_version_id, plugin_key, schema_version, config)
    values (draft_version.id, 'plant_survey', 1, '{}'::jsonb);
  end if;

  update public.activity_versions as version
  set status = 'superseded'
  where version.activity_id = activity_row.id
    and version.status = 'published';

  update public.activity_versions as version
  set status = 'published',
      published_at = now(),
      published_by = actor_profile.id
  where version.id = draft_version.id;

  update public.activities as activity
  set status = 'published'
  where activity.id = activity_row.id
    and activity.status = 'draft';

  perform private.insert_audit_log(
    actor_profile.id, 'activity_published', 'activity_version', draft_version.id,
    class_row.school_id, class_row.id, 'succeeded',
    jsonb_build_object('version_number', draft_version.version_number, 'checkpoint_count', checkpoint_total)
  );

  return query
  select 'published'::text, null::text, activity_row.id, draft_version.id, draft_version.version_number, null::jsonb;
end;
$$;

-- Read models (API_AND_REALTIME §22) ---------------------------------------------

create function public.list_class_activities(target_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  viewer_is_teacher boolean := false;
  items_json jsonb;
begin
  actor_profile := private.require_active_verified_actor();

  select * into class_row from public.classes as class where class.id = target_class_id;

  if class_row.id is not null then
    viewer_is_teacher := (select private.is_active_class_teacher(actor_profile.id, class_row.id));
  end if;

  if class_row.id is null or not (
    viewer_is_teacher
    or exists (
      select 1
      from public.class_members as membership
      where membership.class_id = class_row.id
        and membership.user_id = actor_profile.id
        and membership.status = 'active'
    )
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(entry.payload order by entry.updated_at desc, entry.activity_id desc), '[]'::jsonb)
  into items_json
  from (
    select
      activity.id as activity_id,
      activity.updated_at,
      jsonb_build_object(
        'id', activity.id,
        'title', activity.title,
        'description', activity.description,
        'status', activity.status,
        'publishedVersionNumber', published.version_number,
        'draftVersionNumber', case when viewer_is_teacher then draft_row.version_number end,
        'checkpointCount', (
          select count(*)
          from public.activity_checkpoints as checkpoint_row
          where checkpoint_row.activity_version_id = published.id
        ),
        'publishedAt', published.published_at,
        'updatedAt', activity.updated_at
      ) as payload
    from public.activities as activity
    left join public.activity_versions as published
      on published.activity_id = activity.id and published.status = 'published'
    left join public.activity_versions as draft_row
      on draft_row.activity_id = activity.id and draft_row.status = 'draft'
    where activity.class_id = class_row.id
      and (viewer_is_teacher or published.id is not null)
    order by activity.updated_at desc, activity.id desc
    limit 100
  ) as entry;

  return jsonb_build_object(
    'classId', class_row.id,
    'className', class_row.name,
    'viewerRole', case when viewer_is_teacher then 'teacher' else 'student' end,
    'items', items_json,
    'refreshedAt', now()
  );
end;
$$;

create function public.get_activity_detail(target_activity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  activity_row public.activities%rowtype;
  class_row public.classes%rowtype;
  viewer_is_teacher boolean;
  published_version_id uuid;
  draft_version_id uuid;
begin
  actor_profile := private.require_active_verified_actor();

  select * into activity_row from public.activities as activity where activity.id = target_activity_id;

  if activity_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into class_row from public.classes as class where class.id = activity_row.class_id;
  viewer_is_teacher := (select private.is_active_class_teacher(actor_profile.id, class_row.id));

  select version.id into published_version_id
  from public.activity_versions as version
  where version.activity_id = activity_row.id and version.status = 'published';

  select version.id into draft_version_id
  from public.activity_versions as version
  where version.activity_id = activity_row.id and version.status = 'draft';

  if not viewer_is_teacher and not (
    published_version_id is not null
    and exists (
      select 1
      from public.class_members as membership
      where membership.class_id = class_row.id
        and membership.user_id = actor_profile.id
        and membership.status = 'active'
    )
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'activity', jsonb_build_object(
      'id', activity_row.id,
      'classId', class_row.id,
      'className', class_row.name,
      'title', activity_row.title,
      'description', activity_row.description,
      'status', activity_row.status,
      'updatedAt', activity_row.updated_at
    ),
    'viewerRole', case when viewer_is_teacher then 'teacher' else 'student' end,
    'published', case
      when published_version_id is null then null
      else private.activity_version_payload(published_version_id)
    end,
    'draft', case
      when viewer_is_teacher and draft_version_id is not null then private.activity_version_payload(draft_version_id)
      else null
    end,
    'refreshedAt', now()
  );
end;
$$;

revoke execute on function private.activity_geometry_from_geojson(jsonb, text) from public, anon, authenticated;
revoke execute on function private.activity_version_payload(uuid) from public, anon, authenticated;
revoke execute on function public.save_activity_draft(jsonb, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.publish_activity(uuid, integer) from public, anon, authenticated;
revoke execute on function public.list_class_activities(uuid) from public, anon, authenticated;
revoke execute on function public.get_activity_detail(uuid) from public, anon, authenticated;

grant execute on function public.save_activity_draft(jsonb, uuid, uuid, integer) to authenticated;
grant execute on function public.publish_activity(uuid, integer) to authenticated;
grant execute on function public.list_class_activities(uuid) to authenticated;
grant execute on function public.get_activity_detail(uuid) to authenticated;

comment on function public.save_activity_draft(jsonb, uuid, uuid, integer) is
  'P6-02 creates an activity or saves its single draft version atomically from GeoJSON; editing a published activity starts the next draft version.';
comment on function public.publish_activity(uuid, integer) is
  'P6-02 validates boundary, route, and checkpoint containment, then publishes the draft and supersedes the previous version.';
comment on function public.list_class_activities(uuid) is
  'P6-02 class activity list: teachers see drafts; students see published activities only.';
comment on function public.get_activity_detail(uuid) is
  'P6-02 activity detail with GeoJSON geometry; drafts are teacher-only.';

commit;
