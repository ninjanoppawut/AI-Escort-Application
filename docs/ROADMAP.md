# Build Roadmap and Verification Checklist

## Current baseline

- Product, architecture, database, API, decision, module, and design specifications exist.
- The pinned Next.js/Supabase foundation is implemented locally.
- The CLI is linked to the dedicated hosted project `rhntelxdmuvldrxyceqx`.
- Phases 1–7 and P8-01 to P8-03 are verified locally and in hosted CI except
  the owner-blocked P0-09, P0-EXIT, and P1-01; only
  the first identity migration is deployed to the linked hosted development
  project (later migrations await owner approval).

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

Status: blocked — P0-09 and P0-EXIT need hosted Supabase and deployment
account access for custom SMTP, redirect allowlists, and staging email
evidence; tracked in `OWNER_QUESTIONS_PENDING.md` (2026-09-12).

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

Status: blocked — hosted custom SMTP, deployed redirect allowlists, and
CAPTCHA/rate policy need environment-owner access; tracked in
`OWNER_QUESTIONS_PENDING.md` (2026-09-12).

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

- [x] **P1-03:** Implement class creation/settings and code/link/QR invitation management.

P1-03 status: complete and verified on the isolated local Supabase stack as of
2026-08-06. The slice implements trusted teacher class creation, class group
settings updates, and class invitation issue/disable/rotate with one-time
link/QR display. Student invitation consumption and membership creation remain
P1-04. No hosted migration, hosted Auth setting, external email, commit, push,
or PR action was performed.

Evidence:

- Requirements: `AUTH-002`, `AUTH-003`, and class/invitation event coverage for
  `AUTH-008`; `AUTH-004` remains P1-04.
- Migration: `supabase/migrations/20260806062357_phase1_class_operations.sql`,
  created with `npx supabase migration new phase1_class_operations` and applied
  by `npx supabase db reset --local`.
- Implementation:
  `src/features/classes`, `src/app/api/classes`, `src/app/teacher/classes/page.tsx`,
  `src/app/app/page.tsx`, and generated
  `src/lib/supabase/database.types.ts`.
- Authorization/security: trusted `SECURITY DEFINER` RPCs use fixed empty
  `search_path`, browser table writes remain denied, active confirmed teacher
  school/class membership is required, invite tokens are generated server-side,
  only token hashes are stored, route class/invite mismatches are rejected, and
  research payloads exclude invite codes, raw tokens, token hashes, emails, and
  free text.
- Database tests: `npx supabase test db --local` passed 156 pgTAP assertions.
- Concurrency: `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/phase1_class_operations_concurrency.ps1`
  passed the rotate/disable race with consistent invite state.
- UI/unit tests: `npm test` passed 40 Vitest assertions, including class
  contracts and teacher class-manager invite QR/disable/rotate behavior.
- Browser: local Playwright command with local Supabase env overrides passed
  `tests/e2e/class-management.spec.ts --project=student-mobile-chromium`
  (teacher mobile class/settings/link/QR/disable/rotate workflow and signed-out
  denial).
- Quality gates: `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm run build`, `npx supabase db lint --local --schema public,private --level warning --fail-on error`,
  and `npx supabase db advisors --local --type all --level warn --fail-on error`
  passed. Generated database types match a fresh formatted local generation at
  SHA-256 `E7BEE0F4D5B6B8635C68DC5E23CD2851F84FDEAE2790448582CD0FD7FD7EFA2D`.
  Built client assets under `.next/static` contain no service-role, secret-key,
  Gemini, or invite-token-hash markers.
  `npm run check` was also run after documentation updates.
  The scoped Playwright command uses local Supabase values because `.env.local`
  currently points at the hosted development project.

- [x] **P1-04:** Implement atomic invitation consumption and student membership creation.

P1-04 status: complete and verified on the isolated local Supabase stack as of
2026-08-06. The slice implements student class-join by invite code and opaque
link/QR token only. No hosted migration, hosted Auth setting, external email,
commit, push, or PR action was performed.

Evidence:

- Requirements: `AUTH-004`, class-join coverage for `AUTH-008`, and the
  student side of D-031/D-062.
- Migration: `supabase/migrations/20260806135731_phase1_class_join.sql`,
  created with `npx supabase migration new phase1_class_join` and applied by
  `npx supabase db reset --local`.
- Implementation:
  `public.join_class_with_invite(text,text)`, `public.notifications`,
  `POST /api/classes/join`, `/join`, `/join/[token]`,
  `src/features/classes/components/student-class-joiner.tsx`, class contracts,
  class operation wrappers, and generated
  `src/lib/supabase/database.types.ts`.
- Authorization/security: the browser never supplies role, school ID, class ID,
  user ID, or token hash. The RPC validates active authenticated identity,
  confirmed email, active student account, active class/school, invite status,
  expiry, disabled state, max uses, and existing membership under row locks. It
  creates/reactivates active student school and class memberships atomically,
  increments invite usage only for non-replay joins, and returns idempotent
  `already_joined=true` for replay by an already active student member.
- Events/notifications: successful first joins emit append-only `class_joined`
  audit and research events plus durable `class_joined` and
  `student_joined_class` notification rows. Research payloads exclude invite
  codes, raw tokens, token hashes, emails, and free text.
- Database tests: `npx supabase test db supabase/tests/phase1_class_join_test.sql --local`
  passed 33 pgTAP assertions; `npx supabase test db --local` passed 189
  assertions across the full local DB suite.
- Concurrency: `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/phase1_class_join_concurrency.ps1`
  passed the max-use race with one successful consumer and one `INVITE_INVALID`
  loser.
- UI/unit tests: `npm test` passed 44 Vitest assertions, including join contract
  validation, code normalization, token auto-consumption, failure rendering, and
  replay state.
- Browser: local Playwright command with local Supabase env overrides passed
  `tests/e2e/class-management.spec.ts --project=student-mobile-chromium --grep "student joins class by code and link token"`.
- Quality gates: `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run build`, `npm run check`,
  `npx supabase db lint --local --schema public,private --level warning --fail-on error`,
  and `npx supabase db advisors --local --type all --level warn --fail-on error`
  passed. Generated database types match a fresh local generation at SHA-256
  `0C72777C82F97AAAD596040C5791B0A78E5BD41630E6BC46D25F87354BC0F7B6`.
  Built client assets under `.next/static` contain no service-role, secret-key,
  Gemini, token-hash, or private invitation hash helper markers.
- Remaining delivery boundary: P1-06 still owns broader multi-user/class RLS
  and full phase join regression coverage. Hosted migration requires explicit
  approval.
- [x] **P1-05:** Build teacher/student class and member-list states.

P1-05 status: complete and verified on the isolated local Supabase stack as of
2026-08-06. The slice implements authorized teacher/student class and member
read surfaces only. Group formation mutations and group assignment data remain
later phases; current group is intentionally a null placeholder. No hosted
migration, hosted Auth setting, external email, commit, push, or PR action was
performed.

Evidence:

- Requirements: `AUTH-005`–`AUTH-007`, D-030, D-059, D-060, and class/member
  privacy rules from `UI_CONTRACTS.md`.
- Migration/read models:
  `supabase/migrations/20260806162428_phase1_class_member_read_models.sql`,
  created with `npx supabase migration new phase1_class_member_read_models`.
  It adds `list_authorized_classes()` and
  `list_class_members(uuid,text,text,integer,text,uuid)`, cursor-friendly
  indexes, fixed empty `search_path`, authenticated-only execute grants, and
  null current-group placeholders.
- Implementation:
  `GET /api/classes`, `GET /api/classes/:id/members`,
  `src/features/classes/components/class-member-browser.tsx`, `/app`,
  `/teacher/classes`, `src/features/classes/contracts.ts`, and generated
  `src/lib/supabase/database.types.ts`.
- Authorization/privacy: class/member reads are database membership
  authoritative. Students receive only active authorized classes and active
  student classmates with email omitted. Teachers receive authorized classes and
  permitted member email/join/status/role fields. Browser writes to
  `classes`, `class_members`, and `class_invites` remain denied.
- Tests:
  `supabase/tests/phase1_class_member_read_models_test.sql` passes 24 pgTAP
  assertions for teacher/student visibility, cross-class denial,
  class-not-active denial, email filtering, cursor pagination, function grants,
  function hardening, and browser write denial. Full local database suite
  passes 213 assertions across 6 files.
- UI/contract tests:
  `src/features/classes/contracts.test.ts` and
  `src/features/classes/components/class-member-browser.test.tsx`; full Vitest
  suite passes 48 tests across 18 files.
- Browser: scoped Playwright command with local Supabase overrides
  `npx playwright test tests/e2e/class-management.spec.ts --grep "teacher and student view authorized class member lists"`
  passed 1 test on `student-mobile-chromium`; the other 5 projects were
  intentionally skipped by the test guard.
- Commands passed:
  `npx supabase db reset --local`;
  `npx supabase test db --local`;
  `npx supabase test db --local supabase/tests/phase1_class_member_read_models_test.sql`;
  `npm run format:check`;
  `npm run lint`;
  `npm run typecheck`;
  `npm test`;
  `npm run build`;
  `npm run check`;
  `npx supabase db lint --local --schema public,private --level warning --fail-on error`;
  `npx supabase db advisors --local --type all --level warn --fail-on error`.
- Generated database types match a fresh local generation after formatter
  normalization at SHA-256
  `4A9877FFF17C8AE6DE7CBC65830D0885F821C6B9AA65024DE9FA5FC0ED662878`.
  Built client assets under `.next/static` contain no service-role, secret-key,
  Gemini, token-hash, or private invitation hash helper markers.
- Remaining delivery boundary: P1-06 owns broader multi-user/class RLS,
  role-escalation, invite idempotency, and full phase join regression coverage.
  P1-07 owns confirmation/recovery, invalid callback, teacher provisioning,
  admin grant/revoke, and admin-MFA authorization tests. Hosted migration
  requires explicit approval.
- [x] **P1-06:** Pass multi-user/class RLS, role-escalation, invite-idempotency, and Playwright join tests.

P1-06 status: complete and verified on the isolated local Supabase stack as of
2026-08-07. This slice added broad Phase 1 auth/classes/RBAC regression
coverage only. No schema/RPC contract, hosted migration, hosted Auth setting,
external email, commit, push, or PR action was performed.

Evidence:

- Requirements: regression coverage for `AUTH-004`-`AUTH-007` and
  `AUTH-010`-`AUTH-011`, plus D-030, D-031, D-061, and D-062.
- Implementation:
  `supabase/tests/phase1_auth_classes_rbac_regression_test.sql` and the P1-06
  Playwright case in `tests/e2e/class-management.spec.ts`. No application
  schema, RPC, generated type, API, or UI contract changed.
- Database coverage: 46 focused pgTAP assertions prove RLS is enabled across
  Phase 1 exposed tables, students cannot read or mutate unauthorized profile,
  school, school-membership, class, class-member, class-invite, notification,
  platform-admin, or teacher-provisioning data, raw user metadata cannot grant
  teacher/admin capability, teachers cannot read/manage another school/class,
  browser writes to trusted class/provisioning/notification tables stay denied,
  anon cannot execute Phase 1 class/auth RPCs, and repeated invite code/token
  attempts remain idempotent without duplicate membership, invite usage, audit,
  research, or notification rows.
- Browser coverage: the P1-06 Playwright case signs in local Supabase users,
  joins through an opaque token, replays the invite through `POST
  /api/classes/join`, verifies `already_joined=true` and student role, denies
  `GET /api/classes/:id/members` for a cross-class member read with
  `FORBIDDEN`, hides unauthorized classes on `/app`, and renders the signed-in
  student teacher-route permission-denied state on `/teacher/classes`.
- Commands passed:
  `npx supabase db reset --local`;
  `npx supabase test db supabase/tests/phase1_auth_classes_rbac_regression_test.sql --local`
  (46 assertions);
  `npx supabase test db --local` (259 assertions across 7 files);
  `npm run format:check`;
  `npm run lint`;
  `npm run typecheck`;
  `npm test` (48 Vitest tests);
  `npm run build`;
  `npm run check`;
  `npx playwright test tests/e2e/class-management.spec.ts --project=student-mobile-chromium --grep "student join replay denies cross-class and teacher-route access" --workers=1`
  with local Supabase env overrides and `PLAYWRIGHT_BASE_URL=http://localhost:3001`;
  `npx supabase db lint --local --schema public,private --level warning --fail-on error`;
  `npx supabase db advisors --local --type all --level warn --fail-on error`.
- Advisors: local database lint and security/performance advisors reported no
  issues.
- Generated types: not regenerated because P1-06 made no schema or RPC changes.
- Secret scan: exact marker scan of `.next/static` found no service-role,
  secret-key, Gemini, token-hash, private hash-helper, or Supabase secret key
  markers.
- Remaining delivery boundary: P1-EXIT still owns the full admin-provisioned
  teacher creates class plus verified-email student joins code/link/QR
  scenario.
- [x] **P1-07:** Pass email confirmation/recovery, invalid callback, teacher-provisioning, admin grant/revoke, and admin-MFA authorization tests.

P1-07 status: complete and verified on the isolated local Supabase stack as of
2026-08-07. No hosted migration, hosted Auth setting, external email, commit,
push, or PR action was performed.

Evidence:
- Requirements: `AUTH-001`, `AUTH-009`, `AUTH-010`, `AUTH-011`, `AUTH-012`,
  `ADM-001`-`ADM-003`.
- Implementation/tests: `src/features/auth/recovery.ts`,
  `src/features/auth/server/identity.ts`,
  `src/features/auth/server/identity.test.ts`,
  `tests/e2e/auth.spec.ts`, and
  `supabase/tests/phase1_trusted_provisioning_test.sql`.
- Coverage: recovery password updates now have a pure signed-recovery-claim
  unit test; auth e2e now checks protected `/app` denial before confirmation,
  recovery-link replay denial, and bogus callback-code denial; trusted
  provisioning pgTAP now includes MFA denial for admin and invitation revokes,
  user-editable metadata denial for admin authorization, revoked-admin
  next-check denial, and revoked teacher-invitation preview/consume denial.
- Database commands: `npx supabase start`;
  `npx supabase db reset --local`;
  `npx supabase test db --local` (266 pgTAP assertions across 7 files);
  `npx supabase test db --local supabase/tests/phase1_trusted_provisioning_test.sql`
  (55 assertions);
  `npx supabase db lint --local --schema public,private --level warning --fail-on error`;
  `npx supabase db advisors --local --type all --level warn --fail-on error`.
- Repository quality: `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test` (49 Vitest tests), `npm run build`, and
  `npm run check` passed.
- Browser: `npx playwright test tests/e2e/auth.spec.ts --project=student-mobile-chromium --workers=1`
  passed 2 tests with local Supabase/Mailpit overrides:
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54621`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<fresh local publishable key>`,
  `MAILPIT_URL=http://127.0.0.1:54624`, and
  `PLAYWRIGHT_BASE_URL=http://localhost:3001`.
- Advisors: local database lint and security/performance advisors reported no
  issues.
- Generated types: no schema or RPC contract changed in P1-07. A fresh local
  `npx supabase gen types --local --schema public` generation differed only by
  omitting the existing `graphql_public` schema block; the file was not
  rewritten.
- Secret scan: `.next/static` contained no service-role, Supabase secret,
  Gemini/API-key, token-hash, refresh/access-token, SMTP, SendGrid, or generic
  secret markers.
- Fixes during verification: corrected the trusted-provisioning pgTAP final
  side-effect assertion to read outside authenticated RLS; made slow local
  Playwright auth waits explicit; accepted Supabase's recovery replay hash
  fragment while still requiring the stable `RECOVERY_LINK_INVALID` code; and
  gave one long class-manager interaction test a test-specific timeout.
- Remaining delivery boundary: P1-EXIT still owns the full
  admin-provisioned-teacher creates class plus verified-email student joins
  code/link/QR scenario.
- [x] **P1-EXIT:** An admin-provisioned teacher creates a class and a verified-email student joins through code/link/QR without cross-class access.

P1-EXIT status: complete and verified on the isolated local Supabase stack as
of 2026-08-07. The end-to-end exit scenario now covers platform-admin/trusted
teacher provisioning, denial for an unprovisioned teacher, teacher class
creation, teacher invite code/link token creation with QR-path coverage,
verified-email student joins by code and link token, client role-escalation
denial, cross-class member denial, and replay/idempotent join behavior. No
hosted migration, hosted Auth setting, external email, commit, push, or PR was
performed.

- Verification evidence:
  `npx supabase start` passed locally with Mailpit and local Auth; `npx
  supabase db reset --local` passed; `npx supabase test db --local` passed with
  7 files and 266 pgTAP assertions; `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build`, and `npm run check` passed;
  `npx supabase db lint --local --schema public,private --level warning
  --fail-on error` passed with no schema errors; and `npx supabase db advisors
  --local --type all --level warn --fail-on error` passed with no issues.
- Browser evidence: with local overrides
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54621`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key>`, and
  `MAILPIT_URL=http://127.0.0.1:54624`, `npx playwright test
  tests/e2e/class-management.spec.ts --project=student-mobile-chromium --grep
  "P1-EXIT" --workers=1` passed with 1 test, and `npx playwright test
  tests/e2e/auth.spec.ts --project=student-mobile-chromium --workers=1` passed
  with 2 tests.
- Generated types: `src/lib/supabase/database.types.ts` was refreshed from the
  local database using `npx supabase gen types typescript --db-url
  postgresql://postgres:postgres@127.0.0.1:54622/postgres --schema public
  --schema private`, formatted, and verified to match a fresh formatted local
  generation.
- Secret scan: `.next/static` contained no service-role, Supabase secret,
  Gemini/API-key, token-hash, refresh/access-token, SMTP, SendGrid, or generic
  secret markers.
- Fixes during verification: added the focused P1-EXIT Playwright scenario,
  forced auth/class Playwright contexts online to avoid false offline-state
  submissions, stabilized Vitest on Windows with an isolated single threads
  worker, used webpack for the Next production build to avoid Windows
  Turbopack worker teardown failures, disabled the unused local storage vector
  sidecar to avoid reset health races, and refreshed generated database types
  for the public/private schemas.
- Remaining delivery boundary: Phase 2 starts durable notifications. P1-EXIT
  does not include a notifications center, group formation, platform-admin UI,
  or later read-model UX beyond the Phase 1 auth/classes/RBAC exit path.

## Phase 2 — Durable notifications

Requirements: `NOT-001`–`NOT-007`.

- [x] **P2-01:** Add notification schema, type registry, RLS, indexes, and event-producer interface.

P2-01 status: complete and verified on the isolated local Supabase stack as of
2026-08-12. The slice upgrades the Phase 1 class-join notification table into
the durable notification foundation: database-backed type registry, registry FK,
recipient-scoped RLS, supporting indexes, relational target columns, and a
validated private producer helper. Notification list/read APIs, Realtime signal
channels, UI layouts, and deep-link destination handling remain P2-02 through
P2-05.

Evidence:
- Requirements: database and producer foundations for `NOT-001`, `NOT-002`, and
  `NOT-005`; D-032 and D-058.
- Migration:
  `supabase/migrations/20260812021256_phase2_notification_foundation.sql`,
  created with the installed Supabase CLI migration command and applied by
  `npx.cmd supabase db reset --local`.
- Implementation:
  `public.notification_types`, upgraded `public.notifications`, private
  `populate_notification_targets` trigger, hardened
  `private.insert_notification`, `src/features/notifications/contracts.ts`, and
  generated `src/lib/supabase/database.types.ts`.
- Authorization/security: RLS is enabled on notification tables; recipients can
  select and update only their own notification `read_at`; browser callers
  cannot insert notification rows or execute the private producer; producer
  validates active recipient, registered active type, nonempty content, and
  object payload.
- Tests: `supabase/tests/phase2_notification_foundation_test.sql` passed 26
  pgTAP assertions; full `npx.cmd supabase test db --local` passed 8 files and
  292 assertions.
- Quality: `npm.cmd run format:check`, `npm.cmd run lint`,
  `npm.cmd run typecheck`, `npm.cmd test` (52 Vitest tests), and
  `npm.cmd run build` passed.
- Advisors: `npx.cmd supabase db lint --local --schema public,private --level warning --fail-on error`
  passed with one non-failing pre-existing warning for unused
  `invite_age_seconds` in `public.join_class_with_invite`; `npx.cmd supabase db advisors --local --type all --level warn --fail-on error`
  reported no issues.
- Generated types: a fresh formatted generation from the local database matched
  `src/lib/supabase/database.types.ts` at SHA-256
  `48707055146EBE7CA4ABFD87DECD967858919E995DACB4E33C3E531511639011`.

- [x] **P2-02:** Implement list, unread count, mark-one/all-read, and authorized deep links.

P2-02 status: complete and verified on the isolated local Supabase stack as of
2026-08-12. The slice adds authenticated notification APIs for durable list
fetching, unread count, mark-one-read, mark-all-read, and deterministic
registry-based deep links. It relies on the P2-01 recipient RLS policies for
authorization; possession of a notification does not grant destination access,
and destination reauthorization remains enforced by the target routes as they
ship. Realtime private signals and notification-center UI states remain P2-03
and P2-04.

Evidence:
- Requirements: API/server portions of `NOT-001`, `NOT-002`, and `NOT-005`.
- Implementation:
  `src/app/api/notifications/route.ts`,
  `src/app/api/notifications/[id]/read/route.ts`,
  `src/app/api/notifications/read-all/route.ts`,
  `src/features/notifications/deep-link.ts`,
  `src/features/notifications/errors.ts`, and
  `src/features/notifications/server/operations.ts`.
- Contracts: `notificationListQuerySchema` validates status filters, cursor,
  and page-size caps; notification pages return `items`, `unreadCount`,
  `nextCursor`, and `hasMore`; cursors encode `(createdAt, id)` for the
  documented `(created_at desc, id desc)` order.
- Authorization/security: list/count/update operations use the authenticated
  Supabase server client and recipient-scoped RLS. Same-origin checks guard
  mark-one/read-all mutations. Deep links are generated from the typed registry
  plus relational IDs/versioned payload values and never trust arbitrary
  server-supplied HTML or URLs.
- Browser/API evidence: with local Supabase overrides,
  `npx.cmd playwright test tests/e2e/notifications.spec.ts --project=student-mobile-chromium --workers=1`
  passed, proving recipient-only listing, unread count, cursor pagination,
  deep-link generation, cross-user mark-read denial, mark-one, unread filtering,
  and mark-all-read.
- Unit evidence: focused `npm.cmd test -- src/features/notifications` passed 7
  tests; full `npm.cmd test` passed 20 files and 56 tests.
- Quality: `npm.cmd run format:check`, `npm.cmd run lint`,
  `npm.cmd run typecheck`, `npm.cmd run build`, and fresh
  `npx.cmd supabase test db --local` passed. Before the final pgTAP run, the
  local database was reset because the Playwright API test intentionally inserts
  notification fixtures.

- [x] **P2-03:** Implement private signal channel and authoritative refetch triggers.

P2-03 status: complete and verified on the isolated local Supabase stack as of
2026-08-12. The slice adds private Supabase Realtime Broadcast authorization,
database notification-created signals, and a client bridge that invalidates the
authoritative notification query namespace after private signals, channel
subscribe/reconnect/error transitions, auth-session changes, foreground, and
network reconnect. Notification center layouts and stale/offline/deleted-target
presentation remain P2-04, and broader persistence/signal browser scenarios
remain P2-05/P2-EXIT.

Evidence:
- Requirements: `NOT-003` and `NOT-004`; D-032.
- Migration:
  `supabase/migrations/20260812041306_phase2_notification_realtime.sql`,
  created with the installed Supabase CLI migration command and applied by
  `.\\node_modules\\.bin\\supabase.cmd db reset --local`.
- Implementation:
  `private.broadcast_notification_signal`, trigger
  `broadcast_notification_signal_after_insert`, Realtime RLS policy
  `notification_realtime_receive_own_broadcasts`,
  `src/features/notifications/client/realtime.tsx`,
  `src/app/app-providers.tsx`, `notificationSignalSchema`, and refreshed
  `src/lib/supabase/database.types.ts`.
- Authorization/security: private channel authorization is recipient-scoped to
  `user:{auth.uid()}:notifications`, active profiles only, Broadcast receive
  only, and payloads contain only signal metadata. Clients invalidate and
  refetch `/api/notifications`; Realtime content is not treated as authority.
- Tests: focused
  `.\\node_modules\\.bin\\supabase.cmd test db supabase/tests/phase2_notification_realtime_test.sql --local`
  passed 8 pgTAP assertions; full
  `.\\node_modules\\.bin\\supabase.cmd test db --local` passed 9 files and 300
  assertions. Focused `npm.cmd test -- src/features/notifications` passed 10
  tests including private-channel subscription and invalidation behavior.
- Quality: `npm.cmd run format:check`, `npm.cmd run lint`,
  `npm.cmd run typecheck`, and `npm.cmd test` (21 files, 59 tests) passed.
- Advisors: `.\\node_modules\\.bin\\supabase.cmd db lint --local --schema public,private --level warning --fail-on error`
  passed with the existing non-failing `invite_age_seconds` warning in
  `public.join_class_with_invite`; `.\\node_modules\\.bin\\supabase.cmd db advisors --local --type all --level warn --fail-on error`
  reported no issues.

- [x] **P2-04:** Build all required layouts and empty/offline/stale/deleted-target states.

P2-04 status: complete and verified locally as of 2026-08-12. The slice adds a
protected notification center and app unread badge using the existing durable
notification APIs and P2-03 Realtime invalidation bridge. It covers all eight
approved notification row layouts, read/unread filters, mark-one-read,
mark-all-read, loading, empty, stale-refreshing, offline/error retry,
permission-denied copy, deleted/expired-target presentation, pagination, and
mobile-safe row actions. Deep-link destination implementation across later
feature routes and browser persistence/restart coverage remain P2-05/P2-EXIT.

Evidence:
- Requirements: UI/state portions of `NOT-001`, `NOT-002`, `NOT-004`, and
  `NOT-005`; D-032 and D-058.
- Implementation:
  `src/app/notifications/page.tsx`,
  `src/features/notifications/client/notification-center.tsx`,
  `src/features/notifications/client/notification-badge.tsx`, and the `/app`
  header integration in `src/app/app/page.tsx`.
- UI behavior: `/notifications` is protected by active identity checks, seeds
  the first page server-side through recipient RLS, then uses TanStack Query for
  authoritative refetches. The app badge fetches unread count and updates under
  the same notification query namespace invalidated by private Realtime.
- Tests: focused `npm.cmd test -- src/features/notifications` passed 4 files
  and 13 tests, including all layout labels, deleted-target state, empty state,
  offline/error retry state, unread badge refresh, pagination, and mark-read
  mutation behavior. Full `npm.cmd test` passed 22 files and 62 tests.
- Quality: `npm.cmd run format:check`, `npm.cmd run lint`,
  `npm.cmd run typecheck`, and `npm.cmd run build` passed after the UI changes.

- [x] **P2-05:** Pass recipient-isolation, persistence, signal/refetch, and deep-link tests.

P2-05 status: complete and verified locally as of 2026-08-12. The slice adds a
browser journey that exercises durable notification persistence across reload,
recipient-only visibility and mutation, private database Broadcast delivery,
authoritative refetch after the signal, deleted-target presentation, and
destination reauthorization for generated deep links. It also hardens the
Realtime receive policy to bind delivered rows to the requested private topic
and accepts Supabase database Broadcast metadata/timestamps in the signal parser.
Later feature routes still own their destination-specific notification producer
coverage.

Evidence:
- Requirements: browser/integration coverage for `NOT-001` through `NOT-005`
  and D-032.
- Implementation:
  `tests/e2e/notifications.spec.ts`,
  `src/features/notifications/contracts.ts`,
  `src/features/notifications/client/realtime.tsx`,
  `src/features/notifications/client/realtime.test.ts`, and
  `supabase/migrations/20260812041306_phase2_notification_realtime.sql`.
- Authorization/security: the Playwright journey creates two local verified
  users, proves the owner cannot see or mark the other user's notification,
  proves notification deep-link possession does not authorize the destination,
  and verifies the other user sees only their own durable row after sign-out and
  sign-in.
- Realtime/refetch: the test waits for the private
  `user:{userId}:notifications` subscription, inserts a durable notification,
  observes the `notification.created` Broadcast signal, and then requires the
  refetched row to render in `/notifications`.
- Tests: focused `npm.cmd run test -- src/features/notifications/client/realtime.test.ts`
  passed 3 tests; focused
  `.\\node_modules\\.bin\\supabase.cmd test db supabase/tests/phase2_notification_realtime_test.sql --local`
  passed 9 pgTAP assertions; focused Playwright with local Supabase env
  overrides passed
  `npm.cmd run test:e2e -- tests/e2e/notifications.spec.ts --project=student-mobile-chromium --grep "notification center persists" --workers=1 --timeout=180000`.
  Full notification E2E coverage also passed
  `npm.cmd run test:e2e -- tests/e2e/notifications.spec.ts --project=student-mobile-chromium --workers=1 --timeout=180000`
  with 2 tests.

- [x] **P2-EXIT:** Notifications survive restart and only the recipient can read or mutate them.

P2-EXIT status: complete and verified locally as of 2026-08-13. The exit
coverage adds a focused browser journey that creates two verified local users,
inserts durable notification rows for each recipient, restarts the local
Supabase PostgreSQL container, signs in as each user, and proves the rows remain
durable while list and mark-read operations stay recipient-scoped through the
authoritative notification API.

Evidence:
- Requirements: exit coverage for `NOT-001`, `NOT-002`, and the durable-row
  persistence guarantee in D-032.
- Implementation: `tests/e2e/notifications.spec.ts` adds the `P2-EXIT`
  restart journey and bounded local Docker database restart helper. No
  application schema, API contract, RLS policy, or generated database type
  changed.
- Browser evidence: with local Supabase overrides,
  `npm.cmd run test:e2e -- tests/e2e/notifications.spec.ts --project=student-mobile-chromium --grep "P2-EXIT" --workers=1 --timeout=240000`
  passed 1 test. The test restarts `supabase_db_ai-escort-application`, waits
  for Auth/API readiness, verifies the first recipient can list and mark only
  its own notification, receives `404` when marking the other recipient's row,
  and verifies the second recipient's authoritative list excludes the first
  recipient's notification.
- Quality: `npm.cmd exec prettier -- --check tests/e2e/notifications.spec.ts docs/ROADMAP.md docs/modules/02-notifications.md docs/TRACEABILITY_MATRIX.md`,
  `npm.cmd run lint`, `npm.cmd run typecheck`,
  `npm.cmd test -- src/features/notifications`, full `npm.cmd test` (22 files,
  62 tests), and `npm.cmd run build` passed after the exit test was added.
  After the restart browser test inserted local fixtures,
  `.\\node_modules\\.bin\\supabase.cmd db reset --local` was run, then
  `.\\node_modules\\.bin\\supabase.cmd test db --local` passed 9 files and 301
  pgTAP assertions. Supabase db lint passed with the existing non-failing
  `invite_age_seconds` warning, and db advisors reported no issues. A stale
  generated `.next/dev/types/validator.ts` file from the Playwright dev server
  caused one transient typecheck parse error; removing `.next/dev/types`
  regenerated clean Next types and the rerun passed.

## Phase 3 — Atomic student group creation

Requirements: `GRP-001`–`GRP-006`, `GRP-010`.

- [x] **P3-01:** Add group, membership, leader, creation-claim, and history constraints/migrations.

P3-01 status: complete and verified locally as of 2026-08-13. The slice adds
the group formation schema foundation only; student creation RPC, group board
read model, private class-group Realtime signal, final-slot race harness, and UI
states remain P3-02 through P3-05.

Evidence:
- Requirements: schema and invariant foundations for `GRP-002`, `GRP-003`,
  `GRP-005`, and `GRP-006`; supporting tables for `GRP-001` and `GRP-010`.
- Migration:
  `supabase/migrations/20260813050854_phase3_group_foundation.sql`, created
  with the installed Supabase CLI migration command and applied by
  `.\\node_modules\\.bin\\supabase.cmd db reset --local`.
- Schema: `public.groups`, `public.group_members`,
  `public.student_group_creation_claims`, and
  `public.group_membership_history`; current-group indexes; composite
  group/class foreign key enforcement; one-active-leader, one-active-group, and
  one-unreset-creation-claim partial unique indexes; append-only membership
  history protections; and private active-student/group-leader validation
  helpers with fixed empty `search_path`.
- Authorization/security: RLS is enabled on every new exposed table. Browser
  roles receive SELECT only; no browser insert/update/delete grants exist.
  Students can read current groups and active group memberships only inside
  their authorized class, can read only their own creation-claim history, and
  cannot read membership history directly. Teachers can read group and history
  rows only for classes they teach. Direct browser writes are denied pending
  trusted RPCs in later P3/P5 slices.
- Tests: focused
  `.\\node_modules\\.bin\\supabase.cmd test db supabase/tests/phase3_group_foundation_test.sql --local`
  passed 37 pgTAP assertions. Full
  `.\\node_modules\\.bin\\supabase.cmd test db --local` passed 10 files and 338
  pgTAP assertions.
- Advisors: `.\\node_modules\\.bin\\supabase.cmd db lint --local --schema public,private --level warning --fail-on error`
  passed with the existing non-failing `invite_age_seconds` warning in
  `public.join_class_with_invite`; `.\\node_modules\\.bin\\supabase.cmd db advisors --local --type all --level warn --fail-on error`
  reported no issues.
- Generated types: `src/lib/supabase/database.types.ts` was regenerated from
  the local database with
  `.\\node_modules\\.bin\\supabase.cmd gen types typescript --local --schema public`
  and formatted.

- [x] **P3-02:** Implement and secure atomic `create_student_group`.

P3-02 status: complete and verified locally as of 2026-09-12. The slice adds
the trusted atomic creation RPC and its typed server contract. The group board
UI, private class-group Realtime signal, and browser race journey remain P3-03
through P3-05.

Evidence:
- Requirements: `GRP-002`, `GRP-003`, `GRP-004` (database race), `GRP-005`,
  and `GRP-006`; D-034–D-038 and D-047.
- Migration:
  `supabase/migrations/20260911183206_phase3_create_student_group.sql`,
  created with `supabase migration new` and applied by
  `supabase db reset --local`.
- RPC: `public.create_student_group(uuid,text,text)` validates the auth
  subject, active verified profile, active student class/school membership, and
  class status; locks the class row; then checks student creation enabled,
  formation open, no current group, no unreset creation claim, and current slot
  count below `maximum_groups`. Success creates the forming group, the creator
  as sole active leader, the creation claim, `creation_claimed`/`joined`/
  `became_leader` history, a `group_created` audit row, and a `group_created`
  research event (`creator_type`, `remaining_slots`). Domain denials
  (`STUDENT_GROUP_CREATION_DISABLED`, `GROUP_FORMATION_CLOSED`,
  `STUDENT_ALREADY_IN_GROUP`, `STUDENT_GROUP_ALREADY_CREATED`,
  `GROUP_LIMIT_REACHED`) return `outcome=denied` so the denied audit row and
  `group_creation_failed` event (`error_code`) commit without any group write.
  Authorization/account failures raise `AUTH_REQUIRED`, `ACCOUNT_DISABLED`,
  `EMAIL_NOT_CONFIRMED`, `FORBIDDEN`, or `CLASS_NOT_ACTIVE`. Soft-deleted and
  archived groups do not occupy a slot; deleting a group never releases the
  creation claim. `research_events.group_id` was added with an index.
- Security: SECURITY DEFINER with empty `search_path`; execute revoked from
  `public`/`anon` and granted only to `authenticated`; private helpers
  `insert_group_research_event` and `count_current_class_groups` are not
  browser callable. No notification is produced because no creation
  notification type exists in `UI_CONTRACTS.md` §4.
- Server contract: `POST /api/groups` in `src/app/api/groups/route.ts`, Zod
  request schema in `src/features/groups/contracts.ts`, stable error mapping
  and Thai presentations in `src/features/groups/errors.ts`, result
  interpretation in `src/features/groups/create-result.ts`, and the server-only
  RPC call in `src/features/groups/server/operations.ts`. Denials return `409`
  with slot counts in safe `details`.
- Tests: `supabase/tests/phase3_create_student_group_test.sql` (42 pgTAP
  assertions: success writes, every denial code, claim retention after delete,
  archived/deleted slot release, teacher/cross-class/unknown-class/anon/no-sub/
  deactivated denial, name validation, grants, helper hardening, one leader and
  one current group invariants, and RLS read isolation);
  `supabase/tests/phase3_create_student_group_concurrency.ps1` with
  `supabase/test-support/phase3_create_student_group_concurrency_*.sql`
  (10 advisory-lock-gated rounds of two students racing for one slot);
  `src/features/groups/contracts.test.ts` and
  `src/features/groups/create-result.test.ts`.
- Commands: `supabase test db supabase/tests/phase3_create_student_group_test.sql --local`
  (42 passed); `supabase test db --local` (11 files, 380 assertions passed);
  `supabase/tests/phase3_create_student_group_concurrency.ps1` (PASS, each round
  exactly one `created` and one `GROUP_LIMIT_REACHED`, one group, one leader,
  one claim, one success and one failure event);
  `supabase db lint --local --schema public,private --level warning --fail-on error`
  (existing non-failing `invite_age_seconds` warning only);
  `supabase db advisors --local --type all --level warn --fail-on error`
  (no issues); `supabase gen types --local --schema public` matched the
  committed `src/lib/supabase/database.types.ts` after Prettier; `npm run check`.
- CI repair in the same change: hosted run `34633092440` failed `npm audit`
  on Next.js 16.3.0 (critical advisory) and the P2-05 browser test because
  Thai selectors in `tests/e2e/notifications.spec.ts` had been saved as
  double-encoded UTF-8. Next.js and `eslint-config-next` are pinned to 16.3.5,
  non-breaking transitive audit fixes were applied (remaining findings are
  moderate only), and the spec plus `docs/TRACEABILITY_MATRIX.md` were
  restored to valid UTF-8.
- Commit: `Implement P3-02 atomic student group creation` on `main`.
- Remaining risk: the race harness is a local PowerShell script and is not run
  by hosted CI; the pgTAP suite is.
- [x] **P3-03:** Build group board and explanatory create-group availability states.

P3-03 status: complete as of 2026-09-12. Database, browser, and generated-type
verification ran in hosted CI because the local Docker engine stopped
responding during the slice; unit, lint, and typecheck ran locally.

Evidence:
- Requirements: `GRP-001`; create-availability states for `GRP-002`–`GRP-006`;
  D-035, D-041, D-047, D-053, D-059 (member list current group).
- Migration:
  `supabase/migrations/20260911191650_phase3_group_board_read_model.sql`.
- Read model: `public.get_class_group_board(uuid)` returns authoritative slot
  counts, formation settings, current (non-deleted, non-archived) groups with
  leader, members, capacity, minimum-size and accepting state, unassigned
  students, and the viewer eligibility reason in the same precedence as
  `create_student_group`. It never returns emails. Teachers read it with
  `cannotCreateReason=FORBIDDEN`. `list_class_members` now fills the current
  group.
- Server/UI: `GET /api/classes/:id/group-board`
  (`src/app/api/classes/[id]/group-board/route.ts`,
  `src/features/groups/server/board.ts`), Zod database-boundary schema in
  `src/features/groups/board.ts`, `/classes/[classId]/groups` page, and
  `GroupBoardScreen` with loading, empty, offline (create disabled because
  cached data cannot reserve a slot), stale refresh failure, permission denied,
  class not active, network retry, disabled-with-reason for every creation
  code, final-slot race-loss (informational, not error-toned), and success
  states. Group status tokens (label, icon, shape, color) live in
  `group-status-badge.tsx`. The class member browser links to the board and
  `/classes/{uuid}/groups` is an allowlisted sign-in return path. D-050
  request-to-invite and teacher over-quota creation from the design artifacts
  were not implemented.
- Tests: `supabase/tests/phase3_group_board_test.sql`;
  `src/features/groups/board.test.ts`,
  `src/features/groups/components/group-board.test.tsx`,
  `src/features/groups/components/group-status-badge.test.tsx`,
  `src/features/auth/redirect.test.ts`; Playwright
  `tests/e2e/group-formation.spec.ts` (`P3-03 student group board`: signed-out
  deep link returns after sign-in, create at 390 px, leader state, classmate
  disabled slot-limit reason via the member-browser link, no overflow, no
  email disclosure).
- Commands: local `npm run lint`, `npm run typecheck`, and `npm test`
  (27 files). Hosted CI run `34640286482` on `c97ac8a` passed `quality`
  (Vitest 27 files/82 tests, build, audit), `database` (`supabase test db`
  12 files/413 assertions, db lint with the existing `invite_age_seconds`
  warning only, advisors "No issues found", generated-type diff), and
  `browser-smoke` (20 passed, 10 project-scoped skips) including the P3-03
  journey and the repaired P2-EXIT restart journey:
  https://github.com/ninjanoppawut/AI-Escort-Application/actions/runs/34640286482.
- Commit: `c97ac8a` (`Add P3-03 group board read model and student board UI`).
- Remaining risk: `database.types.ts` was restored and extended by hand while
  local generation was unavailable; the CI generated-type diff confirmed it.
- [x] **P3-04:** Implement private class-group invalidation and refetch lifecycle.

P3-04 status: complete as of 2026-09-12, verified in hosted CI.

Evidence:
- Requirements: `GRP-010`; D-006, D-041.
- Migration:
  `supabase/migrations/20260911194231_phase3_class_group_realtime.sql`.
- Signals: row triggers on `groups`, `group_members`, `classes` (formation,
  capacity, and status columns only), and creation-claim updates call
  `private.send_class_group_signal`, which sends a private Broadcast on
  `class:{classId}:groups` carrying only `type`, `version`, `classId`,
  `groupId`, and `changedAt`. Events: `group.created`, `group.updated`,
  `group.deleted`, `group.archived`, `group.locked`, `group.unlocked`,
  `group.member_joined`, `group.member_left`, `group.member_moved`,
  `group.leader_changed`, `group.capacity_changed`, `group.formation_changed`.
- Authorization: `class_group_realtime_receive_member_broadcasts` on
  `realtime.messages` requires the strict topic parsed by
  `private.class_group_topic_class_id` and active class membership via
  `private.current_user_is_class_member`. No insert policy exists, so browsers
  cannot publish into class-group topics. Signal functions are private
  SECURITY DEFINER with empty `search_path` and no browser execute grant.
- Client: `useClassGroupRealtime` in `src/features/groups/client/realtime.tsx`
  subscribes privately, validates signals with Zod against the subscribed
  class, invalidates only the authoritative board query on signals and on
  `SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`, serializes auth-session
  changes, and removes the channel on unmount. The board uses
  `refetchOnWindowFocus: "always"`, `refetchOnReconnect: "always"`, mutation
  completion invalidation, and a 60-second fallback poll, and shows
  live/reconnecting state.
- Tests: `supabase/tests/phase3_class_group_realtime_test.sql` (22 assertions:
  topic parsing, function/grant posture, triggers, receive policy, no publish
  policy, emitted events per transition, payload minimization, class isolation,
  member/teacher receipt, cross-class/other-topic/left-member denial);
  `src/features/groups/client/realtime.test.tsx`.
- Commands: local `npm run lint`, `npm run typecheck`, `npm test` (28 files).
  Hosted CI run `34641284802` on `7acf3ae` passed `quality` (Vitest 28 files),
  `database` (13 files/435 assertions, advisors "No issues found",
  generated-type diff), and `browser-smoke` (21 passed, 11 project-scoped
  skips): https://github.com/ninjanoppawut/AI-Escort-Application/actions/runs/34641284802.
- Commit: `7acf3ae`.

- [x] **P3-05:** Pass final-slot race, one-leader, one-group, creation-claim, RLS, and Realtime tests.

P3-05 status: complete as of 2026-09-12. Evidence:
- Final-slot race: `supabase/tests/phase3_create_student_group_concurrency.ps1`
  (10 local rounds, P3-02) and the browser race in
  `tests/e2e/group-formation.spec.ts` (`P3-05 final group slot race and live
  board refresh`, CI run `34641284802`), which asserts one success, one
  race-loss state, one current group, one leader, and one
  `group_creation_failed` event.
- One leader, one current group, and creation claim:
  `phase3_group_foundation_test.sql`, `phase3_create_student_group_test.sql`,
  and `phase3_group_board_test.sql`.
- RLS: foundation, creation, board, and realtime suites cover member, teacher,
  cross-class, left-member, anon, and browser-write denial.
- Realtime: `phase3_class_group_realtime_test.sql`, `realtime.test.tsx`, and
  the browser observer refresh.
- Remaining risk: the multi-round database race harness runs locally only;
  hosted CI covers the browser race.

- [x] **P3-EXIT:** Two students racing for the last slot produce exactly one success and immediate authoritative UI refresh.

P3-EXIT status: complete as of 2026-09-12. The `P3-05 final group slot race
and live board refresh` journey signs in two racers and an idle observer at
390 px, waits for live Realtime state, submits both creates together, verifies
exactly one winner and one informational race-loss state, verifies database
state, and verifies that the observer board shows `เหลือ 0 กลุ่ม` and a disabled
Create Group within 15 seconds without reload or interaction (well inside the
60-second fallback poll). Passed in hosted CI run `34641284802` on `7acf3ae`.

## Phase 4 — Invitations and leadership

Requirements: `GRP-007`–`GRP-009` plus relevant NOT requirements.

- [x] **P4-01:** Add group invitation schema, expiry/status rules, RLS, and history.
- [x] **P4-02:** Implement eligible-classmate search and send/cancel actions for the current leader.
- [x] **P4-03:** Implement atomic accept/decline with capacity and membership revalidation.
- [x] **P4-04:** Implement readiness and atomic leadership transfer.
- [x] **P4-05:** Deliver invitation/group notifications and handle stale/race states.
- [x] **P4-06:** Pass invitation acceptance race, capacity, one-leader, and one-group tests.
- [x] **P4-EXIT:** Consent-based invitation and transfer flows cannot violate membership or leadership invariants.

P4 status: complete as of 2026-09-19. Evidence:
- Implementation: `3abb1df` (P4-01 schema, RLS, signals), `79ea488`
  (P4-02/P4-03 invitation operations), `83a98e3` and `4d33401` (invitation
  screens, readiness and leadership operations, leader actions UI, concurrency
  suite), `608c3da` and `8584673` (race capacity and event-count fixes);
  contracts and owner-confirmation items in `e89075d`.
- Tests: `phase4_group_invitations_foundation_test.sql` (30),
  `phase4_group_invitation_operations_test.sql` (50),
  `phase4_group_leadership_operations_test.sql` (30),
  `phase4_group_concurrency_test.sql` (12, dblink acceptance and capacity
  races, one leader, one current group); `src/features/groups/invitations.test.ts`,
  `leadership.test.ts`, and the group detail, invitation, and leader-action
  component tests; Playwright `tests/e2e/group-invitations.spec.ts` (leader
  invites, invitee races two acceptances, exactly one join commits).
- Commands: `npm run format:check`; `npm run lint`; `npm run typecheck`;
  `npm test`; `npm run build`; `npx supabase test db --local`;
  `npx playwright test --project=database-restart`.
- CI: every run from P4-01 to `937687d` was red; the fixes in `4e195c4`,
  `b87ab73`, and `fb76faf` made the suite green: hosted CI run `35378306046` on `fb76faf` passed `quality`, `database`, and `browser-smoke` on 2026-09-19.
- Remaining risk: invitation lifetime, closed-formation behavior, and
  notification gaps are listed for owner confirmation in
  `OWNER_QUESTIONS_PENDING.md` items 1–8.

## Phase 5 — Teacher group management

Requirements: `MGT-001`–`MGT-009`.

- [x] **P5-01:** Build group/unassigned-student board and manual group creation within the absolute limit.
- [x] **P5-02:** Implement atomic member move/remove with successor selection.
- [x] **P5-03:** Implement approve, lock/unlock, leader change, and audited creation-claim reset.
- [x] **P5-04:** Implement delete-unused versus archive-historical behavior and invitation cancellation.
- [x] **P5-05:** Emit histories, events, notifications, and Realtime invalidation after commit.
- [x] **P5-06:** Pass capacity, cross-class, leader, active-session, delete/archive, and concurrency tests.
- [x] **P5-EXIT:** Teachers reorganize groups without corrupting current invariants or session history.

P5 status: complete as of 2026-09-19. Evidence:
- Implementation: `e18085d` (teacher group creation within the absolute
  limit, atomic moves with successor), `c187a1f` (approve, lock/unlock,
  leader change, audited claim reset, delete-or-archive, teacher board UI),
  `8584673` and `3948a02` (race and journey fixes).
- Tests: `phase5_teacher_group_operations_test.sql` (25),
  `phase5_group_review_and_lifecycle_test.sql` (27),
  `phase5_group_management_concurrency_test.sql` (9, teacher-versus-student
  final-slot and final-seat move races); active-session refusals are covered
  again by `phase6_session_open_test.sql` now that real sessions exist;
  `src/features/groups/teacher.test.ts`, `teacher-actions.test.ts`,
  `lifecycle.test.ts`; Playwright `tests/e2e/teacher-group-management.spec.ts`.
- Histories, audit rows, research events, notifications, and class-group
  signals after commit are asserted in the lifecycle suite and
  `phase3_class_group_realtime_test.sql`.
- CI: hosted CI run `35378306046` on `fb76faf` passed `quality`, `database`, and `browser-smoke` on 2026-09-19.
- Remaining risk: lock, claim-reset, and delete-or-archive choices are listed
  in `OWNER_QUESTIONS_PENDING.md` items 9–13.

## Phase 6 — Activities, geometry, and snapshots

Requirements: `SES-001`–`SES-003`.

- [x] **P6-01:** Add PostGIS extension/migrations and activity, geometry, session, and participant-snapshot schema/RLS.
- [x] **P6-02:** Implement activity and geometry authoring with Zod/PostGIS validation.
- [x] **P6-03:** Implement session creation/open with an immutable membership/leadership snapshot.
- [x] **P6-04:** Build activity/session setup flows and invalid-geometry/failure states.
- [x] **P6-05:** Pass geometry, authorization, and snapshot-preservation tests.
- [x] **P6-EXIT:** Later group changes cannot alter an opened session's participant history.

P6 status: complete as of 2026-09-19. Evidence:
- Implementation: `f2d48cf` (PostGIS, activities, immutable versions,
  boundary/route/checkpoint tables, sessions, snapshot tables, RLS),
  `9276ba9` (GeoJSON authoring, Zod/PostGIS validation, publish), `deee24f`
  (session scheduling and the immutable open snapshot), `937687d` (ordering
  and journey fixes).
- Tests: `phase6_activity_session_foundation_test.sql` (30),
  `phase6_activity_authoring_test.sql` (23), `phase6_session_open_test.sql`
  (22, snapshot contents, replay, running-session refusal, snapshot
  preservation after later group changes); `src/features/activities/*.test.ts`,
  `src/features/sessions/contracts.test.ts`; Playwright
  `tests/e2e/activity-session-setup.spec.ts` (publish, open, snapshot survives
  later group changes).
- P6-04 builds the setup flows with GeoJSON paste/import and a coordinate
  sketch; drawing on a base map waits for the Mapbox token
  (`OWNER_QUESTIONS_PENDING.md` item 18).
- CI: hosted CI run `35378306046` on `fb76faf` passed `quality`, `database`, and `browser-smoke` on 2026-09-19.

## Phase 7 — Session control and live map

Requirements: `SES-004`–`SES-010`.

- [x] **P7-01:** Add session-group state constraints and partial unique index for one active group.
- [x] **P7-02:** Implement secure open/activate/pause/resume/group-complete/session-complete operations.
- [x] **P7-03:** Implement private Presence/Broadcast authorization and location lifecycle.

P7-01 to P7-03 status: complete as of 2026-09-19. Evidence:
- P7-01/P7-02: `937687d` (partial unique index, activate/pause/resume/
  complete RPCs, read models), `4e195c4` (next group promoted and notified on
  activation), `fb76faf` (typed routes `activate-group`, `pause`, `resume`,
  `groups/:groupId/complete`, `complete`, `group-queue`, `participant`).
  Tests: `phase7_session_control_test.sql` (23),
  `src/features/sessions/session-control.test.ts`.
- P7-03: `fb76faf` (`20260918020000_phase7_live_location_realtime.sql`:
  private group/teachers/location topics, publish rule, six
  `realtime.messages` policies, signal triggers, append-only
  `location_events`, `record_live_location_sample`,
  `get_session_live_locations`; client publisher and teacher hooks;
  redaction of coordinate keys). Tests:
  `phase7_live_location_realtime_test.sql` (41),
  `phase7_location_samples_test.sql` (19),
  `src/features/sessions/live-location/live-location.test.ts`,
  `src/lib/observability/redaction.test.ts`, and Playwright
  `tests/e2e/live-location-channels.spec.ts` against local Realtime (teacher
  receives the owner's broadcast, a groupmate and a waiting student are
  refused, pause signals the teachers topic and refuses a fresh join).
- Commands: `npx supabase test db --local` (26 files, 776 tests);
  `npx supabase db lint --local --schema public,private --level warning
  --fail-on error`; `npx supabase db advisors --local --type all --level warn
  --fail-on error` (no issues); `npm test` (42 files, 183 tests).
- CI: hosted CI run `35378306046` on `fb76faf` passed `quality`, `database`, and `browser-smoke` on 2026-09-19.
- Remaining risk: owner confirmation items 22–33 in
  `OWNER_QUESTIONS_PENDING.md`; the student and teacher screens are P7-04.
- [x] **P7-04:** Build student waiting/field shells and teacher queue/live-map controls.
- [x] **P7-05:** Add location freshness/accuracy, offline/reconnect, and activation-race states.
- [x] **P7-06:** Pass active-group concurrency, channel isolation, publish-stop, and map tests.
- [x] **P7-EXIT:** Exactly one group is active and only the teacher can see named live locations.

P7-04 to P7-EXIT status: complete as of 2026-09-19. Evidence:
- P7-04: `33b52b8` (student shell at
  `/activities/[activityId]/sessions/[sessionId]` with waiting, next, field,
  paused, completed, inactive, offline, stale, and permission states and a
  field-mode notice that gates publishing; teacher live controls at
  `/teacher/classes/[classId]/sessions/[sessionId]/live` with queue, activate,
  complete, pause/resume, conflict refetch, and live positions on the activity
  sketch without Mapbox). Tests: `student-session-shell.test.tsx`,
  `teacher-session-live.test.tsx`, `live-view.test.ts`, and Playwright
  `tests/e2e/session-live.spec.ts` against local Realtime (teacher sees the
  active student's name and accuracy, a waiting student sees only the queue
  and never touches geolocation, pause stops every watch and sample, no
  mapbox.com request).
- P7-05: `4368efd` (device-reported denied/unavailable status and low-accuracy
  flags for the teacher); stale markers, offline/reconnect, and the
  activation-conflict state ship in `33b52b8`.
- P7-06: `phase7_session_concurrency_test.sql` (`789b918`, two concurrent
  activations leave exactly one active group; pause waits for an in-flight
  sample and the next sample is refused), `phase7_live_location_realtime_test.sql`
  (channel isolation and publish-stop matrix),
  `tests/e2e/live-location-channels.spec.ts`, and the P7-04 map/list tests.
- P7-EXIT: exactly one active group is enforced by the partial unique index
  and the race test; named live locations reach only the owner and the class
  teacher (RLS on the per-student topic, the teacher-only read model, and the
  browser journey).
- CI: hosted CI run `35385824382` on `4368efd` passed `quality`,
  `database`, and `browser-smoke` on 2026-09-19.
- Remaining risk: owner items 22–33 (cadences, notice copy, stale threshold,
  Realtime capacity, hosted public-access setting); the base map waits for the
  Mapbox token.

## Phase 8 — Observation foundation

Requirements: `OBS-001`–`OBS-004`, `OBS-011`.

- [x] **P8-01:** Add observation/status/event schema, ownership RLS, and optimistic versioning.
- [x] **P8-02:** Implement idempotent observation start against the participant snapshot and active group.
- [x] **P8-03:** Implement capture location/time/accuracy and explicit missing-location handling.

P8-01 to P8-03 status: complete as of 2026-09-19 (P8-04 UI and P8-05/EXIT
browser evidence pending). Evidence:
- Implementation: `33b52b8` (`20260918183755_phase8_observation_foundation.sql`
  and `20260918183800_phase8_observation_operations.sql`: owner-only
  observations bound to the participant snapshot, immutable capture metadata
  with explicit location status, optimistic version, append-only status
  history, idempotent `start_observation`, `update_observation_draft` with
  refreshed-record conflicts, owner read models; routes
  `POST /api/observations/start`, `GET /api/observations/:id`,
  `PUT /api/observations/:id/draft`, `GET /api/sessions/:id/observations`).
- Tests: `phase8_observation_test.sql` (37), `phase8_observation_concurrency_test.sql`
  (8, duplicate start, edit race, start versus pause),
  `src/features/observations/observations.test.ts`.
- Commands: `npx supabase test db --local` (29 files, 829 tests); db lint and
  advisors with no new findings; `npm test`.
- CI: hosted CI run `35384930508` on `33b52b8` and `35385824382` on
  `4368efd`.
- Remaining risk: owner decisions 34–38 and confirmations 39–43 in
  `OWNER_QUESTIONS_PENDING.md`.
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
