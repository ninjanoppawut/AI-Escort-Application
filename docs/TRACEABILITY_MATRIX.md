# Requirements Traceability Matrix

## Purpose

This matrix connects product requirements to implementation surfaces and verification. It is a navigation aid, not a replacement for the canonical documents or module specifications.

## Rules

1. Every module requirement ID must appear in this matrix and in `ROADMAP.md`.
2. A requirement is complete only when the UI/server contract, database authorization, and named tests all pass where applicable.
3. Update a row when endpoints, RPCs, tables, policies, screens, or test locations change.
4. Generated artifacts and exact test paths should replace conceptual names during implementation.

## Matrix

| Requirements | Product/decision source | UI surfaces | API, RPC, or event contract | Data and authorization | Required verification | Roadmap |
|---|---|---|---|---|---|---|
| AUTH-001 | PRD §2; D-030, D-061 | `src/app/auth/*`, `/app`: Thai-first signup/confirmation, sign in/out, recovery, profile and explicit offline/error states | `POST /api/auth/sign-up`, `/sign-in`, `/sign-out`, `/resend-confirmation`, `/forgot-password`, `/update-password`; `GET /api/auth/callback`, `/api/me` | Supabase Auth plus `profiles`; trigger bootstrap and metadata-independent RLS in `20260805083021_phase1_identity_foundation.sql` | `src/features/auth/**/*.test.ts(x)`; `tests/e2e/auth.spec.ts` local Auth/Mailpit flow; `phase1_identity_foundation_test.sql`; hosted SMTP/redirect evidence pending | P1-01, P1-07 |
| AUTH-002–AUTH-004 | PRD §§3–4; D-031, D-047 | Create/edit class, invite code/link/QR, invite preview | class create/settings; invite create/disable/join RPC | classes, class_members, class_invites; teacher/invite policies | class RLS; invite atomicity/idempotency | P1 |
| AUTH-005–AUTH-007 | PRD §2; D-030, D-059 | Role homes, class/member lists, denied state | authorized class/member queries | membership-authoritative RLS | cross-user/class/role tests; Playwright | P1 |
| AUTH-008 | PRD §18; D-029 | No separate required screen | audit/research event append | research_events/audit history; insert-only interface | event attribution and immutability | P1 |
| AUTH-009 | D-061 | Confirmation/resend and signed-out/unconfirmed/inactive denied states in `src/app/auth` and `src/app/app/page.tsx` | canonical PKCE `GET /api/auth/callback`; protected `GET /api/me`; SSR proxy refresh | Confirmed Auth identity plus active profile required; RLS hides unconfirmed/inactive profiles | `tests/e2e/auth.spec.ts`; `src/features/auth/server/identity.test.ts`; `phase1_identity_foundation_test.sql` | P1-01, P1-07 |
| AUTH-010–AUTH-011 | D-030, D-061 | Signup states student default and exposes no role/school/admin control; teacher invitation UI remains | Signup schema rejects role/account/school fields; trusted teacher invitation consumption remains | Relational `profiles.account_type`, school memberships, platform admins and teacher invitations; browser metadata is not authorization | `contracts.test.ts`, `auth-forms.test.tsx`, `server-boundary.test.ts`, `phase1_identity_foundation_test.sql`; trusted invite replay/revocation tests pending | P1-01, P1-02A, P1-07 |
| AUTH-012 | D-062 | Protected routes and PKCE confirmation/recovery states | `src/proxy.ts`; request-scoped SSR clients use cookie `getAll`/`setAll`, early `getClaims()`, current-user/profile validation, safe redirects and no-store responses | Signed claims plus fresh Auth user and relational active profile; no `getSession()` authorization | `redirect.test.ts`, `server-boundary.test.ts`, `identity.test.ts`, and `tests/e2e/auth.spec.ts` | P1-01, P1-07 |
| NOT-001–NOT-002 | PRD §8; D-032 | Notification center, badge, detail | list, mark one/all read | notifications; recipient RLS | isolation, persistence, mutation auth | P2 |
| NOT-003–NOT-004 | PRD §8; D-032, D-041 | Reconnecting/stale indicators | private user signal and refetch | private Realtime authorization | signal/refetch/focus/reconnect | P2 |
| NOT-005–NOT-007 | PRD §8; D-046, D-057–D-058 | Eight layouts and deep links | typed notification producers | relational target IDs plus versioned context | type coverage, target auth, export ready | P2 and producer phase |
| GRP-001 | PRD §5; D-035, D-041 | Student group board | group-board read model | groups/memberships; class-member RLS | availability and stale-refetch UI | P3 |
| GRP-002–GRP-006 | PRD §§5–6; D-034–D-038, D-047 | Create Group and race-loss states | `create_student_group` | groups, group_members, creation_claims; locks/unique indexes | final-slot race; one leader/group/claim | P3 |
| GRP-007–GRP-009 | PRD §5; D-039–D-040 | Invite classmates and invitation detail | send/cancel/accept/decline; transfer leader | group_invitations; leader/member/capacity policies | accept race, capacity, eligibility, consent | P4 |
| GRP-010 | PRD §5; D-041 | Refreshing/reconnecting group board | private class signal | authorized channel plus authoritative query | foreground/network/Realtime refetch | P3 |
| MGT-001–MGT-002 | PRD §7; D-042, D-047 | Teacher group board, create group | teacher group read/create | class/group teacher RLS; absolute maximum | cross-class and maximum tests | P5 |
| MGT-003–MGT-006 | PRD §7; D-040, D-042, D-045, D-059 | Move, successor, approve/lock/reset flows | move/transfer/approve/lock/reset RPCs | membership/history/claims; atomic validation | leader, capacity, active-session, audit | P5 |
| MGT-007–MGT-009 | PRD §7; D-044 | Delete/archive confirmation | delete-or-archive plus notification/signal | groups, invitations, session history, events | delete vs archive and affected-user updates | P5 |
| SES-001–SES-003 | PRD §§3, 7; D-002, D-043 | Activity builder, session setup | activity/session create/open | activities, geometry, sessions, participants; teacher RLS | geometry and snapshot preservation | P6 |
| SES-004–SES-007 | PRD §§9, 15; D-003–D-004, D-056 | Queue, active controls, waiting/paused field shell | activate/pause/resume/group/session complete RPCs | session_groups; partial unique active index | activation race and state transition tests | P7 |
| SES-008–SES-010 | PRD §15; D-006, D-054 | Teacher live map | private Presence/Broadcast and durable sample event | session authorization; private live-location data | channel isolation and publish-stop | P7 |
| OBS-001–OBS-004 | PRD §§9–10; D-001, D-019–D-020, D-051 | Start observation and GPS states | idempotent observation start | observations/status/events; owner/participant RLS | ownership, active state, GPS, retry | P8 |
| OBS-005–OBS-008 | PRD §16; D-021 | Camera/gallery, processing/upload | media create/delete/upload authorization | observation_media and private Storage policies | limits, transform, idempotency, access denial | P9 |
| OBS-009–OBS-011 | PRD §17; D-052 | Sync/retry/conflict/recovered draft | offline reconciliation and version precondition | IndexedDB queue plus observation version | airplane recovery, single sync, conflict | P8 and P14 |
| AI-001–AI-003 | PRD §§9, 13; D-007, D-011 | Analyze action and queued state | analyze endpoint, queue message, Edge Function | ai_analysis_runs; owner eligibility/worker grants | request idempotency and secret boundary | P10 |
| AI-004–AI-006 | D-008, D-010, D-015 | Analysis detail/provenance where permitted | provider adapter and schema-version parser | AI runs/results/raw reference; separate evidence layers | malformed output and provenance tests | P10 |
| AI-007–AI-010 | PRD §13; D-009, D-012 | Confidence, retry, failed/manual states | bounded retry/dead-letter/manual retry | run state/events; minimal provider context | retry, draft preservation, no live-location leak | P10 |
| REV-001–REV-003 | PRD §§10, 12; D-013–D-015 | Candidate/manual entry, traits, submit review | student review and submit | trait verification and immutable submissions; owner RLS | required fields, `Unknown`, immutability | P11 |
| REV-004–REV-006 | PRD §14; D-022–D-025 | Same-species warning/related items | related query, acknowledgement, teacher relationship action | relation/tag/history and notification | warning permits submit; no auto-merge/distance-only | P11 |
| REV-007–REV-009 | PRD §§10–11; D-016–D-017, D-057 | Teacher review and student revision | review/resubmit with version preconditions | immutable reviews/status/submissions; teacher/owner RLS | all decisions, field locks, history, conflict | P12 |
| REV-010–REV-012 | D-048–D-049, D-052 | Unlock request and issue report | unlock request/grant; report | revision topics, requests, reports; identity/rate-limit rules | authorization, anonymity, 24h rate limit | P12 |
| MAP-001–MAP-003 | PRD §§11, 15; D-018, D-026, D-053 | Complete action and status markers | complete session; map read model | session/status/observation queries; teacher RLS | manual completion, draft exclusion, token coverage | P13 |
| MAP-004–MAP-006 | PRD §15; D-027, D-055 | Completed map and plant detail | session map and observation detail | session participants/class teachers; Storage auth | teacher/participant/non-participant isolation | P13 |
| MAP-007–MAP-011 | PRD §18; D-028–D-029, D-046 | Export entry/status/download | CSV/GeoJSON and queued export events | export jobs/artifacts/research events/retention controls | schema, idempotency, reauth, privacy, retention | P14 |
| ADM-001–ADM-003 | PRD §2 Admin; D-062–D-063 | Admin shell, schools, teacher invitation, user directory | admin auth/users/schools/teacher-invitation contracts | platform_admins, schools, memberships, teacher_invitations | grant/revoke, MFA, provisioning, non-admin denial | P1 and P15 |
| ADM-004–ADM-007 | D-063; NFR/operations | Audit/error explorers and flow-health dashboard | admin audit/errors/flow-health reads | audit_logs, operational_error_events, provider metrics; protected read models | redaction, bounded filters, correlation, partial source | P0 and P15 |
| ADM-008–ADM-012 | D-063–D-064 | Incidents, notes, scoped break-glass | acknowledge/note/break-glass contracts | incidents/notes/admin access audit; retention | append-only, cursor/range, expiry/scope/MFA | P15 |

## Cross-cutting verification suites

| Suite | Covers | Minimum evidence |
|---|---|---|
| RLS and authorization | All modules | At least two users, classes, groups, and sessions; positive and negative operations |
| Concurrency | GRP, MGT, SES, OBS, REV | Parallel transactions for final slot, invitation capacity, leadership, active group, and versions |
| Realtime recovery | NOT, GRP, SES | Initial fetch, private signal, authoritative refetch, reconnect, foreground |
| Offline/idempotency | OBS, AI, MAP | Duplicate delivery/retry, browser restart, airplane-mode reconciliation |
| Privacy and secrets | AUTH, SES, OBS, AI, MAP | Bundle inspection, private channels/buckets, signed access, data minimization |
| Accessibility/mobile | All user-facing modules | 360/390/430 px student flows, keyboard teacher flows, non-color status cues |
| End-to-end MVP | All modules | The acceptance scenarios in `PRODUCT_REQUIREMENTS.md` §19 |
| Operations/redaction | ADM and all emitting modules | Flow/error correlation, low-cardinality metrics, redacted logs, admin-access audit, retention |
