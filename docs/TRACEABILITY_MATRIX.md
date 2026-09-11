# Requirements Traceability Matrix

## Purpose

This matrix connects product requirements to implementation surfaces and verification. It is a navigation aid, not a replacement for the canonical documents or module specifications.

## Rules

1. Every module requirement ID must appear in this matrix and in `ROADMAP.md`.
2. A requirement is complete only when the UI/server contract, database authorization, and named tests all pass where applicable.
3. Update a row when endpoints, RPCs, tables, policies, screens, or test locations change.
4. Generated artifacts and exact test paths should replace conceptual names during implementation.

## Matrix

P1-04 supplemental trace: `AUTH-004` is implemented by `/join`,
`/join/[token]`, `src/features/classes/components/student-class-joiner.tsx`,
`POST /api/classes/join`, and `public.join_class_with_invite(text,text)` in
`supabase/migrations/20260806135731_phase1_class_join.sql`. The slice adds
atomic invite code/link-token consumption, token-hash-only lookup, active
identity/account/class/school/invite validation, max-use locking, active student
school/class membership creation or reactivation, idempotent `already_joined`
replay, and `class_joined`/`student_joined_class` notification rows. Verification
is `phase1_class_join_test.sql`, `phase1_class_join_concurrency.ps1`,
`src/features/classes/**/*.test.ts(x)`, and the Playwright join grep in
`tests/e2e/class-management.spec.ts`.

P1-06 supplemental trace: broad Phase 1 auth/classes/RBAC regression coverage is
implemented by `supabase/tests/phase1_auth_classes_rbac_regression_test.sql`
and the Playwright grep `student join replay denies cross-class and
teacher-route access` in `tests/e2e/class-management.spec.ts`. The database
suite covers multi-user, multi-school, and multi-class RLS isolation for Phase 1
tables/read-model RPCs, role-escalation denial, ignored user-editable metadata,
trusted table write denial, teacher cross-school/class management denial, anon
RPC denial, and invite code/token replay idempotency. The browser case covers
local Supabase join replay, cross-class member-list denial, unauthorized class
hiding on `/app`, and signed-in student denial on `/teacher/classes`.

P1-07 supplemental trace: targeted auth/provisioning coverage was extended in
`tests/e2e/auth.spec.ts`, `src/features/auth/recovery.ts`,
`src/features/auth/server/identity.test.ts`, and
`supabase/tests/phase1_trusted_provisioning_test.sql`. The added coverage
targets protected-route denial before confirmation, recovery-link replay,
bogus/expired callback-code denial, signed recovery AMR checks, admin revoke
MFA enforcement, user-editable metadata denial for platform-admin authority,
revoked-admin next-check denial, and revoked teacher-invitation preview/consume
denial. Local Supabase/Mailpit execution passed on 2026-08-07 with the
database, quality, browser, advisor, and client-secret scan evidence recorded
under P1-07 in `ROADMAP.md`.

P1-EXIT supplemental trace: the Phase 1 exit journey is implemented by the
Playwright grep `P1-EXIT` in `tests/e2e/class-management.spec.ts`, with
supporting local Auth/Mailpit coverage in `tests/e2e/auth.spec.ts`. It verifies
that an unprovisioned teacher is denied, a platform-admin/trusted provisioning
path grants teacher capability, the teacher creates a class and invite, verified
students join by code and link token, the browser cannot choose/escalate role,
join replay is idempotent, and cross-class member access remains denied. Full
local verification evidence is recorded under P1-EXIT in `ROADMAP.md`.

| Requirements | Product/decision source | UI surfaces | API, RPC, or event contract | Data and authorization | Required verification | Roadmap |
|---|---|---|---|---|---|---|
| AUTH-001 | PRD Â§2; D-030, D-061 | `src/app/auth/*`, `/app`: Thai-first signup/confirmation, sign in/out, recovery, profile and explicit offline/error states | `POST /api/auth/sign-up`, `/sign-in`, `/sign-out`, `/resend-confirmation`, `/forgot-password`, `/update-password`; `GET /api/auth/callback`, `/api/me` | Supabase Auth plus `profiles`; trigger bootstrap and metadata-independent RLS in `20260805083021_phase1_identity_foundation.sql` | `src/features/auth/**/*.test.ts(x)`; `tests/e2e/auth.spec.ts` local Auth/Mailpit flow; `phase1_identity_foundation_test.sql`; P1-EXIT Playwright local verified-email join flow; hosted SMTP/redirect evidence pending | P1-01, P1-07, P1-EXIT |
| AUTH-002â€“AUTH-004 | PRD Â§Â§3â€“4; D-031, D-047 | `src/app/teacher/classes/page.tsx` and `src/features/classes/components/teacher-class-manager.tsx` implement teacher class creation/settings and code/link/QR invite management; `src/app/join/*` and `StudentClassJoiner` implement student invite joining | P1-03 HTTP routes: `POST /api/classes`, `PUT /api/classes/:id/group-settings`, `POST /api/classes/:id/invites`, `POST /api/classes/:id/invites/:inviteId/disable`, `POST /api/classes/:id/invites/:inviteId/rotate`; P1-04 `POST /api/classes/join` and `join_class_with_invite()` | `classes`, `class_members`, `class_invites`, constraints, actor-validation triggers, grants, RLS in `20260805224248_phase1_class_foundation.sql`; trusted class/invite RPCs, private invite token generation/hashing, audit/research emitters in `20260806062357_phase1_class_operations.sql`; atomic invite consumption in `20260806135731_phase1_class_join.sql`; token hash excluded from authenticated grants | `phase1_class_foundation_test.sql`; `phase1_class_operations_test.sql`; `phase1_class_operations_concurrency.ps1`; `phase1_class_join_test.sql`; `phase1_class_join_concurrency.ps1`; `src/features/classes/**/*.test.ts(x)`; P1-EXIT Playwright grep in `tests/e2e/class-management.spec.ts` | P1-02â€“P1-05, P1-EXIT |
| AUTH-005â€“AUTH-007 | PRD Â§2; D-030, D-059 | `/app` student active class/member browser and `/teacher/classes` teacher class/member browser with Thai-first loading, empty, offline, retry, permission-denied, inactive-class, and null-group states | `GET /api/classes`; `GET /api/classes/:id/members?role=&status=&limit=&cursor=`; `list_authorized_classes()`; `list_class_members(uuid,text,text,integer,text,uuid)` | Membership-authoritative class/member/invite RLS and least-privilege grants in `20260805224248_phase1_class_foundation.sql`; P1-05 read-model RPCs and indexes in `20260806162428_phase1_class_member_read_models.sql`; browser writes remain denied | `phase1_class_member_read_models_test.sql`; `phase1_auth_classes_rbac_regression_test.sql`; `src/features/classes/contracts.test.ts`; `src/features/classes/components/class-member-browser.test.tsx`; P1-05/P1-06/P1-EXIT Playwright greps in `tests/e2e/class-management.spec.ts` | P1-02, P1-05, P1-06, P1-EXIT |
| AUTH-008 | PRD Â§18; D-029 | No separate required screen | audit/research event append | `research_events`/`audit_logs` append-only tables added in `20260806035312_phase1_trusted_provisioning.sql` for trusted provisioning; broader event producers remain later slices | `phase1_trusted_provisioning_test.sql` covers exactly one `teacher_invitation_consumed` event and rollback/no-duplicate cases; full local DB suite passed 120 assertions | P1 |
| AUTH-009 | D-061 | Confirmation/resend and signed-out/unconfirmed/inactive denied states in `src/app/auth` and `src/app/app/page.tsx` | canonical PKCE `GET /api/auth/callback`; protected `GET /api/me`; SSR proxy refresh | Confirmed Auth identity plus active profile required; profile and class actor/RLS checks reject unconfirmed or inactive identities | `tests/e2e/auth.spec.ts` includes local Mailpit signup/resend/recovery plus protected `/app` denial before confirmation; `src/features/auth/server/identity.test.ts`; `phase1_identity_foundation_test.sql`; `phase1_class_foundation_test.sql` | P1-01, P1-02, P1-07 |
| AUTH-010â€“AUTH-011 | D-030, D-061 | Signup states student default and exposes no role/school/admin control; teacher invitation UI remains | Signup schema rejects role/account/school fields; `consume_teacher_invitation(token)` performs trusted teacher provisioning | Relational `profiles.account_type`, school memberships, platform admins, teacher invitations, and class roles; class actor triggers enforce account/role parity without Auth metadata; `20260806035312_phase1_trusted_provisioning.sql` adds email-bound teacher consume and admin provisioning RPCs | `contracts.test.ts`, `auth-forms.test.tsx`, `server-boundary.test.ts`, `phase1_identity_foundation_test.sql`, `phase1_class_foundation_test.sql`, `phase1_trusted_provisioning_test.sql`, `phase1_auth_classes_rbac_regression_test.sql`, P1-02A consume-race harness, and P1-EXIT Playwright role-escalation/provisioning coverage | P1-01, P1-02, P1-02A, P1-06, P1-07, P1-EXIT |
| AUTH-012 | D-062 | Protected routes and PKCE confirmation/recovery states | `src/proxy.ts`; request-scoped SSR clients use cookie `getAll`/`setAll`, early `getClaims()`, current-user/profile validation, safe redirects and no-store responses; `src/features/auth/recovery.ts` validates signed recovery AMR claims | Signed claims plus fresh Auth user and relational active profile; no `getSession()` authorization | `redirect.test.ts`, `server-boundary.test.ts`, `identity.test.ts`, and `tests/e2e/auth.spec.ts` callback/recovery replay coverage | P1-01, P1-07 |
| NOT-001â€“NOT-002 | PRD Â§8; D-032 | Notification center and unread badge in `src/app/notifications/page.tsx`, `notification-center.tsx`, `notification-badge.tsx`, and `/app`; detail destinations remain later feature routes | `GET /api/notifications`; `POST /api/notifications/:id/read`; `POST /api/notifications/read-all`; server operations in `src/features/notifications/server/operations.ts` | `public.notifications` upgraded in `20260812021256_phase2_notification_foundation.sql`; recipient RLS, browser insert denial, supporting indexes, generated types | `phase2_notification_foundation_test.sql` covers recipient isolation, mark-read authorization, browser insert denial, RLS, and grants; `tests/e2e/notifications.spec.ts` covers list, unread count, cursor paging, durable reload persistence, local database restart persistence, cross-user visibility and mark-read denial, mark one/all read, unread filter, and authoritative other-user isolation after sign-in switch; `notification-center.test.tsx` covers center/badge UI states | P2-01â€“P2-EXIT |
| NOT-003â€“NOT-004 | PRD Â§8; D-032, D-041 | Reconnecting/stale indicators and notification center stale states in `notification-center.tsx` | private `user:{userId}:notifications` signal plus authoritative refetch invalidation in `src/features/notifications/client/realtime.tsx` mounted by `src/app/app-providers.tsx` | `20260812041306_phase2_notification_realtime.sql` adds `private.broadcast_notification_signal`, insert trigger, and recipient/topic-scoped `realtime.messages` Broadcast receive policy | `phase2_notification_realtime_test.sql` covers policy/trigger/signal insert; `realtime.test.ts` covers private subscription, Supabase database Broadcast payload metadata/timestamps, payload recipient guard, and query invalidation; `tests/e2e/notifications.spec.ts` covers private signal followed by authoritative refetch | P2-03â€“P2-05 |
| NOT-005â€“NOT-007 | PRD Â§8; D-046, D-057â€“D-058 | Eight row layouts implemented in `notification-center.tsx`; deleted-target and deep-link states covered in `/notifications`; later detail routes and producer phases add destination-specific content | typed notification producer foundation in `private.insert_notification`; deterministic deep-link generation in `src/features/notifications/deep-link.ts`; export-ready producer remains P14 | `public.notification_types`, registry FK, relational notification target columns, private target trigger, versioned object payload validation, and `src/features/notifications/contracts.ts` | `phase2_notification_foundation_test.sql`; `src/features/notifications/contracts.test.ts`; `operations.test.ts`; `notification-center.test.tsx`; `tests/e2e/notifications.spec.ts` covers generated deep-link rendering and destination reauthorization; export-ready authorization tests remain P14 producer phase | P2-01â€“P2-05 and producer phase |
| GRP-001 | PRD Â§5; D-035, D-041 | Student group board remains P3-03; schema foundation now available for authoritative groups/current memberships | group-board read model remains P3-03 | `groups`, `group_members`, class-member RLS, and current-group indexes in `20260813050854_phase3_group_foundation.sql` | `phase3_group_foundation_test.sql` covers group/member RLS and current schema invariants; availability and stale-refetch UI remain P3-03/P3-04 | P3-01, P3-03â€“P3-04 |
| GRP-002â€“GRP-006 | PRD Â§Â§5â€“6; D-034â€“D-038, D-047 | Create Group and race-loss states remain P3-02/P3-03 | `create_student_group` remains P3-02 | `groups`, `group_members`, `student_group_creation_claims`, `group_membership_history`, composite group/class FKs, validation triggers, one-active-leader, one-active-group, and one-unreset-claim partial unique indexes in `20260813050854_phase3_group_foundation.sql`; class row locks and maximum-count enforcement remain P3-02 | `phase3_group_foundation_test.sql` covers one leader, one current group, one unreset creation claim, append-only history, RLS, browser write denial, helper hardening, and FK indexes; final-slot race remains P3-05 | P3-01â€“P3-05 |
| GRP-007â€“GRP-009 | PRD Â§5; D-039â€“D-040 | Invite classmates and invitation detail | send/cancel/accept/decline; transfer leader | group_invitations; leader/member/capacity policies | accept race, capacity, eligibility, consent | P4 |
| GRP-010 | PRD Â§5; D-041 | Refreshing/reconnecting group board | private class signal | authorized channel plus authoritative query | foreground/network/Realtime refetch | P3 |
| MGT-001â€“MGT-002 | PRD Â§7; D-042, D-047 | Teacher group board, create group | teacher group read/create | class/group teacher RLS; absolute maximum | cross-class and maximum tests | P5 |
| MGT-003â€“MGT-006 | PRD Â§7; D-040, D-042, D-045, D-059 | Move, successor, approve/lock/reset flows | move/transfer/approve/lock/reset RPCs | membership/history/claims; atomic validation | leader, capacity, active-session, audit | P5 |
| MGT-007â€“MGT-009 | PRD Â§7; D-044 | Delete/archive confirmation | delete-or-archive plus notification/signal | groups, invitations, session history, events | delete vs archive and affected-user updates | P5 |
| SES-001â€“SES-003 | PRD Â§Â§3, 7; D-002, D-043 | Activity builder, session setup | activity/session create/open | activities, geometry, sessions, participants; teacher RLS | geometry and snapshot preservation | P6 |
| SES-004â€“SES-007 | PRD Â§Â§9, 15; D-003â€“D-004, D-056 | Queue, active controls, waiting/paused field shell | activate/pause/resume/group/session complete RPCs | session_groups; partial unique active index | activation race and state transition tests | P7 |
| SES-008â€“SES-010 | PRD Â§15; D-006, D-054 | Teacher live map | private Presence/Broadcast and durable sample event | session authorization; private live-location data | channel isolation and publish-stop | P7 |
| OBS-001â€“OBS-004 | PRD Â§Â§9â€“10; D-001, D-019â€“D-020, D-051 | Start observation and GPS states | idempotent observation start | observations/status/events; owner/participant RLS | ownership, active state, GPS, retry | P8 |
| OBS-005â€“OBS-008 | PRD Â§16; D-021 | Camera/gallery, processing/upload | media create/delete/upload authorization | observation_media and private Storage policies | limits, transform, idempotency, access denial | P9 |
| OBS-009â€“OBS-011 | PRD Â§17; D-052 | Sync/retry/conflict/recovered draft | offline reconciliation and version precondition | IndexedDB queue plus observation version | airplane recovery, single sync, conflict | P8 and P14 |
| AI-001â€“AI-003 | PRD Â§Â§9, 13; D-007, D-011 | Analyze action and queued state | analyze endpoint, queue message, Edge Function | ai_analysis_runs; owner eligibility/worker grants | request idempotency and secret boundary | P10 |
| AI-004â€“AI-006 | D-008, D-010, D-015 | Analysis detail/provenance where permitted | provider adapter and schema-version parser | AI runs/results/raw reference; separate evidence layers | malformed output and provenance tests | P10 |
| AI-007â€“AI-010 | PRD Â§13; D-009, D-012 | Confidence, retry, failed/manual states | bounded retry/dead-letter/manual retry | run state/events; minimal provider context | retry, draft preservation, no live-location leak | P10 |
| REV-001â€“REV-003 | PRD Â§Â§10, 12; D-013â€“D-015 | Candidate/manual entry, traits, submit review | student review and submit | trait verification and immutable submissions; owner RLS | required fields, `Unknown`, immutability | P11 |
| REV-004â€“REV-006 | PRD Â§14; D-022â€“D-025 | Same-species warning/related items | related query, acknowledgement, teacher relationship action | relation/tag/history and notification | warning permits submit; no auto-merge/distance-only | P11 |
| REV-007â€“REV-009 | PRD Â§Â§10â€“11; D-016â€“D-017, D-057 | Teacher review and student revision | review/resubmit with version preconditions | immutable reviews/status/submissions; teacher/owner RLS | all decisions, field locks, history, conflict | P12 |
| REV-010â€“REV-012 | D-048â€“D-049, D-052 | Unlock request and issue report | unlock request/grant; report | revision topics, requests, reports; identity/rate-limit rules | authorization, anonymity, 24h rate limit | P12 |
| MAP-001â€“MAP-003 | PRD Â§Â§11, 15; D-018, D-026, D-053 | Complete action and status markers | complete session; map read model | session/status/observation queries; teacher RLS | manual completion, draft exclusion, token coverage | P13 |
| MAP-004â€“MAP-006 | PRD Â§15; D-027, D-055 | Completed map and plant detail | session map and observation detail | session participants/class teachers; Storage auth | teacher/participant/non-participant isolation | P13 |
| MAP-007â€“MAP-011 | PRD Â§18; D-028â€“D-029, D-046 | Export entry/status/download | CSV/GeoJSON and queued export events | export jobs/artifacts/research events/retention controls | schema, idempotency, reauth, privacy, retention | P14 |
| ADM-001â€“ADM-003 | PRD Â§2 Admin; D-062â€“D-063 | Admin shell, schools, teacher invitation, user directory | P1-02A RPC boundary: `grant_platform_admin`, `revoke_platform_admin`, `issue_teacher_invitation`, `revoke_teacher_invitation`, `preview_teacher_invitation`, `consume_teacher_invitation`; admin HTTP UI/contracts remain P15 | `platform_admins`, `schools`, `school_memberships`, `teacher_invitations`, `audit_logs`, `research_events` | `phase1_trusted_provisioning_test.sql` covers grant/revoke, MFA, provisioning, non-admin denial, token non-disclosure, expiry, revocation, replay, rollback, inactive/unconfirmed denial, and FK/function hardening; P1-02A race harness covers concurrent consume | P1 and P15 |
| ADM-004â€“ADM-007 | D-063; NFR/operations | Audit/error explorers and flow-health dashboard | admin audit/errors/flow-health reads | audit_logs, operational_error_events, provider metrics; protected read models | redaction, bounded filters, correlation, partial source | P0 and P15 |
| ADM-008â€“ADM-012 | D-063â€“D-064 | Incidents, notes, scoped break-glass | acknowledge/note/break-glass contracts | incidents/notes/admin access audit; retention | append-only, cursor/range, expiry/scope/MFA | P15 |

## Cross-cutting verification suites

| Suite | Covers | Minimum evidence |
|---|---|---|
| RLS and authorization | All modules | At least two users, classes, groups, and sessions; positive and negative operations |
| Concurrency | GRP, MGT, SES, OBS, REV | Parallel transactions for final slot, invitation capacity, leadership, active group, and versions |
| Realtime recovery | NOT, GRP, SES | Initial fetch, private signal, authoritative refetch, reconnect, foreground |
| Offline/idempotency | OBS, AI, MAP | Duplicate delivery/retry, browser restart, airplane-mode reconciliation |
| Privacy and secrets | AUTH, SES, OBS, AI, MAP | Bundle inspection, private channels/buckets, signed access, data minimization |
| Accessibility/mobile | All user-facing modules | 360/390/430 px student flows, keyboard teacher flows, non-color status cues |
| End-to-end MVP | All modules | The acceptance scenarios in `PRODUCT_REQUIREMENTS.md` Â§19 |
| Operations/redaction | ADM and all emitting modules | Flow/error correlation, low-cardinality metrics, redacted logs, admin-access audit, retention |

