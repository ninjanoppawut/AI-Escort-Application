# ADM — Platform Admin Operations

## Outcome

A trusted platform administrator can provision schools/teachers and diagnose failing product flows from redacted, correlated operational evidence without becoming a class member or receiving routine access to sensitive student content.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §2 Admin
- `docs/DECISIONS_AND_QUESTIONS.md` D-030, D-061–D-064
- `docs/ENVIRONMENTS_AND_OPERATIONS.md`
- `docs/PRIVACY_RETENTION_AND_RESEARCH.md`
- `docs/API_AND_REALTIME.md` admin operations contracts
- `docs/DATABASE_DESIGN.md` identity, admin, audit, and operational-event tables

## Scope

In scope: platform-admin bootstrap/revocation, school provisioning, teacher invitation/approval, teacher/student directory, school/class/session lookup, redacted audit/error explorer, flow health dashboard, queue/AI/upload/Realtime diagnostics, incident acknowledgement/notes, and audited break-glass request records.

Out of scope: ordinary class teaching actions, editing student submissions or teacher decisions, reading passwords/tokens/secrets, general browsing of private images or precise live locations, and silently impersonating users.

## Functional requirements

- **ADM-001:** Platform-admin authorization comes only from an active protected relational grant and is never derived from user-editable metadata.
- **ADM-002:** An admin can create/archive schools and issue/revoke teacher invitations to verified email addresses.
- **ADM-003:** An admin can list/search teacher and student profiles with school/class membership summaries using bounded cursor pagination.
- **ADM-004:** An admin can inspect append-only audit events by time, actor, flow, resource, outcome, and correlation ID.
- **ADM-005:** An admin can inspect redacted application errors and traces by flow, stable error code, release, environment, and request/trace ID.
- **ADM-006:** The dashboard shows low-cardinality RED metrics for API flows and queue/worker saturation, age, retry, dead-letter, and provider-failure metrics.
- **ADM-007:** Admin views identify the failing stage of class join, group formation, session control, observation/media, AI, submission/review, Realtime, and export flows.
- **ADM-008:** Admin can acknowledge an operational incident and append a note; source logs, audit events, and research events are never edited.
- **ADM-009:** Every admin read, export, grant, revoke, provisioning action, incident note, and break-glass request is audited.
- **ADM-010:** Routine admin views redact secrets, tokens, signed URLs, student evidence text, private image payloads, and precise live-location coordinates.
- **ADM-011:** Sensitive-content access, when institutionally authorized, uses a time-bounded reasoned break-glass grant, requires reauthentication, and produces an immutable audit trail.
- **ADM-012:** Admin list and log queries are cursor-paginated, default to 50 rows, cap at 100, and enforce a maximum time range for expensive searches.

## Authorization and data boundary

- `platform_admins` is not exposed for ordinary client mutation.
- Admin reads use narrowly scoped server-only operations or protected database functions/views; the service/secret key is never placed in the browser.
- Security-invoker views are preferred. Any required SECURITY DEFINER function lives in a non-exposed schema, uses a fixed empty `search_path`, checks `auth.uid()`, and has explicit execute grants.
- Metrics never use user, class, session, observation, request, or trace IDs as metric labels; those high-cardinality values belong only in access-controlled logs/traces.
- Logs are asynchronous and redacted before persistence or export.

## Required states and failures

Not authorized, admin grant revoked, email already provisioned, teacher invitation expired, empty results, invalid cursor, time range too large, log source unavailable, partial telemetry, queue degraded, incident acknowledged, break-glass required, and break-glass expired are explicit.

## Verification

- Non-admin denial for every admin operation.
- Admin grant/revoke and teacher-provisioning tests.
- Redaction tests using seeded secrets, signed URLs, image metadata, and coordinates.
- Cursor and maximum-range tests for directories/logs.
- Audit tests proving admin reads and writes are append-only and attributable.
- Dashboard tests for request errors, queue age/dead letters, provider failures, and partial telemetry.

## Dependencies

AUTH, audit/operational event foundations, request/trace IDs, environment/release metadata, AI queue metrics, and accepted privacy/retention configuration.

## Definition of done

The admin can answer who is affected, which flow/stage failed, when it began, and the correlated evidence needed for diagnosis without receiving routine access to prohibited sensitive data.
