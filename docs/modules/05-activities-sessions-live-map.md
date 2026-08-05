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

## Definition of done

Session state, authorization, snapshots, live-location privacy, and one-active-group correctness are proven with database and browser tests.
