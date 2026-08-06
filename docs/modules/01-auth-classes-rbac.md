# AUTH — Authentication, Classes, and RBAC

## Outcome

Teachers can create configured classes and invite students; students can authenticate and join through a valid code, link, or QR invitation without choosing or escalating their role.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §§2–4
- `docs/DECISIONS_AND_QUESTIONS.md` D-030, D-031, D-047, D-050
- `docs/API_AND_REALTIME.md` §§2, 4–5
- `docs/DATABASE_DESIGN.md` §§3, 16
- `docs/AUTH_IDENTITY_AND_TENANCY.md`
- `docs/UI_CONTRACTS.md`

## Scope

In scope: verified email/password authentication, password recovery, profile bootstrap, trusted teacher provisioning, class creation/editing, class membership, invitation creation/disable/use, class member lists, group-formation settings, and role-aware routes.

Out of scope: email-delivered class invitations, school-domain whitelists, client-selected roles, and unrestricted admin bypasses.

## Functional requirements

- **AUTH-001:** A user can sign up, confirm a real email address, sign in/out with email and password, recover access by email, and bootstrap a profile without placing authorization data in user-editable metadata.
- **AUTH-002:** A teacher can create a class with minimum group size, maximum group size, absolute maximum group count, student-creation flag, and formation status.
- **AUTH-003:** A teacher can create and disable code/link/QR invitations.
- **AUTH-004:** Joining validates the invitation atomically and creates an active student membership; the client cannot select the resulting role.
- **AUTH-005:** Students and teachers can view only classes and memberships authorized by database membership.
- **AUTH-006:** Role-aware routes reject unauthorized access on the server and in the database, not only in navigation.
- **AUTH-007:** Both roles have a class-member list appropriate to their permissions.
- **AUTH-008:** Class settings and invitation mutations emit append-only audit/research events.
- **AUTH-009:** Anonymous sign-in is disabled and protected application access requires a confirmed email.
- **AUTH-010:** A new account receives student capability by default; only a platform-admin teacher invitation/approval can grant teacher capability.
- **AUTH-011:** Account type and class role are relational trusted data limited to `teacher` and `student`; neither can be supplied or edited by the browser.
- **AUTH-012:** Next.js SSR uses PKCE and cookie-based Supabase clients; server route protection validates current claims and never trusts an unvalidated cookie session.

## Authorization and data boundary

- PostgreSQL class membership is authoritative.
- Every exposed table has RLS; update policies include `USING` and `WITH CHECK`.
- Never authorize from `raw_user_meta_data`, UI state, route parameters, or cached role claims alone.
- Invite consumption is a trusted atomic operation with stable invalid/expired/disabled/already-used errors.
- Teacher invitation consumption is a separate trusted operation bound to the normalized verified email.
- The browser receives a publishable Supabase key only; service-role and provider secrets remain server-only.
- Production uses custom SMTP; the Supabase default SMTP service is development-only.

## Required states and failures

Loading, empty class list, invalid/expired/disabled invitation, already joined, inactive class, permission denied, offline, retry, and session-expired states must be explicit in Thai-first UI.

## Verification

- RLS isolation across at least two classes and both roles.
- Tests proving the client cannot choose a teacher/admin role or change trusted account type.
- Email-confirmation, SSR PKCE callback, password reset, and revoked teacher-invitation tests.
- Concurrent/repeated invite-use tests are idempotent and do not create duplicate memberships.
- Playwright coverage for teacher class creation and student code/link join.

## Dependencies

Foundation environment validation, Supabase clients, Zod schemas, request IDs, and event-logging interface.

## Implementation status

In progress overall. P1-01 Auth is implemented and locally verified in
`src/features/auth`, `src/lib/supabase`, `src/proxy.ts`, `src/app/api/auth`,
`src/app/auth`, `src/app/api/me/route.ts`, and `src/app/app/page.tsx`. It provides
strict student-only signup input, the canonical `GET /api/auth/callback` PKCE
flow, confirmation resend, sign-in/out, recovery/password update, safe redirects,
cookie refresh, signed-claim/current-user/profile validation, and Thai-first
mobile/offline/error states. Unit/integration coverage is under
`src/features/auth/**/*.test.ts(x)` and the real local Supabase/Mailpit journey is
`tests/e2e/auth.spec.ts`.

The identity migration
`supabase/migrations/20260805083021_phase1_identity_foundation.sql` establishes
trusted student profile bootstrap, identity/school/admin/teacher-invitation
tables, least-privilege grants, and RLS. Its pgTAP coverage is
`supabase/tests/phase1_identity_foundation_test.sql`.

P1-02A trusted provisioning is implemented in the local working tree by
`supabase/migrations/20260806035312_phase1_trusted_provisioning.sql` and
verified on the isolated local Supabase stack. It adds append-only `audit_logs`
and `research_events`, private fixed-search-path helpers for admin/MFA
validation, token hashing, and audit insertion, and trusted RPCs for
`grant_platform_admin`,
`revoke_platform_admin`, `issue_teacher_invitation`,
`revoke_teacher_invitation`, `preview_teacher_invitation`, and
`consume_teacher_invitation`. Teacher invitation secrets are generated inside
PostgreSQL, returned only from the issue RPC, stored only as SHA-256 hashes,
and never granted through ordinary table reads. Consumption is email-bound,
locks the caller profile and invitation row, rejects expired/revoked/replayed
tokens, promotes the account to teacher, upserts one active teacher school
membership, and emits the documented `teacher_invitation_consumed` research
event in the same transaction.

P1-02A verification files are
`supabase/tests/phase1_trusted_provisioning_test.sql` and
`supabase/tests/phase1_trusted_provisioning_concurrency.ps1` with SQL fixtures
under `supabase/test-support`. The focused pgTAP suite passed 48 assertions; the
full local database suite passed 120 assertions; the two-connection consume race
passed with one success, one replay denial, one accepted invitation, one teacher
membership, and one research event. Local database lint and
security/performance advisors reported no issues. Generated database types match
a second local generation at SHA-256
`877F2C88112127C5DC4B53A8EA2E5DCE96DE98CF88EB99306242361FDD42CAE0`.

P1-02 is implemented locally by
`supabase/migrations/20260805224248_phase1_class_foundation.sql`. It adds
relational classes, class memberships, and class invitations with documented
configuration and lifecycle constraints, relational role validation, indexed
foreign keys and policy columns, least-privilege grants, and membership-based
RLS. Browser access is read-only for this foundation; invitation token hashes
are excluded from authenticated Data API grants. Trusted actor-validation
triggers reject inactive, unconfirmed, cross-school, or role-mismatched actors.
P1-03 owns class creation/settings mutation contracts and class audit events,
while P1-04 owns student class-invitation consumption and replay/idempotency
behavior. P1-02A owns the trusted platform-admin and teacher-invitation
provisioning boundary only.

P1-02 verification is in
`supabase/tests/phase1_class_foundation_test.sql` (46 pgTAP assertions) and
`supabase/tests/phase1_class_foundation_concurrency.ps1` (one duplicate
membership insert succeeds and one receives SQLSTATE `23505`). A clean reset
passes all 72 database assertions; local lint and security/performance advisors
report no issues; `src/lib/supabase/database.types.ts` matches a fresh local
schema generation. No P1-02 migration was applied to a hosted project.

P1-01 remains unchecked pending environment-owner custom SMTP/deployed redirect
verification; hosted CI run `31029729582` passed quality, database, and local
Auth/Mailpit browser jobs on 2026-08-06. This implementation did not change
hosted Auth settings. Identity migration `20260805083021` was deployed to the
linked hosted development project and verified on 2026-08-05. No P1-02A hosted
migration or hosted Auth configuration change has been applied.

## Definition of done

All AUTH requirements pass their database, authorization, failure-state, mobile, and end-to-end checks; related roadmap and traceability entries include verification evidence.
