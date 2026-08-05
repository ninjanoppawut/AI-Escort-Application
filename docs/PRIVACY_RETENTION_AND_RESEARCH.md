# Privacy, Retention, and Research

## 1. Purpose and status

AI Escort processes student identity, plant images, precise location, AI output, teacher decisions, and research events. This document sets privacy-minimizing MVP engineering defaults. A school/privacy owner must approve or shorten them before pilot; this document is not a substitute for jurisdiction-specific legal review.

## 2. Purpose limitation

Classroom operation and optional research are separate purposes.

Classroom operation includes authentication, class/group management, live field safety/coordination, observation creation, AI assistance, teacher review, completed map, audit, and support.

Research use requires a separate approved instrument and consent basis. Refusing optional research use must not prevent required classroom participation unless the school explicitly determines otherwise under its policy.

## 3. Consent and notice

Before a pilot, the school/privacy owner documents:

- target student ages and who may consent;
- guardian consent and student assent requirements;
- required versus optional processing;
- who sees names, images, locations, AI output, peer observations, and review history;
- provider processing and cross-border transfer disclosures;
- retention/deletion schedule and contact path;
- withdrawal/correction process and effect on research data already aggregated;
- incident notification responsibility.

The field-mode notice must clearly state that named live location is visible to the class teacher while the group/session is active. The completed-map notice must state that session participants can see peer plant images and recorder names as accepted in D-055.

## 4. Data minimization

- Store capture location for the plant record; do not store submission location for normal behavior.
- Broadcast live location only for authorized active participation and stop on pause/completion/deactivation as documented.
- Do not send other students' locations or unrelated profile data to Gemini.
- Avoid student free text, exact coordinates, image URLs, email, or direct IDs in metrics.
- Use relational identifiers in protected audit records and pseudonymous research subject IDs in research exports.
- Collect device context only when it answers a reliability/research question.
- Operational logs redact before persistence.

## 5. Default retention schedule

Retention is measured from record creation or the listed lifecycle event. A school may require shorter periods. Legal/security holds require an explicit owner, reason, scope, and expiry.

| Data category | Default | End-of-life action |
|---|---:|---|
| Ephemeral Presence/Broadcast state | not durably retained | expires with channel/session |
| Raw precise live-location samples | 30 days after session completion | hard delete or irreversibly aggregate |
| Derived location tracks | 90 days after session completion | delete unless separately consented research requires pseudonymized derivative |
| Observation capture location/time | 24 months after academic year end | delete/anonymize with observation lifecycle |
| Processed observation images | 24 months after academic year end | delete private objects and derivatives |
| Observation/submission/review learning record | 24 months after academic year end | delete or anonymize under approved school policy |
| Raw Gemini/provider payload reference | 90 days after final teacher decision | delete raw payload/reference |
| Normalized AI result and provenance | follows observation record | delete/anonymize with observation |
| Notifications | 180 days | hard delete expired rows |
| Export artifacts and signed access | 7 days | delete object; revoke/expire access |
| Issue reports/unlock requests | 12 months after resolution | delete/anonymize reporter where permitted |
| Operational error logs/traces | 30 days | delete; keep only approved aggregate metrics |
| Security/admin/audit logs | 12 months | delete unless active investigation/hold |
| Research events with direct operational IDs | 12 months | transform to approved pseudonymous dataset or delete |
| Approved pseudonymized research dataset | 24 months after study close | delete or archive only under approved protocol |

Deletion jobs are idempotent, auditable, and report failures without copying deleted content into logs.

## 6. Access matrix

| Data | Student owner | Session peer | Class teacher | Platform admin normal view |
|---|---|---|---|---|
| Own draft/media | yes | no | only where workflow explicitly permits | no |
| Submitted/completed observation | yes | completed-session visibility | yes | metadata/status only |
| Peer image/name | after session completion per D-055 | yes within same session | yes | no by default |
| Live named location | own state | no | active class session only | aggregate health only |
| AI/student/teacher evidence | own permitted record | completed detail as permitted | yes | state/error metadata only |
| Audit/operational log | own user-facing history only | no | class-relevant product history where specified | redacted global operational view |

Platform-admin break-glass access is not ordinary RLS bypass. It is a time-bounded, reasoned, reauthenticated, independently audited operation with the minimum resource scope.

## 7. Data-subject and school operations

Support authenticated requests to export/correct/delete permitted profile and learning records subject to school policy, research commitments, and immutable audit needs. A request records requester, authority, scope, decision, completion, and exceptions without storing unnecessary identity documents.

Routine student leaving or class closure does not immediately delete historical session/submission/review records. It removes future authorization while retention policy governs history.

## 8. Provider controls

- Configure Supabase, hosting, Mapbox, Gemini, SMTP, and telemetry regions/settings according to the approved deployment policy.
- Execute required data-processing agreements before real student data.
- Disable provider training/data reuse where available and contractually appropriate.
- Send Gemini only processed authorized observation images and minimum plant-analysis context.
- Store provider/model/prompt/schema versions, not secret credentials.
- Review subprocessors and transfer implications before pilot.

## 9. Research event governance

The current operational event envelope and allowed MVP payloads are defined in `RESEARCH_EVENT_DICTIONARY.md`.

Every research event has a documented question, minimal fields, schema version, and retention. The research dictionary defines:

- event name and trigger;
- actor/resource pseudonymous identifiers;
- allowed payload fields and units;
- whether the event is required for operation or optional research;
- consent basis;
- retention and export treatment;
- validation and missing-data semantics.

Do not add events merely because they may be useful later. Final instruments, scales, and export variables remain a pilot blocker until approved.

## 10. Verification

- RLS/Storage/Realtime tests implement the access matrix.
- Session state changes stop live publication.
- Gemini request fixtures contain no unrelated student/location data.
- Log redaction tests reject tokens, secrets, signed URLs, precise coordinates, and prohibited free text.
- Retention jobs are tested against each category, retry safely, and preserve required audit summaries.
- Export tests prove pseudonymization and role authorization.
- Admin break-glass tests prove expiry, scope, MFA, reason, and audit.

## 11. Pilot approval record

Before production/pilot, record the approving school/privacy owner, approval date, student age group, consent artifacts, chosen provider settings, any shortened retention values, research protocol version, and incident contact in deployment-owned documentation—not in public source files if it contains personal contact details.
