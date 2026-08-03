# Implementation Plan

## Phase 0 — Foundation

- Scaffold Next.js App Router with TypeScript strict mode.
- Add Tailwind, shadcn/ui, ESLint, formatting, Vitest, and Playwright.
- Configure browser/server Supabase clients and environment validation.
- Add CI for lint, typecheck, test, and build.

**Exit:** application builds locally and in CI.

## Phase 1 — Authentication and RBAC

- Sign in, sign out, password reset, and profile bootstrap.
- Classes, memberships, invite flow, teacher/student dashboards.
- RLS policy tests with multiple authenticated users.

**Exit:** a teacher creates a class and a student joins without seeing another class.

## Phase 2 — Groups, activities, and geometry

- Group creation and membership.
- Teacher-created activity CRUD.
- Route, boundary, and checkpoint builder.
- Map geometry validation.

**Exit:** an activity has a valid route and exploration boundary.

## Phase 3 — Session control

- Create/open/pause/complete session.
- Snapshot session participants and groups.
- Queue groups and atomic group activation RPC.
- Partial unique index preventing two active groups.
- Waiting-group route preview with publishing disabled.

**Exit:** concurrency tests prove only one active group can publish.

## Phase 4 — Live field map

- Mapbox student field screen and teacher dashboard.
- Presence and Broadcast channels.
- Member markers, last-update state, route, track, and checkpoints.
- Boundary warning with GPS-accuracy tolerance.

**Exit:** authorized active-group users share location; waiting and unauthorized users cannot publish.

## Phase 5 — Observation capture

- Create observation draft with client-generated UUID.
- Capture and store GPS, accuracy, and capture time.
- Camera/media upload and offline media queue.
- Separate capture location from later submission location.
- Private Storage policies.

**Exit:** a student captures a plant observation with durable image and location evidence.

## Phase 6 — Gemini analysis

- Gemini provider adapter behind trusted server route.
- Versioned prompt and JSON response schema.
- Candidate plant names and visible trait extraction.
- Explicit unknown/not-visible handling.
- Additional-image requests.
- Rate limits, usage logs, error states, and manual fallback.

**Exit:** Gemini analysis is validated and stored without becoming the final answer.

## Phase 7 — Student verification

- Trait review UI with `match`, `not_match`, `unsure`, and `not_visible`.
- Corrected values, notes, and additional evidence.
- Candidate selection or unresolved identification.
- Preserve AI and student values separately.

**Exit:** a student completes verification against the real plant.

## Phase 8 — Species and specimen dedupe

- Normalize Gemini/student taxonomy through an adapter.
- Species-level duplicate lookup.
- Visual embedding/image similarity service.
- Trait similarity, distance, and time features.
- Combined candidate ranking.
- Student decisions: same specimen, different specimen, unsure.
- Teacher override/finalization.
- Shared specimen IDs without merging observation records.

**Exit:** same-species records are warned but allowed; likely same-specimen records require human confirmation.

## Phase 9 — Submission and teacher review

- Submission location, accuracy, and time.
- Observation status machine and immutable status history.
- Teacher review screen showing images, Gemini output, student corrections, locations, times, and dedupe evidence.
- Verify, revision required, unable to verify, reject.
- Accepted identification and duplicate decision.

**Exit:** teacher reviews without overwriting original AI/student evidence.

## Phase 10 — Offline synchronization

- IndexedDB observation and media queue.
- Idempotent draft, upload, verification, and submission synchronization.
- Conflict/retry interface.

**Exit:** airplane-mode capture syncs once with no duplicate records.

## Phase 11 — Learning and reporting

- Reflection and assessment instruments.
- CSV/GeoJSON exports.
- Export AI, student, and teacher layers separately.
- Privacy, retention, and deletion controls.

**Exit:** teacher completes a session and exports traceable reviewed results.

## Testing priorities

1. RLS and cross-class isolation.
2. Concurrent active-group switching.
3. Capture versus submission location/time preservation.
4. Gemini schema validation and failure fallback.
5. Student verification preservation.
6. Species duplicate warning without blocking.
7. Specimen candidate ranking using more than distance.
8. No automatic observation deletion or merge.
9. Offline idempotency.
10. Storage access and private media.

## Recommended first delivery slice

Build one end-to-end vertical slice before advanced features:

```text
teacher creates class/activity/session
→ activates one group
→ student sees map and captures plant image
→ Gemini returns structured result
→ student verifies traits
→ basic species dedupe warning
→ student submits with location/time
→ teacher reviews
```

Implement visual specimen dedupe after this vertical slice is stable. Do not build public/community identification for the pilot MVP.