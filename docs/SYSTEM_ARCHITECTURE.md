# System Architecture

## 1. Architecture goals

The system must support mobile field use, strict class/session authorization, real-time supervision, intermittent connectivity, Gemini image analysis, student verification, teacher review, and plant deduplication without losing the original evidence.

## 2. High-level design

```text
Next.js Web/PWA
 ├─ Student live map and observation capture
 ├─ Student Gemini-result verification
 ├─ Teacher live supervision and review
 └─ Admin configuration
        │
        ├─ Supabase Auth
        ├─ PostgreSQL + PostGIS
        ├─ Supabase Realtime Broadcast + Presence
        ├─ Supabase Storage
        └─ Trusted server routes / Edge Functions
                 ├─ Gemini provider adapter
                 ├─ Taxonomy normalization adapter
                 ├─ Visual similarity / embedding adapter
                 ├─ Dedupe ranking service
                 └─ Export and reporting
```

## 3. Frontend boundaries

### Server components

Use for authenticated shells, initial class/activity data, teacher dashboards, role-aware navigation, and read-heavy review screens.

### Client components

Use for Mapbox, live-location subscriptions, camera/media capture, offline queues, Gemini-analysis progress, student trait verification, and duplicate-candidate review.

Business rules must remain outside page components and must be validated again on the server/database.

## 4. Suggested modules

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
    classes/
    groups/
    activities/
    sessions/
    live-map/
    observations/
    gemini-analysis/
    trait-verification/
    plant-dedupe/
    teacher-review/
  lib/
    supabase/
    mapbox/
    authz/
    offline/
    validation/
    taxonomy/
  plugins/
    plant-survey/
```

## 5. Authentication and authorization

- Supabase Auth provides identity.
- Class and session membership tables are authoritative.
- Every public table has RLS.
- Only active-group participants may publish location or create/submit observations.
- Waiting groups may preview routes but cannot publish.
- Gemini, taxonomy, and similarity services are called only through trusted server code.
- Service-role credentials never reach the client.

## 6. Realtime strategy

### Presence

Use for connected participants and low-frequency state.

### Broadcast

Use for high-frequency ephemeral events:

- live location;
- heading, speed, and accuracy;
- checkpoint reached;
- session state;
- observation status notification;
- teacher alert.

### Durable persistence

Persist sampled track points and meaningful events, not every GPS sample.

## 7. Observation evidence pipeline

```text
client creates idempotent draft
→ capture location/time stored
→ original media uploaded privately
→ trusted server sends selected media to Gemini
→ Gemini response validated against schema version
→ candidates and visible traits stored
→ taxonomy candidates normalized
→ student verification stored separately
→ dedupe services rank species/specimen candidates
→ student acknowledges candidates
→ submission location/time stored
→ teacher review stored separately
```

No stage overwrites an earlier evidence layer.

## 8. Gemini adapter

```ts
export interface PlantAnalysisProvider {
  analyze(input: PlantAnalysisInput): Promise<NormalizedPlantAnalysis>;
}
```

The adapter must:

- validate media type and size;
- remove unnecessary metadata before provider transmission;
- use versioned prompts and JSON schemas;
- normalize provider errors;
- return explicit unknown/not-visible values;
- record provider, model, latency, schema version, and request status;
- avoid sending other students' location or unrelated personal data.

## 9. Taxonomy normalization

Gemini names are not sufficient as stable identifiers. A taxonomy adapter should map candidates to a normalized taxon when possible while retaining the original Gemini text.

```ts
export interface TaxonomyProvider {
  normalize(candidate: PlantNameCandidate): Promise<NormalizedTaxonMatch[]>;
}
```

Normalization uncertainty must remain visible.

## 10. Duplicate detection architecture

### Species duplicate service

Searches authorized observations for the same normalized taxon. It generates informational warnings only.

### Specimen duplicate service

Combines independent signals:

```text
taxon overlap
+ student-verified trait similarity
+ image embedding similarity
+ capture-location distance
+ capture-time difference
= ranked possible specimen matches
```

Location is one feature, never the sole decision.

The service returns ranked candidates and scores. It cannot delete, merge, or finalize duplication. Student and teacher decisions are stored separately. Confirmed records may share a specimen ID.

## 11. Map and location architecture

Mapbox renders route, boundary, checkpoints, live members, accuracy radius, tracks, and observation markers. PostGIS is authoritative for saved geometry and boundary/distance calculations.

Store separately:

- capture location, accuracy, captured time;
- submission location, accuracy, submitted time;
- sampled live track.

The capture location is the primary plant location.

## 12. Offline design

IndexedDB stores observation drafts, media blobs/references, client UUIDs, verification state, duplicate decisions, and sync attempts.

Recommended sync order:

1. create observation idempotently;
2. upload media;
3. request or resume Gemini analysis when online;
4. sync student verification;
5. run dedupe;
6. capture and sync submission event;
7. resolve server validation without deleting local work.

## 13. Privacy and safety

- Images are private by default.
- Exact student locations are visible only to authorized session participants/teachers as required.
- Do not include exact location in generic application logs.
- Strip unnecessary EXIF from provider-bound or exported images.
- Configure retention for raw live tracks and provider payloads.
- Store normalized Gemini output longer than raw prompts/responses where possible.

## 14. Deployment and observability

Recommended initial deployment:

- Vercel for Next.js;
- hosted Supabase with separate development/staging/production projects;
- restricted Mapbox token;
- Gemini credentials held in trusted server environment;
- preview deployments connected only to non-production data.

Observe:

- RLS failures and cross-class tests;
- Realtime connection state;
- upload/sync failures;
- Gemini latency, schema failures, and rate limits;
- taxonomy normalization coverage;
- dedupe score distributions and human decisions;
- session-control and teacher-review audit events.