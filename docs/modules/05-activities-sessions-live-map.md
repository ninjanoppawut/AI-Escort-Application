# SES — Activities, Sessions, and Live Map

## Outcome

Teachers prepare field activities, open sessions with immutable participant snapshots, activate at most one group, and monitor authorized live locations while students see the correct waiting or field experience.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §§3, 7, 9, 15
- `docs/DECISIONS_AND_QUESTIONS.md` D-002–D-006, D-019–D-020, D-043, D-051, D-054, D-056
- `docs/API_AND_REALTIME.md` §§2, 19–20
- `docs/DATABASE_DESIGN.md` §7
- `docs/NON_FUNCTIONAL_REQUIREMENTS.md`
- `docs/UI_CONTRACTS.md` §2

## Scope

In scope: activity CRUD, GeoJSON boundary/route/checkpoints, session creation/open/pause/resume/complete, participant snapshot, group queue, atomic activation, per-group completion, Presence/Broadcast location, durable sampling, and teacher live map.

Out of scope: public location sharing, background tracking outside an active session, and using cached client state to authorize publishing.

## Functional requirements

- **SES-001:** A teacher can create/edit an activity with validated boundary, route, checkpoints, and instructions.
- **SES-002:** Opening a session snapshots current group membership and leadership into immutable session participants.
- **SES-003:** Later class-group changes never rewrite session participation history.
- **SES-004:** A PostgreSQL constraint plus atomic activation operation permits at most one `active` exploration group per session under concurrency.
- **SES-005:** Waiting/ready groups can preview permitted activity details but cannot publish live location or submit observations.
- **SES-006:** Teachers can pause/resume sessions, complete a group, activate the next group, and manually complete the session.
- **SES-007:** While paused, students retain/edit drafts but cannot submit; location publication follows the current session/group state.
- **SES-008:** Only the class teacher can see named student live locations; broadcast stops when participation is no longer active or the session ends.
- **SES-009:** Live position uses private Broadcast/Presence for ephemeral state; configured durable samples and meaningful events are stored separately.
- **SES-010:** The teacher map shows route, boundary, checkpoints, active group, member freshness/accuracy, and accessible status labels.

## Authorization and privacy boundary

Session participants and class-teacher membership authorize channels and reads. Raw live location is session-scoped and private, is never sent to Gemini, and follows retention rules once decided. GeoJSON is validated at the database/API boundary and normalized for PostGIS queries.

## Required states and failures

Waiting, ready, active, paused, completed, stale position, location denied, poor accuracy warning, no GPS fix, offline/reconnecting, activation race loss, and session already completed are required.

## Verification

- Concurrent activation proves one active group.
- Snapshot preservation after later group moves.
- Channel authorization and cross-class isolation.
- Location publishing stops on pause/completion/deactivation.
- Geometry validation and mobile/desktop map interaction tests.

## Dependencies

AUTH, NOT, GRP/MGT, Mapbox adapter, PostGIS, and event logging.

## Implementation status

- **P6-01:** `20260911212813_phase6_activity_session_foundation.sql` installs
  PostGIS in `extensions` and adds activities, immutable activity versions,
  boundary/route/checkpoint/plugin tables with PostGIS validity and complexity
  checks, exploration sessions (at most one open or paused per class), session
  group queue snapshots, participant snapshots, and append-only session events.
  Browsers have `SELECT` only; drafts are teacher-only; students read published
  or superseded versions of their class; participants read their session
  roster; session events are teacher-only. Triggers keep published versions,
  snapshot identity, leadership at start, and queue position immutable. The
  Phase 5 stubs now read session snapshots: a snapshotted group has history,
  and it is in an active session while its snapshot is uncompleted in an open or
  paused session.
- **P6-02:** `20260911214029_phase6_activity_authoring.sql` adds
  `save_activity_draft`, `publish_activity`, `list_class_activities`, and
  `get_activity_detail`. Saves convert GeoJSON to SRID 4326 atomically and
  return `ACTIVITY_GEOMETRY_INVALID` with the failing field, or
  `ACTIVITY_VERSION_CONFLICT` when the editor's base version is stale. Publishing
  requires a boundary, a route that intersects it, and at least one checkpoint
  covered by it, supersedes the previous version, and is audited. Teacher routes
  `GET/POST /api/activities`, `GET/PUT /api/activities/:id`, and
  `POST /api/activities/:id/publish` back `/teacher/classes/[classId]/activities`
  and a five-step editor (details, boundary, route, checkpoints, review/publish)
  with GeoJSON paste/import, a coordinate sketch, dirty/saved state, conflict
  reload, and publish readiness.
- **P6-03/P6-04:** `20260911220535_phase6_session_open.sql` adds relational
  `activity_id`/`session_id` on research events plus
  `create_exploration_session`, `open_exploration_session`, `get_session_setup`,
  and `list_class_sessions`. Opening locks the class row and every current
  group, requires the queue to name exactly the groups that still have members
  (`queue_mismatch` otherwise), snapshots groups and participants, and writes a
  session event, a `session_opened` research event, and an audit row. Replaying
  open returns the existing snapshot. `/teacher/classes/[classId]/sessions`
  lists and schedules sessions; the setup screen orders the queue, shows
  excluded empty groups and unassigned students, states the snapshot warning,
  confirms who is affected, and then shows the immutable roster.
- **Mapbox:** map drawing and tiles are blocked on a Mapbox token
  (`OWNER_QUESTIONS_PENDING.md`). Geometry authoring accepts GeoJSON and every
  map view keeps an equivalent list view.

## Definition of done

Session state, authorization, snapshots, live-location privacy, and one-active-group correctness are proven with database and browser tests.
