# System Architecture

## 1. Architecture goals

The MVP must support mobile field use, strict class/session authorization, one-active-group control, live maps, individual observations, durable image/AI processing, intermittent connectivity, manual teacher review, and a post-activity map.

## 2. High-level architecture

```text
Next.js mobile-first PWA
 ├─ Student field workflow
 ├─ Teacher live/review dashboard
 └─ Admin functions
        │
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

Use for authenticated shells, initial data, completed-session pages, teacher review queues, role-aware navigation, and read-heavy pages.

### Client components

Use for Mapbox, camera/media capture, live location, Presence/Broadcast, offline queue, image preprocessing, interactive student verification, marker details, and upload progress.

Detailed screen design may be decided during implementation, but it must be mobile-first and preserve the locked workflow.

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
    classes/
    groups/
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

- Supabase Auth provides identity.
- Membership tables are authoritative for school/class/session access.
- Participant rows snapshot membership for each session.
- RLS protects every exposed table and Storage object.
- Live-channel access does not replace database authorization.
- Students may create/submit observations only for themselves and only in an authorized active-group context.
- Teachers may review sessions belonging to classes they teach.
- Completed-map visibility is limited to authorized teachers and participating/authorized students.

## 6. Realtime architecture

### Presence

Use for low-frequency state:

- connected participant;
- waiting, ready, exploring, paused;
- last heartbeat;
- current session/group.

### Broadcast

Use for ephemeral high-frequency events:

- live location updates;
- heading, speed, accuracy;
- checkpoint progress;
- teacher alerts;
- session/group state changes.

### Database/Realtimes changes

Use durable rows and subscriptions for:

- submitted observation markers;
- observation status changes;
- AI analysis state;
- revision requests;
- teacher verification;
- completed-session state.

Draft observations are not broadcast to the teacher map.

## 7. Map architecture

Mapbox renders:

- route and boundary;
- active group members during the session;
- checkpoints;
- submitted observation markers using capture location;
- status-aware marker style;
- completed-session result markers.

Clicking a marker opens an observation detail panel. Marker color is supplemental; always include accessible status text/icon/shape.

PostGIS is authoritative for point-in-boundary checks, distance, spatial candidate search, and GeoJSON export. Client-side geometry provides immediate feedback only.

## 8. Image pipeline

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

## 9. Durable Gemini worker

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

## 10. Gemini response handling

The exact normalized JSON schema will be finalized during integration. Until then, architecture requirements are:

- response schema has an explicit version;
- provider/model/prompt version are stored;
- normalized result is validated with Zod before use;
- unknown/unseen traits are `null` or explicitly unavailable, not invented;
- candidates, confidence, visible traits, missing evidence, and warnings are supported;
- raw provider result is restricted and retained minimally;
- UI never treats AI output as teacher verification.

## 11. Flexible JSONB and relational data

Use relational columns for:

- ownership;
- class/session/group relationships;
- status;
- capture location/time;
- required names;
- accepted teacher identity;
- marker queries and review queues.

Use `jsonb` for:

- normalized Gemini result;
- additional/experimental traits;
- student verification payload;
- device context;
- research-event payload.

Do not store the entire mutable lifecycle as one JSON document. Use append-only analysis, submission, review, status, and event rows.

## 12. Same-species and specimen relationships

### Same species in session

Normalize the selected/entered identity sufficiently to compare against submitted observations in the same session. A match creates a warning and a teacher-visible tag, not a block.

### Possible same specimen

Candidate scoring may combine:

- species/taxon match;
- morphology/trait similarity;
- image embedding or perceptual similarity;
- capture distance;
- time difference.

Distance alone is never decisive. No automatic merge/delete is allowed. Confirmed relationships may share a `specimen_id` while preserving separate observations.

## 13. Offline behavior

IndexedDB stores:

- draft observation;
- client-generated UUID;
- media pending upload;
- upload/analysis retry state;
- unsent research events;
- temporary location data as permitted.

Sync is idempotent. A failure must not discard the draft. Gemini failure does not prevent manual completion.

## 14. Review and completed-map architecture

Teacher review reads an immutable chain of:

- original images/capture metadata;
- AI analysis runs;
- student verification and corrections;
- submission versions;
- teacher review decisions.

After teacher manually completes the session, an authorized completed-session page displays the map and marker detail panel for teachers and participating students. Visibility of personal fields follows role/privacy rules.

## 15. Observability and event logging

Capture application errors, failed uploads, queue/job state, Gemini latency/failure category, Realtime connection state, session-control events, observation lifecycle events, and RLS test results.

Never log access tokens, secret keys, exact live locations in general-purpose logs, or unrestricted private image URLs.