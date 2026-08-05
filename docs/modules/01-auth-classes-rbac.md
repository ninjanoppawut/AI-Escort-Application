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

The first identity migration is
`supabase/migrations/20260805083021_phase1_identity_foundation.sql`, with pgTAP
coverage in `supabase/tests/phase1_identity_foundation_test.sql` and generated
types in `src/lib/supabase/database.types.ts`. It establishes trusted student
profile bootstrap, identity/school/admin/teacher-invitation tables,
least-privilege grants, and RLS. Trusted teacher/admin provisioning RPCs,
classes, and class invites remain incomplete. P1-01 remains unchecked pending
environment-owner custom SMTP/deployed redirect verification; hosted CI run
`31029729582` passed quality, database, and local Auth/Mailpit browser jobs on
2026-08-06. This implementation did not change hosted Auth settings. Migration
`20260805083021` was deployed to the linked hosted development project and
verified on 2026-08-05.

## Definition of done

All AUTH requirements pass their database, authorization, failure-state, mobile, and end-to-end checks; related roadmap and traceability entries include verification evidence.
