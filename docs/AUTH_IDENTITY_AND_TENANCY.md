# Authentication, Identity, and Tenancy

## 1. Accepted approach

The MVP uses Supabase Auth email/password accounts with required email confirmation. Anonymous, phone, social, magic-link-only, and username-only authentication are out of scope.

Next.js uses `@supabase/ssr` with PKCE and request-scoped cookie clients. Protected server routes validate current signed claims with `getClaims()` and continue to authorize data through PostgreSQL RLS; an authentication cookie alone is not authorization.

Production must use custom SMTP. Supabase's default mail service is suitable only for local evaluation and does not provide the delivery or template guarantees required for real student/teacher accounts.

Current official implementation references:

- <https://supabase.com/docs/guides/auth/passwords>
- <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- <https://supabase.com/docs/guides/auth/auth-smtp>

## 2. Identity model

| Concept | Source of truth | Values |
|---|---|---|
| Auth identity | `auth.users` | verified email/password identity |
| Ordinary account type | `profiles.account_type` | `student`, `teacher` |
| Platform admin | `platform_admins` | active/revoked grant; never a class role |
| School membership | `school_memberships` | `student`, `teacher` |
| Class membership | `class_members` | `student`, `teacher` |
| Session authority | `session_participants` | immutable opened-session snapshot |

Account type, platform-admin grant, and membership role are trusted relational data. They are never read from `raw_user_meta_data` and cannot be supplied by a browser mutation.

## 3. Signup and confirmation

### Student

```text
Open class code/link/QR
→ retain only the opaque invite token and intended return path
→ sign up with real email + password
→ receive confirmation email
→ complete PKCE callback
→ bootstrap student profile
→ atomically consume class invite
→ enter class as student
```

A student may create an account without immediately joining a class, but receives no class data until a valid invite is consumed. Class join also creates an active student membership in the class's school when absent. The class invite never chooses teacher capability.

### Teacher

```text
Platform admin creates teacher invitation for school + email
→ teacher signs up/signs in with the same normalized email
→ confirms email
→ trusted operation consumes teacher invitation
→ profile becomes teacher and school membership is created
→ teacher may create a class
```

Teacher invitation use checks email equality after normalization, status, expiry, school status, and prior consumption inside one trusted transaction. A student cannot become a teacher by editing profile data or calling class creation directly.

### Platform admin

The first admin is bootstrapped by an audited deployment operation. Later admins are granted/revoked by an existing active admin through a server-only, reauthenticated operation. Platform admins must enroll TOTP MFA and satisfy `aal2` for admin routes.

## 4. Sign-in, session, and recovery

- Sign in uses verified email plus password.
- Unconfirmed accounts see a resend-confirmation state and cannot enter protected application routes.
- Password reset sends an email to a configured allowlisted redirect URL and completes through the PKCE recovery callback.
- Password-change and email-change security notifications are enabled in production.
- Server Components, Server Actions, route handlers, and proxy/middleware use request-scoped SSR clients.
- Cache headers must prevent authenticated responses from being cached across users.
- Sign-out clears application session cookies and local sensitive caches.
- Disabling an account revokes sessions before access is treated as removed; deleting an Auth user is not used as a routine classroom lifecycle action.

## 5. Password and abuse controls

- Minimum password length: 10 characters; allow long passphrases and password-manager paste.
- Do not require arbitrary uppercase/symbol composition rules.
- Use Supabase password strength/leaked-password protection where the selected plan supports it.
- Apply CAPTCHA and Supabase Auth rate limits to signup, sign-in, resend, and recovery flows.
- UI responses for signup/recovery do not reveal whether an arbitrary email is registered.
- After repeated `429` responses, honor `Retry-After`, back off with jitter, and show the mapped `RATE_LIMITED` UI state.
- Admin requires MFA; teacher/student MFA is optional for MVP.

## 6. Email delivery

Production SMTP must support confirmation, teacher invitation, password reset, email change, and security notification messages. Required configuration:

- verified sending domain with SPF, DKIM, and DMARC;
- Thai-first templates with a plain-text alternative;
- allowlisted Site URL and redirect URLs for production and preview environments;
- delivery/bounce monitoring without logging tokens or full confirmation URLs;
- separate local Mailpit capture for automated/manual development testing;
- environment-specific sender identities so preview mail cannot be confused with production.

## 7. Profile bootstrap

An Auth-user creation trigger may create the minimal profile row, but it must copy only safe identity fields and default `account_type='student'`. It never consumes invitations or grants teacher/admin capability. Trusted provisioning operations perform those transitions after email confirmation.

User-editable profile fields are limited to presentation fields such as display name and avatar reference. Email, account type, status, admin grants, and memberships are server-managed.

## 8. Tenant authorization

- Teacher school membership authorizes class creation inside that school.
- Class membership authorizes class-scoped reads.
- Group membership and leadership further constrain group mutations.
- Session participants authorize session-scoped student operations and completed-map access.
- Platform admin uses separate operations/read models and is not inserted into school/class membership merely to observe system health.
- Admin operational visibility is redacted by default and does not bypass Storage/live-location policies in normal flows.

## 9. Required errors

```text
AUTH_REQUIRED
EMAIL_REQUIRED
EMAIL_NOT_CONFIRMED
INVALID_CREDENTIALS
PASSWORD_POLICY_FAILED
AUTH_CALLBACK_INVALID
RECOVERY_LINK_INVALID
ACCOUNT_DISABLED
TEACHER_INVITE_REQUIRED
TEACHER_INVITE_INVALID
TEACHER_INVITE_EXPIRED
ADMIN_REQUIRED
MFA_REQUIRED
RATE_LIMITED
```

Exact UI behavior is defined in `UI_CONTRACTS.md` and the stable envelope in `API_AND_REALTIME.md`.

## 10. Verification

- Signup cannot reach protected routes before confirmation.
- PKCE callback rejects invalid/expired state and non-allowlisted redirects.
- Student cannot self-promote or create a class.
- Teacher invitation works only for the matching verified email and cannot be replayed.
- Revoked admin or teacher capability fails on the next authoritative check.
- Cross-school/class/session RLS tests use at least two tenants.
- SSR tests prove protected pages use validated claims rather than `getSession()` as authorization.
- Browser bundle inspection proves secret/service keys and SMTP credentials are absent.
