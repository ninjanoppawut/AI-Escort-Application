# Test Strategy

## 1. Objective

Prove product behavior at the layer that owns correctness: PostgreSQL for invariants/RLS, trusted server contracts for validation/idempotency, workers for durable asynchronous behavior, and Playwright for user journeys and recovery states.

## 2. Test layers

| Layer | Tool | Owns |
|---|---|---|
| Pure unit | Vitest | Zod schemas, state machines, formatters, cursor/idempotency helpers, image rules |
| Database | pgTAP/SQL through local Supabase test commands | constraints, triggers, functions, RLS, indexes, transaction outcomes |
| Server integration | Vitest against local/test Supabase | server actions/routes, Auth callbacks, Storage, signed access, Realtime authorization |
| Worker integration | Vitest plus queue/provider fakes | queue idempotency, retries, schema validation, dead-letter behavior |
| Browser E2E | Playwright | role journeys, mobile states, offline/reconnect, concurrent clients, accessibility smoke |
| Operational | scripted checks | migration apply, advisor results, backup/restore, health/readiness, redaction |

Do not mock PostgreSQL behavior in tests whose purpose is RLS, locking, partial uniqueness, or transaction correctness.

## 3. Deterministic identity matrix

Seed synthetic identities only:

```text
admin_a
teacher_a / teacher_b
student_a1 / student_a2 / student_a3
student_b1 / student_b2
school_a / school_b
class_a / class_b
session_a / session_b
```

Fixtures include verified/unverified email, expired/active teacher invite, active/revoked admin, cross-school/class memberships, leader/member/unassigned group states, active/waiting session participants, owned/foreign observations, and submitted/reviewed histories.

Test emails use reserved example domains and local Mailpit. Never use real student names, locations, images, or email addresses.

## 4. Required database suites

- Every exposed table has RLS enabled and a deliberate grant posture.
- Positive owner/member/teacher/admin cases and same-role different-tenant denial.
- Update policies prove both `USING` and `WITH CHECK` behavior.
- Views use security-invoker semantics or are unexposed.
- Foreign keys used in joins/RLS are indexed.
- Append-only tables reject update/delete for ordinary roles.
- Functions set a fixed `search_path`, check the caller, and have explicit execute grants.
- Storage policies test insert/select/update/delete separately.
- Admin functions redact prohibited payloads.

Required races run repeatedly:

1. Final group slot.
2. Final invitation capacity slot.
3. One current group per student.
4. Leader transfer/removal.
5. One active session group.
6. Observation version update.
7. Review against changed submission.
8. Teacher/admin invitation replay.
9. Idempotency-key replay and same-key/different-body conflict.

Every race asserts final database state, not only API responses.

## 5. API and pagination contract tests

- One error envelope across all contracts with stable code, request ID, retryable flag, and safe details.
- POST mutations requiring `Idempotency-Key` replay the stored response for 24 hours.
- Same key/different request hash returns validation conflict without side effects.
- Cursor pagination uses `(created_at, id)` or documented stable sort keys, has no gaps/duplicates under inserts, defaults to 50, and caps at 100.
- `429` includes retry guidance and maps to the required UI.
- Additive fields do not break tolerant clients.
- Payload and time-range caps prevent unbounded admin/log/map responses.

## 6. Auth tests

- Signup, email confirmation, resend, sign-in/out, reset, and invalid/expired PKCE callback.
- Protected routes reject unconfirmed users.
- Server protection validates claims rather than trusting an unvalidated session cookie.
- Student cannot self-promote, create a teacher class, or call admin operations.
- Teacher invitation is email-bound, expiry-bound, atomic, and single-use.
- Revoked admin is denied and admin routes require MFA.
- Custom SMTP configuration is verified in staging; local flows use Mailpit.

## 7. Offline and Realtime tests

- Initial fetch plus private subscription plus authoritative refetch.
- Missed, duplicated, delayed, and reconnect signals do not corrupt state.
- Foreground, network reconnect, Realtime reconnect, and mutation completion refetch.
- Browser restart preserves IndexedDB observation/media queue.
- Duplicate delivery produces one observation/media/job.
- Authorization revoked before retry results in a recoverable denied state, not silent upload.

## 8. AI and image tests

- Orientation, dimensions, size, category, and 1–10 count validation.
- Cross-user private Storage denial and authorized signed access.
- Golden provider fixtures cover success, insufficient evidence, null/missing traits, malformed output, timeout, rate limit, and duplicate delivery.
- Every stored normalized payload declares a supported schema version.
- Failure and retry never delete/block the student's draft or manual-entry path.
- Browser bundle and logs contain no Gemini/service/SMTP secret.

## 9. Playwright projects

Minimum projects:

- student-mobile-chromium at 390 × 844;
- student-mobile-webkit at 390 × 844;
- student-small at 360 × 800;
- teacher-desktop-chromium at 1440 × 900;
- teacher-tablet-webkit at 1024 × 768;
- admin-desktop-chromium at 1440 × 900.

Critical E2E covers the 24 product acceptance scenarios plus authentication, class-member lists, manual plant entry, claim reset/unlock, cross-class observations, admin user/log diagnosis, and mapped error states.

## 10. CI gates

Pull requests run formatting, lint, strict typecheck, unit tests, database/RLS tests, integration tests, and production build. Playwright critical smoke runs on every pull request; the full browser/concurrency suite runs before phase exits and release.

Schema changes additionally run migration-from-empty, migration-from-current-baseline, generated-type diff, missing-FK-index query, and Supabase security/performance advisors where supported.

No flaky test is silently retried into green. A retry may collect evidence, but the underlying flake remains a failure until owned or quarantined with a dated issue.

## 11. Evidence

Add this record beneath a completed roadmap item or in its pull request:

```md
Evidence:
- Requirements: <stable requirement IDs>
- Implementation: <migration/RPC/UI paths>
- Tests: <test paths>
- Commands: <exact successful commands>
- Manual checks: <environment, viewport, role, and failure state>
- Migration: <version or not applicable>
- Advisors: <security/performance result or reason not applicable>
- PR/commit: <reference>
- Remaining risk: none | <specific accepted risk>
```

Never include credentials, signed URLs, real student data, or sensitive logs in evidence. A roadmap item remains unchecked until its required evidence exists.
