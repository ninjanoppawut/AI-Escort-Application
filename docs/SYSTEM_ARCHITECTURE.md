# System Architecture

## 1. Architecture goals

The MVP must support mobile field use, strict class/session authorization, student-led group formation with teacher control, one-active-group exploration, in-app notifications, live maps, individual observations, durable image/AI processing, intermittent connectivity, manual teacher review, and a post-activity map.

## 2. High-level architecture

```text
Next.js mobile-first PWA
 ├─ Student class/group workflow
 ├─ Student field workflow
 ├─ Teacher class/group/live/review dashboard
 └─ Platform admin operations console
                 │
                 ▼
Shared server/data platform
 ├─ Supabase Auth
 ├─ PostgreSQL + PostGIS
 ├─ Supabase Realtime Broadcast + Presence
 ├─ Supabase Storage
 ├─ Supabase Queue
 └─ Supabase Edge Function consumer
          │
          └─ Gemini provider adapter
```

The browser never holds Gemini or service-role secrets.

## 3. Frontend responsibility

### Server components

Use for authenticated shells, initial class/group data, completed-session pages, teacher review queues, role-aware navigation, and read-heavy pages.

### Client components

Use for:

- class group board and invitation interactions;
- notification bell and inbox;
- Mapbox;
- camera/media capture;
- live location;
- Presence/Broadcast;
- offline queue;
- image preprocessing;
- interactive student verification;
- marker details and upload progress.

Detailed screen design may be decided during implementation, but it must be mobile-first and preserve the locked workflows.

## 4. Suggested feature modules

```text
src/
  app/
    (auth)/
    (student)/
    (teacher)/
    (admin)/
    api/
  features/
    auth/
    admin-operations/
    classes/
    class-invites/
    groups/
    group-invitations/
    notifications/
    activities/
    sessions/
    live-map/
    observations/
    plant-analysis/
    teacher-review/
    completed-map/
  lib/
    supabase/
    mapbox/
    authz/
    offline/
    image-processing/
    validation/
    events/
  plugins/
    plant-survey/
```

Keep domain logic independent from page components.

## 5. Authentication and authorization

- Supabase Auth provides verified email/password identity through SSR PKCE/cookies; protected server routes validate current claims.
- Profiles store trusted `student`/`teacher` account capability; teacher capability comes only from an email-bound platform-admin invitation.
- Platform admin is a separate relational grant, requires MFA for admin routes, and is never a class role.
- Membership tables are authoritative for school/class/session access.
- Class invitation joining occurs through trusted server logic; the client cannot choose a role.
- Participant rows snapshot membership for each session.
- RLS protects every exposed table and Storage object.
- Live-channel access does not replace database authorization.
- Students may create groups only through the atomic group-creation function.
- Leaders manage only their own unlocked group and may not bypass class membership or capacity rules.
- Students may read and mark only their own notifications.
- Teachers may manage groups only for classes they teach.
- Students may create/submit observations only for themselves and only in an authorized active-group context.
- Completed-map visibility is limited to authorized teachers and participating/authorized students.

## 6. Class and group architecture

### Initial class setup

Teacher creates the class and group configuration in one trusted operation:

```text
class identity
+ minimum/maximum group size
+ maximum group count
+ student group creation enabled/disabled
+ group formation open/closed
+ teacher membership
```

### Student group creation

```text
student presses Create Group
→ trusted RPC locks class configuration row
→ validates class membership, current membership, creation claim, and group count
→ reserves group slot
→ creates group
→ creates student creation claim
→ assigns creator as sole leader
→ commits
→ writes audit/research events and notifications as applicable
→ emits group.created signal
```

The transaction, not Realtime, prevents two students from taking the final slot.

### Group leader invariant

- A partial unique index prevents two active leaders in one group.
- Trusted transfer/move functions prevent a populated group from having zero leaders.
- The one-group-per-student-per-class invariant includes both leader and member roles.

### Teacher move/delete architecture

Teacher mutations use atomic functions that lock affected groups/memberships, check capacity and active-session dependencies, preserve session snapshots, generate notifications/audit records, and emit group-change signals.

Unused groups may be soft-deleted. Groups referenced by sessions are archived.

## 7. In-app notification architecture

Notifications and class invitation delivery do not depend on email. Account confirmation, teacher provisioning, security notifications, and password recovery do use production custom SMTP as defined in `AUTH_IDENTITY_AND_TENANCY.md`.

```text
domain mutation succeeds
→ insert durable notification row
→ emit notification.created on private user channel
→ client invalidates/refetches unread count and notification list
```

Notification rows are the source of truth. Realtime is only the immediate signal. RLS limits reads/updates to the recipient.

Notification examples:

- group invitation;
- invitation accepted/declined;
- student moved to another group;
- leadership transferred;
- group approved/locked/deleted/archived;
- group active/next;
- observation revision/verification;
- same species submitted again;
- session completed.

## 8. Realtime architecture

### Presence

Use for low-frequency state:

- connected participant;
- waiting, ready, exploring, paused;
- last heartbeat;
- current session/group.

### Broadcast

Use for ephemeral or change-signal events:

- live location updates;
- heading, speed, accuracy;
- checkpoint progress;
- teacher alerts;
- session/group state changes;
- class group-board invalidation;
- notification-created signal.

Recommended private channels:

```text
class:{classId}:groups
user:{userId}:notifications
session:{sessionId}:group:{groupId}
session:{sessionId}:teachers
session:{sessionId}:observations
user:{userId}:observation-jobs
```

### Authoritative refetch pattern

For class/group and notification UI:

```text
initial database fetch
→ subscribe to private channel
→ signal arrives
→ invalidate/refetch authoritative query
```

Also refetch on browser foreground, network reconnect, Realtime reconnect, and after a mutation result. Five-second polling is not the primary mechanism. An optional slow fallback poll is acceptable.

### Durable changes

Use durable rows for:

- groups, memberships, invitations, and group history;
- notifications;
- submitted observation markers;
- observation status changes;
- AI analysis state;
- revision requests;
- teacher verification;
- completed-session state.

Draft observations are not broadcast to the teacher map.

## 9. Map architecture

Mapbox renders:

- route and boundary;
- active group members during the session;
- checkpoints;
- submitted observation markers using capture location;
- status-aware marker style;
- completed-session result markers.

Clicking a marker opens an observation detail panel. Marker color is supplemental; always include accessible status text/icon/shape.

PostGIS is authoritative for point-in-boundary checks, distance, spatial candidate search, and GeoJSON export. Client-side geometry provides immediate feedback only.

## 10. Image pipeline

### Client preprocessing

Before upload:

1. read image and correct orientation;
2. retain the original capture time separately;
3. resize only when longest edge exceeds 2,048 px;
4. compress toward quality 82–85;
5. ensure the processed image is at most 5 MB;
6. generate an image hash where practical;
7. upload to a private bucket with deterministic path/idempotency.

Each observation supports 1–10 images.

### Presentation derivatives

Use Storage image transformations or equivalent controlled derivatives for:

- 256 px marker preview;
- 512 px list/card;
- 1,200 px teacher review;
- 2,048 px AI/review source.

The uploaded processed source remains private.

## 11. Durable Gemini worker

Gemini analysis must not depend on one long browser request.

```text
student uploads evidence
→ create ai_analysis_run
→ enqueue analyze_observation message
→ Edge Function consumer claims job
→ load authorized private images
→ call Gemini provider adapter
→ validate provider output
→ store raw/normalized versioned results
→ update analysis state
→ run same-species candidate matching
→ notify client through durable state/Realtime
```

In MVP, the worker is Supabase Queue + Edge Function. A separate Node worker, Redis/BullMQ, Kubernetes, or GPU service is out of scope.

The queue must support retries, idempotency, failure status, and dead-letter/manual retry handling. Students may continue manual entry while analysis is pending or failed.

## 12. Gemini response handling

The exact normalized JSON schema will be finalized during integration. Until then, architecture requirements are:

- response schema has an explicit version;
- provider/model/prompt version are stored;
- normalized result is validated with Zod before use;
- unknown/unseen traits are `null` or explicitly unavailable, not invented;
- candidates, confidence, visible traits, missing evidence, and warnings are supported;
- raw provider result is restricted and retained minimally;
- UI never treats AI output as teacher verification.

## 13. Flexible JSONB and relational data

Use relational columns for:

- ownership;
- class/session/group relationships;
- group role and current membership;
- status;
- capture location/time;
- required names;
- accepted teacher identity;
- marker queries and review queues.

Use `jsonb` for:

- normalized Gemini result;
- additional/experimental traits;
- student verification payload;
- notification context;
- device context;
- research-event payload.

Do not store the entire mutable lifecycle as one JSON document. Use append-only analysis, submission, review, status, group-history, notification, and event rows.

## 14. Same-species and specimen relationships

### Same species in session

Normalize the selected/entered identity sufficiently to compare against submitted observations in the same session. A match creates a warning, a teacher-visible tag, and a teacher in-app notification, not a block.

### Possible same specimen

Candidate scoring may combine:

- species/taxon match;
- morphology/trait similarity;
- image embedding or perceptual similarity;
- capture distance;
- time difference.

Distance alone is never decisive. No automatic merge/delete is allowed. Confirmed relationships may share a `specimen_id` while preserving separate observations.

## 15. Offline behavior

IndexedDB stores:

- draft observation;
- client-generated UUID;
- media pending upload;
- upload/analysis retry state;
- unsent research events;
- temporary location data as permitted.

Sync is idempotent. A failure must not discard the draft. Gemini failure does not prevent manual completion.

Group formation and invitation acceptance require current server validation. Offline UI may show cached groups but cannot guarantee a slot or membership until the mutation succeeds online.

## 16. Review and completed-map architecture

Teacher review reads an immutable chain of:

- original images/capture metadata;
- AI analysis runs;
- student verification and corrections;
- submission versions;
- teacher review decisions.

After teacher manually completes the session, an authorized completed-session page displays the map and marker detail panel for teachers and participating students. Visibility of personal fields follows role/privacy rules.

## 17. Observability and event logging

Capture application errors, failed group mutations, group-slot race outcomes, invitations, leadership changes, student moves, group deletion/archive, failed uploads, queue/job state, Gemini latency/failure category, Realtime connection state, session-control events, observation lifecycle events, notification delivery state, and RLS test results.

Never log access tokens, secret keys, exact live locations in general-purpose logs, or unrestricted private image URLs.

Use request IDs for every synchronous operation and propagate a trace/correlation ID through uploads, queues, Edge Functions, notifications, and exports. Metrics use low-cardinality route-template/flow/stage/status dimensions; user/class/session/observation/request IDs belong only in access-controlled redacted logs/traces.

The platform-admin console reads protected operational projections: account/school/class summaries, audit events, redacted errors, flow-level RED metrics, queue age/dead letters, Gemini categories, upload failures, and Realtime health. Platform admin is authorized independently from class membership and has no normal unrestricted student-content or live-location view.
