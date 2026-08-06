# Build Roadmap and Verification Checklist

## Current baseline

- Product, architecture, database, API, decision, module, and design specifications exist.
- The pinned Next.js/Supabase foundation is implemented locally.
- The CLI is linked to the dedicated hosted project `rhntelxdmuvldrxyceqx`.
- Phase 1 identity and provisioning foundations are in progress; the first
  migration is deployed to the linked hosted development project.

## How to use this roadmap

- A checked item means its implementation and required verification evidence both exist.
- Follow the build workflow in `../AGENTS.md` and use the evidence template in `TEST_STRATEGY.md`.
- Record the pull request or commit and exact test command beside a checked item.
- Use `Status: in progress` or `Status: blocked — <reason>` beneath an unchecked item when needed.
- Work phase-by-phase unless a dependency is explicitly satisfied earlier.
- Update `TRACEABILITY_MATRIX.md` when a requirement, contract, screen, table, or test location changes.

## Global release gates

- [ ] **GATE-01 — Safety and authorization:** RLS is enabled on every exposed table; policies and privileged functions pass cross-user, cross-class, and cross-session tests.
- [ ] **GATE-02 — Data integrity:** Required uniqueness, partial indexes, foreign keys, checks, immutable histories, and atomic RPC behavior are tested.
- [ ] **GATE-03 — Secrets and privacy:** Browser bundles contain no service-role, Gemini, or other secret keys; Storage and Realtime are private; retention decisions are applied.
- [ ] **GATE-04 — Resilience:** Loading, empty, offline, retry, reconnect, permission-denied, stale-data, and concurrency-conflict states work in critical journeys.
- [ ] **GATE-05 — Accessibility and mobile:** Student flows work at 360–430 px in modern mobile Safari/Chrome; teacher workflows work on mobile and desktop; status never relies on color alone.
- [ ] **GATE-06 — Quality:** Format, lint, strict typecheck, unit/integration tests, Playwright tests, and production build pass in CI.
- [ ] **GATE-07 — Documentation:** Decisions, module specs, generated database types, migration notes, roadmap evidence, and traceability are current.
- [ ] **GATE-08 — Operations:** SLO dashboards, redacted logs/traces, alert ownership/runbooks, backup/restore evidence, and retention jobs are verified.

## Phase 0 — Foundation

- [x] **P0-01:** Scaffold pinned Next.js App Router and TypeScript strict-mode application; commit lockfile.
- [x] **P0-02:** Configure Tailwind CSS, shadcn/ui, formatting, linting, Vitest, and Playwright.
- [x] **P0-03:** Establish `src/features`, server/client boundaries, shared Zod schemas, stable error envelope, and request IDs.
- [x] **P0-04:** Configure validated server/browser environment variables and Supabase clients without exposing secrets.
- [x] **P0-05:** Initialize/link the dedicated Supabase project and local migration workflow.
- [x] **P0-06:** Add CI for format/lint, typecheck, tests, and build.
- [x] **P0-07:** Add append-only event interface and baseline observability/redaction conventions.
- [x] **P0-08:** Configure request/trace correlation, release/environment metadata, RED/queue metrics, and redaction tests required by ADM.
- [ ] **P0-09:** Document and validate custom SMTP, allowlisted Auth redirects, local Mailpit, publishable/secret key boundaries, and environment matrix.
- [ ] **P0-EXIT:** Local and CI builds pass; environment boundaries are documented and verified.

Status: P0-01 through P0-08 are implemented and verified locally and in hosted
CI as of 2026-08-06. P0-09 and P0-EXIT remain open for environment-owner custom
SMTP and deployed redirect verification.

Evidence:
- Requirements: Phase 0 engineering foundation; no product requirement behavior shipped.
- Implementation: `package.json`, `src/app`, `src/features`, `src/lib/env`,
  `src/lib/supabase`, `src/lib/http`, `src/lib/events`,
  `src/lib/observability`, `supabase/config.toml`,
  `.github/workflows/ci.yml`.
- Tests: `src/**/*.test.ts(x)`, `tests/e2e/foundation.spec.ts`.
- Commands: `npm run format:check`; `npm run lint`;
  `npm run typecheck`; `npm test`; `npm run build`;
  `npm run test:e2e`;
  `npx supabase db query --local <read-only verification>`;
  `npx supabase db advisors --local --type all --level warn --fail-on error`.
- Manual checks: local Supabase PostgreSQL 17.6 answered queries; Auth had zero
  synthetic users; no application tables exist before Phase 1; advisors
  reported no issues; responsive smoke passed at 360 px, 390 px, and 1440 px.
- Migration: not applicable; Phase 0 introduces no application schema.
- Advisors: local security/performance advisors reported no issues.
- Commit: `3419dd0` (`Implement app foundation and verified authentication`),
  pushed directly to `origin/main` on 2026-08-05; no PR was requested.
- CI fixes: `1d5a480` (`Pin npm 11 in CI`) and `92bffbc`
  (`Run Auth smoke against local Supabase in CI`).
- Hosted CI: run
  `31029729582` passed `quality`, `database`, and `browser-smoke` on 2026-08-06;
  https://github.com/ninjanoppawut/AI-Escort-Application/actions/runs/31029729582.
- Remaining risk: the hosted project is linked, healthy, empty before Phase 1,
  and uses modern publishable/secret keys with legacy keys disabled. Production
  custom SMTP and allowlisted deployment redirects still require
  environment-owner configuration and verification.

## Phase 1 — Authentication, classes, invitations, and RBAC

Requirements: `AUTH-001`–`AUTH-012` and provisioning foundations for `ADM-001`–`ADM-003`.

- [ ] **P1-01:** Implement verified email/password signup, PKCE confirmation, sign-in/out, resend, reset, profile bootstrap, and server-side claim validation.

Status: implemented locally and verified in hosted CI as of 2026-08-06. Keep
this item unchecked until environment-owner evidence for custom SMTP and
deployed Auth redirect allowlists exists. No hosted Auth setting, external
email, hosted user, or hosted migration was changed for this slice.

Evidence to date:
- Requirements: `AUTH-001`, `AUTH-009`-`AUTH-012` (student/default-account and
  SSR portions; trusted teacher provisioning remains under P1-02A/P1-07).
- Implementation: `src/features/auth`, `src/lib/supabase`, `src/proxy.ts`,
  `src/app/api/auth`, `src/app/auth`, `src/app/api/me/route.ts`, and
  `src/app/app/page.tsx`; canonical PKCE callback is
  `GET /api/auth/callback`, with `/auth/callback` retained as a compatibility
  alias for already-issued local links.
- Database/profile bootstrap: existing migration
  `supabase/migrations/20260805083021_phase1_identity_foundation.sql`; no schema
  change was needed, so generated database types did not change.
- Tests: `src/features/auth/**/*.test.ts(x)`,
  `src/lib/supabase/config.test.ts`,
  `supabase/tests/phase1_identity_foundation_test.sql`, and
  `tests/e2e/auth.spec.ts` cover strict no-role signup, safe redirects, stable
  errors, signed claims, inactive/unauthorized profile denial, unconfirmed
  sign-in, resend, confirmation/profile bootstrap, sign-out, recovery/password
  update, expired callbacks, Mailpit delivery, and mobile overflow.
- Focused commands: `npm test -- src/features/auth`;
  `npm run test:e2e -- tests/e2e/auth.spec.ts --project=student-mobile-chromium`
  with local publishable configuration (`2 passed`).
- Database commands:
  `npx supabase test db supabase/tests/phase1_identity_foundation_test.sql --local`
  (`26` assertions); `npx supabase db lint --local --schema public,private --level warning --fail-on error`;
  `npx supabase db advisors --local --type all --level warn --fail-on error`
  (no issues).
- Full commands: `npm run check` (format, lint, strict typecheck, `35` tests,
  and production build passed); full `npm run test:e2e` across six configured
  projects (`25 passed`, `5` expected stateful-flow skips) passed. The local
  pgTAP, lint, advisors, and Playwright commands were rerun together after the
  Auth journey had created local users, proving the database test is isolated
  from persistent local E2E fixtures.
- Security check: no forbidden secret identifiers were found in `.next/static`;
  only a local Supabase publishable key was used by Playwright.
- Commit: `3419dd0` (`Implement app foundation and verified authentication`),
  pushed directly to `origin/main` on 2026-08-05; no PR was requested.
- Hosted CI: `92bffbc` made browser smoke self-contained with local
  Supabase/Mailpit; run `31029729582` passed the Auth journey plus quality,
  database tests, advisors, generated-type verification, and production build.
- Remaining risk: hosted custom SMTP, deployed redirect allowlists, CAPTCHA/rate
  policy, and staging email delivery still need environment-owner
  configuration/verification.

- [x] **P1-02:** Add class, membership, and invite migrations with RLS and generated types.

P1-02 status: complete and verified on the isolated local Supabase stack as of
2026-08-06. The slice establishes the relational and authorization foundation
only; teacher mutation RPCs/UI remain P1-03, atomic invitation consumption
remains P1-04, and class/member UI remains P1-05.

Evidence:
- Requirements: database foundations for `AUTH-002`–`AUTH-007` and class-boundary
  enforcement for `AUTH-009`–`AUTH-011`; decisions D-030, D-031, D-033, D-047,
  D-059, D-061, and D-062.
- Migration: `supabase/migrations/20260805224248_phase1_class_foundation.sql`,
  created with `npx supabase migration new phase1_class_foundation` and applied
  only to the isolated local stack. No hosted migration or configuration changed.
- Schema: `classes`, `class_members`, and `class_invites` with documented class
  settings, lifecycle/role/count/time constraints, unique membership and invite
  secrets, indexed foreign keys and RLS columns, and trusted actor-validation
  triggers. Invitation token hashes are not granted to browser roles.
- Authorization: RLS is enabled on every new exposed table; class reads are
  membership-authoritative, member visibility is role-appropriate, invitation
  visibility is teacher-only, and browser writes are denied pending P1-03/P1-04
  trusted operations. No user-editable Auth metadata is used for authorization.
- Database tests: `supabase/tests/phase1_class_foundation_test.sql` passes 46
  pgTAP assertions for positive/negative RLS, cross-class denial,
  inactive/unconfirmed denial and recovery, role escalation, invalid/duplicate
  membership, invitation visibility/expiry/revocation/capacity, token
  non-disclosure, grants, indexes, and helper hardening. The full local database
  suite passes 72 assertions.
- Concurrency: `supabase/tests/phase1_class_foundation_concurrency.ps1`, with SQL
  fixtures under `supabase/test-support`, proves two concurrent inserts for the
  same class/user produce one membership and one SQLSTATE `23505` race loser.
- Database commands: `npx supabase db reset --local`;
  `npx supabase test db supabase/tests/phase1_class_foundation_test.sql --local`;
  `npx supabase test db --local`;
  `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/phase1_class_foundation_concurrency.ps1`;
  `npx supabase db lint --local --schema public,private --level warning --fail-on error`;
  `npx supabase db advisors --local --type all --level warn --fail-on error`.
- Generated types: `npx supabase gen types --local --schema public` regenerated
  `src/lib/supabase/database.types.ts`; an independently generated and formatted
  copy matched it at SHA-256
  `68C7BFEE5E77F74FD0AB75924285686BCDA88A153F6B4EACE76D6AC9394DD8C2`.
- Repository quality: `npm run check` passed formatting, ESLint, strict
  TypeScript, all 35 Vitest tests, and the production build.
- Browser smoke: `npx playwright test tests/e2e/foundation.spec.ts --project=student-mobile-chromium --workers=1`
  passed 3 tests; the same scoped command for `tests/e2e/auth.spec.ts` with
  `--grep 'auth screens are mobile-safe'` passed 1 test.
- Commit/PR: none created; this work remains uncommitted as requested.
- Remaining delivery boundary: hosted migration requires explicit approval;
  P1-03/P1-04 must add authorized mutations, audit/research events, invitation
  consumption, replay/idempotency, and their operation-level tests.

- [x] **P1-02A:** Add profile, school membership, platform-admin, and teacher-invitation migrations with trusted provisioning operations.

P1-02A status: complete and verified on the isolated local Supabase stack as of
2026-08-06. The slice completes the trusted platform-admin and
teacher-invitation provisioning boundary only; admin UI/read models remain P15,
class creation remains P1-03, and student class-invitation consumption remains
P1-04. No hosted migration, hosted Auth setting, external email, commit, push,
or PR action was performed.

Evidence:
- Requirements: `AUTH-001`, `AUTH-009`–`AUTH-011`, and provisioning foundations
  for `ADM-001`–`ADM-003`.
- Existing foundation implementation:
  `supabase/migrations/20260805083021_phase1_identity_foundation.sql`;
  `src/lib/supabase/database.types.ts`.
- Migration:
  `supabase/migrations/20260806035312_phase1_trusted_provisioning.sql`.
  It adds `audit_logs` and `research_events`, private validation/hash/audit
  helpers, and public `grant_platform_admin`, `revoke_platform_admin`,
  `issue_teacher_invitation`, `revoke_teacher_invitation`,
  `preview_teacher_invitation`, and `consume_teacher_invitation` RPCs. Browser
  table writes remain ungranted; invitation tokens are generated by PostgreSQL
  and stored only as hashes. Privileged functions are security definers with
  fixed empty `search_path` and minimal execute grants.
- Focused database tests:
  `supabase/tests/phase1_trusted_provisioning_test.sql` passed 48 pgTAP
  assertions for non-admin/MFA denial, role escalation denial, admin
  grant/revoke, invitation token non-disclosure, issue/preview/revoke/consume,
  email mismatch, expiry, inactive/unconfirmed accounts, archived school,
  replay, rollback, grants, fixed search paths, and foreign-key indexes.
- Concurrency: `supabase/tests/phase1_trusted_provisioning_concurrency.ps1`,
  with SQL fixtures under `supabase/test-support`, passed with one successful
  consume, one replay denial, one accepted invitation, one teacher school
  membership, and one `teacher_invitation_consumed` research event.
- Existing tests: `supabase/tests/phase1_identity_foundation_test.sql` (26 pgTAP
  assertions covering RLS, role escalation, confirmation, MFA, constraints,
  privileges, indexes, and fixed-search-path privileged functions).
- Full database suite: `supabase test db --local` passed 120 pgTAP assertions
  across identity, class foundation, and trusted provisioning. The existing
  P1-02 duplicate-membership concurrency harness still passed with one insert,
  one SQLSTATE `23505`, and one final row.
- Commands: `supabase db reset --local`;
  `supabase test db supabase/tests/phase1_trusted_provisioning_test.sql --local`;
  `supabase test db --local`;
  `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/phase1_trusted_provisioning_concurrency.ps1`;
  `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/phase1_class_foundation_concurrency.ps1`;
  `supabase db lint --local --schema public,private --level warning --fail-on error`;
  `supabase db advisors --local --type all --level warn --fail-on error`.
- Migration: `20260805083021`; applied to the isolated local stack and linked
  hosted development project `rhntelxdmuvldrxyceqx` on 2026-08-05.
- Migration: `20260806035312`; created with the installed Supabase CLI and
  applied only to the isolated local stack. Hosted application requires explicit
  approval before this migration is applied.
- Advisors: local security/performance advisors reported no issues; hosted
  advisors were not run for the new migration because it was not applied hosted.
- Hosted verification: migration history matches local; all five public tables
  have RLS enabled; the Auth profile-sync trigger and fixed-empty-search-path
  private functions exist; hosted schema types match local types after ignoring
  hosted PostgREST-version metadata.
- Generated types: `supabase gen types --local --schema public` regenerated
  `src/lib/supabase/database.types.ts`; an independently generated and formatted
  second copy matched it at SHA-256
  `877F2C88112127C5DC4B53A8EA2E5DCE96DE98CF88EB99306242361FDD42CAE0`.
- Repository quality: `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test` (35 Vitest tests), `npm run build`, and the
  canonical `npm run check` passed.
- Browser smoke: `npx playwright test tests/e2e/foundation.spec.ts --project=student-mobile-chromium --workers=1`
  passed 3 tests; `npx playwright test tests/e2e/auth.spec.ts --project=student-mobile-chromium --grep "auth screens are mobile-safe" --workers=1`
  passed 1 test. A parallel attempt at both Playwright commands failed only
  because both web servers tried to bind port 3000.
- Operational note: Docker Desktop was restarted locally after disk pressure and
  hung Docker clients; repo-local `node_modules` was temporarily moved to D: to
  free C: space, then restored inside the workspace because Next/Turbopack
  rejects an out-of-root junction.
- Commit/PR: none created; this work remains uncommitted as requested.
- Remaining risks: hosted migration requires explicit approval; P1-01 remains
  unchecked for environment-owner SMTP/redirect/CAPTCHA/staging-email gates; P15
  must still add admin UI/read models and P1-03/P1-04 must add class mutation and
  student class-invitation consumption flows.

- [ ] **P1-03:** Implement class creation/settings and code/link/QR invitation management.
- [ ] **P1-04:** Implement atomic invitation consumption and student membership creation.
- [ ] **P1-05:** Build teacher/student class and member-list states.
- [ ] **P1-06:** Pass multi-user/class RLS, role-escalation, invite-idempotency, and Playwright join tests.
- [ ] **P1-07:** Pass email confirmation/recovery, invalid callback, teacher-provisioning, admin grant/revoke, and admin-MFA authorization tests.
- [ ] **P1-EXIT:** An admin-provisioned teacher creates a class and a verified-email student joins through code/link/QR without cross-class access.

## Phase 2 — Durable notifications

Requirements: `NOT-001`–`NOT-007`.

- [ ] **P2-01:** Add notification schema, type registry, RLS, indexes, and event-producer interface.
- [ ] **P2-02:** Implement list, unread count, mark-one/all-read, and authorized deep links.
- [ ] **P2-03:** Implement private signal channel and authoritative refetch triggers.
- [ ] **P2-04:** Build all required layouts and empty/offline/stale/deleted-target states.
- [ ] **P2-05:** Pass recipient-isolation, persistence, signal/refetch, and deep-link tests.
- [ ] **P2-EXIT:** Notifications survive restart and only the recipient can read or mutate them.

## Phase 3 — Atomic student group creation

Requirements: `GRP-001`–`GRP-006`, `GRP-010`.

- [ ] **P3-01:** Add group, membership, leader, creation-claim, and history constraints/migrations.
- [ ] **P3-02:** Implement and secure atomic `create_student_group`.
- [ ] **P3-03:** Build group board and explanatory create-group availability states.
- [ ] **P3-04:** Implement private class-group invalidation and refetch lifecycle.
- [ ] **P3-05:** Pass final-slot race, one-leader, one-group, creation-claim, RLS, and Realtime tests.
- [ ] **P3-EXIT:** Two students racing for the last slot produce exactly one success and immediate authoritative UI refresh.

## Phase 4 — Invitations and leadership

Requirements: `GRP-007`–`GRP-009` plus relevant NOT requirements.

- [ ] **P4-01:** Add group invitation schema, expiry/status rules, RLS, and history.
- [ ] **P4-02:** Implement eligible-classmate search and send/cancel actions for the current leader.
- [ ] **P4-03:** Implement atomic accept/decline with capacity and membership revalidation.
- [ ] **P4-04:** Implement readiness and atomic leadership transfer.
- [ ] **P4-05:** Deliver invitation/group notifications and handle stale/race states.
- [ ] **P4-06:** Pass invitation acceptance race, capacity, one-leader, and one-group tests.
- [ ] **P4-EXIT:** Consent-based invitation and transfer flows cannot violate membership or leadership invariants.

## Phase 5 — Teacher group management

Requirements: `MGT-001`–`MGT-009`.

- [ ] **P5-01:** Build group/unassigned-student board and manual group creation within the absolute limit.
- [ ] **P5-02:** Implement atomic member move/remove with successor selection.
- [ ] **P5-03:** Implement approve, lock/unlock, leader change, and audited creation-claim reset.
- [ ] **P5-04:** Implement delete-unused versus archive-historical behavior and invitation cancellation.
- [ ] **P5-05:** Emit histories, events, notifications, and Realtime invalidation after commit.
- [ ] **P5-06:** Pass capacity, cross-class, leader, active-session, delete/archive, and concurrency tests.
- [ ] **P5-EXIT:** Teachers reorganize groups without corrupting current invariants or session history.

## Phase 6 — Activities, geometry, and snapshots

Requirements: `SES-001`–`SES-003`.

- [ ] **P6-01:** Add PostGIS extension/migrations and activity, geometry, session, and participant-snapshot schema/RLS.
- [ ] **P6-02:** Implement activity and geometry authoring with Zod/PostGIS validation.
- [ ] **P6-03:** Implement session creation/open with an immutable membership/leadership snapshot.
- [ ] **P6-04:** Build activity/session setup flows and invalid-geometry/failure states.
- [ ] **P6-05:** Pass geometry, authorization, and snapshot-preservation tests.
- [ ] **P6-EXIT:** Later group changes cannot alter an opened session's participant history.

## Phase 7 — Session control and live map

Requirements: `SES-004`–`SES-010`.

- [ ] **P7-01:** Add session-group state constraints and partial unique index for one active group.
- [ ] **P7-02:** Implement secure open/activate/pause/resume/group-complete/session-complete operations.
- [ ] **P7-03:** Implement private Presence/Broadcast authorization and location lifecycle.
- [ ] **P7-04:** Build student waiting/field shells and teacher queue/live-map controls.
- [ ] **P7-05:** Add location freshness/accuracy, offline/reconnect, and activation-race states.
- [ ] **P7-06:** Pass active-group concurrency, channel isolation, publish-stop, and map tests.
- [ ] **P7-EXIT:** Exactly one group is active and only the teacher can see named live locations.

## Phase 8 — Observation foundation

Requirements: `OBS-001`–`OBS-004`, `OBS-011`.

- [ ] **P8-01:** Add observation/status/event schema, ownership RLS, and optimistic versioning.
- [ ] **P8-02:** Implement idempotent observation start against the participant snapshot and active group.
- [ ] **P8-03:** Implement capture location/time/accuracy and explicit missing-location handling.
- [ ] **P8-04:** Build private draft, GPS warning/retry, conflict, and permission states.
- [ ] **P8-05:** Pass ownership, activity-state, idempotency, GPS, and version-conflict tests.
- [ ] **P8-EXIT:** One student owns a recoverable private draft with authoritative capture metadata.

## Phase 9 — Image and Storage pipeline

Requirements: `OBS-005`–`OBS-008`.

- [ ] **P9-01:** Add observation-media schema and private bucket/path policies.
- [ ] **P9-02:** Implement orientation correction, resize, compression, preview, and category validation.
- [ ] **P9-03:** Implement deterministic upload/delete/retry and authorized image presentation.
- [ ] **P9-04:** Build camera/gallery, progress, retry, and permission states.
- [ ] **P9-05:** Pass count/category/dimension/size, idempotency, and cross-user Storage tests.
- [ ] **P9-EXIT:** Valid media uploads reliably and unauthorized image access is denied.

## Phase 10 — Durable Gemini analysis

Requirements: `AI-001`–`AI-010`.

- [ ] **P10-01:** Finalize/version the normalized AI schema and provider contract.
- [ ] **P10-01A:** Build the versioned evaluation dataset/harness and meet the quality, uncertainty, privacy, robustness, latency, and rollback gates in `AI_EVALUATION.md`.
- [ ] **P10-02:** Add AI run/result schema, queue contract, and least-privilege policies.
- [ ] **P10-03:** Implement Gemini server adapter and authenticated Edge Function consumer.
- [ ] **P10-04:** Implement bounded retry, idempotency, invalid-response, dead-letter, and manual retry paths.
- [ ] **P10-05:** Build queued/running/failed/succeeded and manual-entry UI states.
- [ ] **P10-06:** Pass queue duplication, schema validation, failure preservation, secret-boundary, and reconnect tests.
- [ ] **P10-EXIT:** Browser closure/provider failure cannot lose or block the draft.

## Phase 11 — Student verification and submission

Requirements: `REV-001`–`REV-006`.

- [ ] **P11-01:** Add trait verification, immutable submission, relation/tag, and history schema/RLS.
- [ ] **P11-02:** Build candidate selection, manual entry, trait checks/corrections, and evidence form.
- [ ] **P11-03:** Implement submit with required fields, optimistic concurrency, and immutable versioning.
- [ ] **P11-04:** Implement same-species warning/acknowledgement/tag/teacher notification.
- [ ] **P11-05:** Implement teacher-only candidate relationship confirmation without auto-merge.
- [ ] **P11-06:** Pass validation, history, same-species, dedupe-safety, and submission concurrency tests.
- [ ] **P11-EXIT:** Students submit evidence without treating AI or dedupe signals as authority.

## Phase 12 — Teacher review and revision

Requirements: `REV-007`–`REV-012`.

- [ ] **P12-01:** Add review, revision-topic, unlock-request, issue-report, and status-history schema/RLS.
- [ ] **P12-02:** Build teacher queue/map detail with all evidence layers and accessible status actions.
- [ ] **P12-03:** Implement immutable review decisions with submission-version preconditions.
- [ ] **P12-04:** Implement targeted revision, additional-topic request/approval, and same-observation resubmit.
- [ ] **P12-05:** Implement anonymous-to-owner issue reporting and 24-hour rate limit.
- [ ] **P12-06:** Deliver owner notifications and pass history, field-lock, anonymity, rate-limit, and concurrency tests.
- [ ] **P12-EXIT:** Teacher decisions and student revisions never overwrite prior evidence.

## Phase 13 — Completed activity map

Requirements: `MAP-001`–`MAP-006`, `MAP-009`.

- [ ] **P13-01:** Implement manual completion and completed-map read model.
- [ ] **P13-02:** Build teacher/participant maps, filtering, accessible markers, and map-context plant detail.
- [ ] **P13-03:** Enforce participant/teacher visibility and private image access.
- [ ] **P13-04:** Exclude drafts and raw historical live locations.
- [ ] **P13-05:** Pass role isolation, marker location/status, detail, and non-disclosure tests.
- [ ] **P13-EXIT:** Authorized roles can review the completed plant map without receiving private tracking history.

## Phase 14 — Offline hardening, exports, and retention

Requirements: `OBS-009`–`OBS-010`, `MAP-007`–`MAP-011`.

- [ ] **P14-01:** Implement IndexedDB draft/media/event retry queues and deterministic reconciliation.
- [ ] **P14-02:** Build conflict/retry/sync visibility and verify airplane-mode recovery.
- [ ] **P14-03:** Implement authorized CSV/GeoJSON exports with stable schemas.
- [ ] **P14-04:** Implement idempotent queued large exports, notification delivery, expiry, and download reauthorization.
- [ ] **P14-05:** Apply accepted consent, retention, anonymization, and deletion policies by data category.
- [ ] **P14-05A:** Implement the versioned event registry and study-scoped pseudonymous export allowlist from `RESEARCH_EVENT_DICTIONARY.md`.
- [ ] **P14-06:** Pass offline single-sync, export authorization/schema, retention, and privacy tests.
- [ ] **P14-EXIT:** Offline drafts synchronize once and authorized reviewed/research data exports safely.

## Phase 15 — Platform admin operations

Requirements: `ADM-001`–`ADM-012`.

- [ ] **P15-01:** Build protected admin shell with active relational grant and MFA enforcement.
- [ ] **P15-02:** Build school provisioning, teacher invitation, and teacher/student directory with cursor pagination.
- [ ] **P15-03:** Build redacted flow-health dashboard for APIs, uploads, Realtime, queues, and Gemini.
- [ ] **P15-04:** Build audit/error explorers with bounded filters, correlation IDs, freshness, and partial-telemetry states.
- [ ] **P15-05:** Build incident acknowledgement and append-only notes.
- [ ] **P15-06:** Implement time-bounded scoped break-glass workflow only if approved for the deployment.
- [ ] **P15-07:** Pass non-admin denial, MFA, redaction, pagination/range, audit, revocation, and partial-source tests.
- [ ] **P15-EXIT:** Admin can diagnose which flow/stage is failing without routine access to prohibited sensitive content.

## Pilot blockers requiring owner decisions or approval

These do not block early implementation, but they block a production/pilot release:

- [ ] **DEC-Q001:** Confirm student age and school/guardian consent requirements.
- [ ] **DEC-Q002:** School/privacy owner approves or shortens the default retention schedule in `PRIVACY_RETENTION_AND_RESEARCH.md`.
- [ ] **DEC-Q003:** Approve the Gemini model and per-user/session limits within the documented quality, latency, and total pilot budget gates.
- [ ] **DEC-Q004:** Select the authoritative taxonomy normalization source.
- [ ] **DEC-Q005:** Finalize research variables, instruments, and anonymized export fields.
- [ ] **DEC-Q006:** Assign ownership for Supabase, deployment, Mapbox, Gemini, privacy, and support.
