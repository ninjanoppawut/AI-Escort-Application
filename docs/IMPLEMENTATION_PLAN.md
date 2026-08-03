# Implementation Plan

## Delivery strategy

Build vertical slices in the same order as the real classroom and field workflow. Prove authorization, concurrency, group history, and data preservation before optimizing AI or map visuals.

## Phase 0 — Foundation

- Scaffold Next.js App Router with TypeScript strict mode.
- Add Tailwind, shadcn/ui, ESLint, formatting, Vitest, and Playwright.
- Configure Supabase browser/server clients and environment validation.
- Add CI for lint, typecheck, tests, and build.
- Establish domain modules, stable error codes, and an event-logging interface.

**Exit:** application builds locally and in CI; secrets are separated correctly.

## Phase 1 — Auth, classes, invitations, and RBAC

- Sign in/out, reset, and profile bootstrap.
- Teacher class creation with group configuration.
- Class code/link/QR invite flow.
- Atomic invite use and active student membership creation.
- Student, teacher, and admin route protection.
- RLS policy tests with multiple users/classes.

**Exit:** teacher creates a class and students join without email or cross-class data access.

## Phase 2 — In-app notifications

- Durable notifications table and RLS.
- Notification bell, unread count, list, mark-read, and deep links.
- Private `user:{userId}:notifications` signal channel.
- Initial fetch + Realtime invalidation/refetch + focus/reconnect refetch.

**Exit:** a notification persists after app restart and only the recipient can read/mark it.

## Phase 3 — Student-led group formation

- Group settings and group-board read model.
- Atomic `create_student_group` RPC with class-row locking.
- Student group-creation claim.
- Exactly one leader per group.
- One active/forming group per student per class.
- Maximum group count and capacity validation.
- Disabled Create Group state with explanatory reason.
- Private `class:{classId}:groups` signal channel.
- Realtime invalidation/refetch instead of five-second primary polling.

**Exit:** two students racing for the final group slot produce exactly one success; all class clients update immediately.

## Phase 4 — Group invitations and leadership

- Leader classmate eligibility search.
- Send/cancel/accept/decline invitations.
- In-app invitation notifications.
- Revalidate group capacity and student membership at acceptance time.
- Atomic leadership transfer.
- Group lifecycle: forming, ready, approved, locked, archived.

**Exit:** leader invites an eligible classmate, the classmate accepts, and the system prevents multiple active leaders or group memberships.

## Phase 5 — Teacher group management

- Teacher group board with unassigned students.
- Move student between groups with capacity checks.
- Successor selection when moving a leader.
- Approve, lock, unlock, manually create, delete unused group, and archive historical group.
- Cancel pending invitations and notify affected users.
- Block ordinary changes during active session participation.
- Group membership/audit history.

**Exit:** teacher safely moves a student, changes leadership, deletes an unused group, and archives a historical group without corrupting session data.

## Phase 6 — Activities, geometry, and session snapshot

- Teacher activity CRUD.
- Route, boundary, checkpoint builder.
- PostGIS validation and GeoJSON read models.
- Session creation.
- Snapshot current group members and roles into `session_participants` when opening the session.

**Exit:** later class-group moves do not alter earlier session participation.

## Phase 7 — Session control and live map

- Open/pause/complete session.
- Queue groups.
- Atomic active-group RPC and partial unique index.
- Presence/Broadcast location flow.
- Teacher map with group members, route, boundary, and checkpoint progress.
- Waiting groups can preview route but cannot publish/submit.
- In-app notifications for next/active group state.

**Exit:** only one group can be active under concurrency; unauthorized users cannot subscribe/read.

## Phase 8 — Individual observation foundation

- Start observation with client-generated UUID.
- Capture location, GPS accuracy, and capture time.
- Handle GPS retry and explicit missing-location state.
- Student-owned draft workflow.
- Research/status events.

**Exit:** one student creates an idempotent private draft tied to a participant snapshot.

## Phase 9 — Image pipeline

- Camera/gallery capture.
- Client orientation correction, resize, compression, and preview.
- Limits: 1–10 images, required whole-plant category, maximum 2,048 px longest edge and 5 MB per processed image.
- Private Storage bucket, deterministic paths, RLS/policies, upload retry.
- Presentation transformations for marker/list/review.

**Exit:** oversized images are reduced, uploads retry safely, and unauthorized access is denied.

## Phase 10 — Durable Gemini analysis worker

- Create `ai_analysis_runs` and queue message contract.
- Supabase Queue + Edge Function consumer.
- Gemini provider adapter.
- Prompt/model/schema version logging.
- Zod validation of normalized response.
- Retry/failure/manual-entry path.
- Student receives durable analysis-state updates.

**Exit:** browser may close/reconnect without losing the job; failed analysis leaves the draft usable.

## Phase 11 — Student verification and submission

- Candidate selection/manual identity entry.
- Trait checks: match, not_match, unsure, not_visible.
- Corrected/additional trait fields.
- Required Thai/common name, scientific name, and evidence note.
- Same-species-in-session query, warning, acknowledgement, teacher tag, and teacher notification.
- Immutable submission version and optimistic concurrency.

**Exit:** student reviews the real plant, acknowledges a same-species warning, and submits successfully.

## Phase 12 — Teacher marker and review workflow

- Submitted markers on teacher map using capture location.
- Status-aware accessible marker styles.
- Marker detail panel with images, AI result, student corrections, capture metadata, same-species tag, and history.
- Manual teacher decisions and corrections.
- Revision request and student resubmission of the same observation.
- Student in-app review-result notifications.

**Exit:** teacher requests revision; student resubmits; teacher corrects and verifies without overwriting history.

## Phase 13 — Completed activity map

- Teacher manually completes session/activity.
- Completed-session map read model.
- Authorized teacher and participating-student access.
- Click marker to open plant details.
- Hide/restrict raw historical live-location data.

**Exit:** both permitted roles can review the completed plant map and details.

## Phase 14 — Offline hardening and exports

- IndexedDB observation drafts and upload queue.
- Deferred media and event synchronization.
- Conflict/retry interface.
- CSV/GeoJSON export.
- Retention/privacy controls and research-event export.

Group creation/invitation acceptance remain online-authoritative; cached group UI never reserves a slot offline.

**Exit:** airplane-mode observation draft synchronizes once without duplicates; reviewed map data exports correctly.

## Testing priorities

1. Cross-class/session RLS isolation.
2. Atomic invite use.
3. Final group-slot race.
4. One leader per group.
5. One active/forming group per student per class.
6. Invitation acceptance revalidation.
7. Teacher move/delete/archive behavior.
8. Session participant snapshot preservation.
9. Notification recipient isolation and persistence.
10. Group-board Realtime invalidation/refetch.
11. Active exploration-group concurrency.
12. Observation ownership and participant snapshot.
13. Image count/size/category validation.
14. Private Storage access.
15. Queue idempotency and AI retry.
16. Required student identity fields.
17. Same-species warning allows submission and tags/notifies teacher.
18. Immutable submission/review history.
19. Map marker visibility/status and capture-location accuracy.
20. Completed-map role access.
21. Mobile usability under weak connectivity.

## Recommended first sprint

- Foundation and CI.
- Auth/profile/classes/RBAC.
- Class invitation flow.
- Durable notifications foundation.
- Class/group schema and RLS.
- Atomic student group creation.
- Group board and Realtime invalidation/refetch.
- Tests for final-slot race, one leader, and one group per student.

Do not begin Gemini integration before class/group authorization, session snapshots, observation ownership, Storage authorization, and lifecycle persistence are proven.
