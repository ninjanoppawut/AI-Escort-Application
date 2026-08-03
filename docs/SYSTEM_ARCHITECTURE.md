# System Architecture

## 1. Architecture goals

The system must support mobile field use, strict class-scoped authorization, real-time collaboration, intermittent connectivity, modular survey plugins, and provider-independent AI services.

## 2. High-level design

```text
Next.js Web/PWA
 ├─ Student field experience
 ├─ Teacher dashboard and route builder
 └─ Admin console
        │
        ├─ Supabase Auth
        ├─ PostgreSQL + PostGIS
        ├─ Supabase Realtime Broadcast + Presence
        ├─ Supabase Storage
        └─ Edge Functions / server routes
                 │
                 ├─ Plant identification provider
                 ├─ Learning-escort LLM provider
                 └─ Export and background processing
```

## 3. Frontend boundaries

### Server components

Use for:

- authenticated page shells;
- initial class and activity data;
- teacher dashboards;
- read-heavy screens;
- role-aware navigation.

### Client components

Use for:

- Mapbox map and route editing;
- live location subscription;
- camera and media capture;
- offline queue;
- forms requiring local interaction;
- Realtime Presence and Broadcast.

Do not put the entire application behind a single client component.

## 4. Suggested modules

```text
src/
  app/
    (auth)/
    (student)/
    (teacher)/
    (admin)/
    api/
  components/
  features/
    auth/
    classes/
    groups/
    activities/
    sessions/
    live-map/
    observations/
    assessment/
  lib/
    supabase/
    mapbox/
    authz/
    offline/
    validation/
  plugins/
    plant-survey/
```

Business logic should remain independent from page components.

## 5. Authentication and authorization

- Supabase Auth provides identity.
- `profiles` stores display information only.
- Class and school permissions are stored in membership tables.
- Global admin authorization may use protected app metadata, but database membership remains the source of truth for class-scoped access.
- Every public table has RLS.
- Server code must still validate input and authorization; service-role usage is restricted to trusted backend operations.

## 6. Realtime strategy

### Presence

Use Presence for low-frequency state:

- connected participants;
- ready/exploring/paused status;
- current screen or capability;
- last heartbeat.

### Broadcast

Use Broadcast for high-frequency ephemeral events:

- location update;
- heading, speed, accuracy;
- checkpoint reached;
- teacher alert;
- acknowledgement;
- route progress.

Channel naming:

```text
session:{sessionId}:group:{groupId}
session:{sessionId}:teachers
```

Membership and session authorization must be checked before a user receives channel credentials or subscribes to private channels.

### Durable persistence

Do not insert every GPS sample. Broadcast frequent samples and persist only sampled or meaningful events:

- every configurable interval while moving;
- when reaching a checkpoint;
- when leaving the boundary for a sustained duration;
- when recording an observation;
- at pause, resume, and completion.

## 7. Map architecture

Mapbox renders:

- route LineString;
- boundary Polygon/MultiPolygon;
- checkpoint Points;
- observation Points;
- member markers;
- actual track;
- GPS accuracy radius.

PostGIS performs server-side spatial validation, distance queries, point-in-polygon checks, and export preparation. Client-side Turf-compatible utilities may provide immediate feedback, but the database is authoritative for saved geometry.

## 8. Offline design

Use IndexedDB through a small abstraction. Store:

- observation drafts;
- client-generated UUIDs;
- pending media uploads;
- location track segments;
- synchronization attempts and errors.

Synchronization rules:

1. Create observation record idempotently using `client_generated_id`.
2. Upload media to deterministic paths.
3. Attach media metadata.
4. Submit observation only after required records are durable.
5. Resolve server validation errors without discarding the local draft.

Live location cannot be guaranteed offline. Display the last known server timestamp clearly and upload historical track segments after reconnection.

## 9. AI provider architecture

```ts
export interface PlantIdentificationProvider {
  identify(input: PlantIdentificationInput): Promise<PlantIdentificationResult>;
}

export interface LearningEscortProvider {
  guide(input: LearningEscortInput): Promise<LearningEscortResult>;
}
```

Provider responses must be normalized before reaching the UI. Store provider name, model, request version, confidence when available, and a safe summary. Do not expose hidden chain-of-thought or store unnecessary raw prompts containing student data.

AI calls run through trusted server routes or Edge Functions. Apply rate limits, file-size validation, media-type checks, and usage logs.

## 10. Privacy and safety

- Location sharing exists only during authorized sessions.
- Raw tracks are not public to classmates after the session.
- Teacher views show the minimum information required for supervision.
- Store explicit timestamps for last location update.
- Set a retention period for raw location events.
- Strip unnecessary EXIF data from exported or publicly shared images.
- Provide a teacher-controlled emergency stop that closes location publishing and marks the session paused.

## 11. Deployment

Recommended initial deployment:

- Vercel for Next.js;
- Supabase hosted project;
- Mapbox token restricted by allowed URLs;
- separate development, staging, and production environments;
- environment validation at build and runtime;
- preview deployments connected only to non-production data.

## 12. Observability

Capture:

- application errors;
- failed sync operations;
- Realtime connection state;
- AI request latency and failure category;
- session-control audit events;
- database and RLS policy tests.

Never log access tokens, exact student locations in general application logs, or private image URLs.