# Implementation Plan

## Phase 0 — Foundation

- Scaffold Next.js App Router with TypeScript strict mode.
- Add Tailwind, shadcn/ui, ESLint, formatting, Vitest, and Playwright.
- Configure browser/server Supabase clients and environment validation.
- Add CI for lint, typecheck, test, and build.

**Exit:** application builds locally and in CI; protected and public route groups exist.

## Phase 1 — Authentication and RBAC

- Sign in, sign out, password reset, and profile bootstrap.
- Classes, class memberships, and invite flow.
- Teacher, student, and admin dashboards.
- RLS policy tests using multiple authenticated users.

**Exit:** a teacher creates a class and a student joins without seeing another class.

## Phase 2 — Groups and activities

- Group creation and membership.
- Activity CRUD and student proposal workflow.
- Teacher approval.
- Route, boundary, and checkpoint builder.
- Activity requirements and plugin configuration.

**Exit:** an approved activity contains valid GeoJSON and survey requirements.

## Phase 3 — Session control

- Create/open/pause/complete session.
- Queue groups.
- Atomic group activation RPC.
- Partial unique index preventing two active groups.
- Audit events for every session-control action.

**Exit:** concurrency test proves only one active group is possible.

## Phase 4 — Live map

- Mapbox field screen.
- Presence and Broadcast channels.
- Member markers and last-update status.
- Planned route, actual track, checkpoints, and observation markers.
- Geofence/off-route warning with tolerance.
- Teacher live dashboard and alerts.

**Exit:** two test users share location in one session and unauthorized users cannot subscribe or read persisted data.

## Phase 5 — Plant survey plugin

- Camera/media workflow.
- Structured plant and ecology forms.
- Draft and submit validation.
- Storage policies and media processing.
- Observation feed, comments, and identification records.
- AI provider adapters and provisional suggestions.

**Exit:** student submits a complete observation; teacher verifies it without overwriting original data.

## Phase 6 — Offline support

- IndexedDB queue.
- Idempotent observation synchronization.
- Deferred media upload.
- Historical track segment sync.
- Conflict and retry interface.

**Exit:** airplane-mode observation syncs once, with no duplicates.

## Phase 7 — Learning and reporting

- Reflection prompts.
- Rubrics and assessment results.
- Activity/session analytics.
- CSV and GeoJSON exports.
- Privacy and retention controls.

**Exit:** teacher completes a session, assesses students, and exports reviewed results.

## Testing priorities

1. RLS and cross-class isolation.
2. Concurrent active-group switching.
3. Offline idempotency.
4. Storage access.
5. Session-state transitions.
6. Observation preservation and verification.
7. Mobile live-map usability.

## Suggested first sprint

- Foundation and CI.
- Auth and profile bootstrap.
- Class schema plus RLS.
- Create-class and join-class flows.
- Role-aware dashboard.
- Automated authorization tests.

Avoid building AI or complex map functionality before class isolation and RLS are proven.