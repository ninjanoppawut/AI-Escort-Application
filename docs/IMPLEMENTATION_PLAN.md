# Implementation Plan

## Delivery strategy

Build vertical slices in the same order as the real field workflow. Prove authorization and data preservation before optimizing AI or map visuals.

## Phase 0 — Foundation

- Scaffold Next.js App Router with TypeScript strict mode.
- Add Tailwind, shadcn/ui, ESLint, formatting, Vitest, and Playwright.
- Configure Supabase browser/server clients and environment validation.
- Add CI for lint, typecheck, tests, and build.
- Establish domain modules, stable error codes, and an event-logging interface.

**Exit:** application builds locally and in CI; secrets are separated correctly.

## Phase 1 — Auth, classes, and RBAC

- Sign in/out, reset, and profile bootstrap.
- Classes, memberships, and invite flow.
- Student, teacher, and admin route protection.
- RLS policy tests with multiple users/classes.

**Exit:** a student sees only authorized class data; UI checks are backed by RLS.

## Phase 2 — Groups, activities, and geometry

- Group creation/membership.
- Teacher activity CRUD.
- Route, boundary, checkpoint builder.
- PostGIS validation and GeoJSON read models.
- Session creation and participant snapshot.

**Exit:** teacher can create a valid mobile field activity and session.

## Phase 3 — Session control and live map

- Open/pause/complete session.
- Queue groups.
- Atomic active-group RPC and partial unique index.
- Presence/Broadcast location flow.
- Teacher map with group members, route, boundary, and checkpoint progress.
- Waiting groups can preview route but cannot publish/submit.

**Exit:** only one group can be active under concurrency; unauthorized users cannot subscribe/read.

## Phase 4 — Individual observation foundation

- Start observation with client-generated UUID.
- Capture location, GPS accuracy, and capture time.
- Handle GPS retry and explicit missing-location state.
- Student-owned draft workflow.
- Research/status events.

**Exit:** one student creates an idempotent private draft tied to a participant snapshot.

## Phase 5 — Image pipeline

- Camera/gallery capture.
- Client orientation correction, resize, compression, and preview.
- Limits: 1–10 images, required whole-plant category, maximum 2,048 px longest edge and 5 MB per processed image.
- Private Storage bucket, deterministic paths, RLS/policies, upload retry.
- Presentation transformations for marker/list/review.

**Exit:** oversized images are reduced, uploads retry safely, and unauthorized access is denied.

## Phase 6 — Durable Gemini analysis worker

- Create `ai_analysis_runs` and queue message contract.
- Supabase Queue + Edge Function consumer.
- Gemini provider adapter.
- Prompt/model/schema version logging.
- Zod validation of normalized response.
- Retry/failure/manual-entry path.
- Student receives durable analysis-state updates.

**Exit:** browser may close/reconnect without losing the job; failed analysis leaves the draft usable.

## Phase 7 — Student verification and submission

- Candidate selection/manual identity entry.
- Trait checks: match, not_match, unsure, not_visible.
- Corrected/additional trait fields.
- Required Thai/common name, scientific name, and evidence note.
- Same-species-in-session query, warning, acknowledgement, and teacher tag.
- Immutable submission version and optimistic concurrency.

**Exit:** student reviews the real plant, acknowledges a same-species warning, and submits successfully.

## Phase 8 — Teacher marker and review workflow

- Submitted markers on teacher map using capture location.
- Status-aware accessible marker styles.
- Marker detail panel with images, AI result, student corrections, capture metadata, same-species tag, and history.
- Manual teacher decisions and corrections.
- Revision request and student resubmission of the same observation.

**Exit:** teacher requests revision; student resubmits; teacher corrects and verifies without overwriting history.

## Phase 9 — Completed activity map

- Teacher manually completes session/activity.
- Completed-session map read model.
- Authorized teacher and participating-student access.
- Click marker to open plant details.
- Hide/restrict raw historical live-location data.

**Exit:** both permitted roles can review the completed plant map and details.

## Phase 10 — Offline hardening and exports

- IndexedDB drafts and upload queue.
- Deferred media and event synchronization.
- Conflict/retry interface.
- CSV/GeoJSON export.
- Retention/privacy controls and research-event export.

**Exit:** airplane-mode draft synchronizes once without duplicates; reviewed map data exports correctly.

## Testing priorities

1. Cross-class/session RLS isolation.
2. Active-group concurrency.
3. Observation ownership and participant snapshot.
4. Image count/size/category validation.
5. Private Storage access.
6. Queue idempotency and AI retry.
7. Required student identity fields.
8. Same-species warning allows submission and tags teacher view.
9. Immutable submission/review history.
10. Map marker visibility/status and capture-location accuracy.
11. Completed-map role access.
12. Mobile field usability under weak connectivity.

## Recommended first sprint

- Foundation and CI.
- Auth/profile/classes/RBAC.
- Class and membership RLS tests.
- Group/activity/session schema.
- Participant snapshot.
- Active-group database constraint and RPC.

Do not begin Gemini integration before observation ownership, Storage authorization, and lifecycle persistence are proven.