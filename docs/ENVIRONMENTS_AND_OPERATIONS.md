# Environments and Operations

## 1. Environment model

| Environment | Purpose | Data | External delivery |
|---|---|---|---|
| Local | development and deterministic tests | synthetic seed only | Mailpit; fake Mapbox/Gemini where possible |
| Preview | pull-request UI/integration review | isolated synthetic data | no real student email; provider sandbox/strict caps |
| Staging | release candidate and operational verification | synthetic school-like fixtures | custom SMTP to allowlisted testers; capped real providers |
| Production | approved school use | real authorized data | production SMTP/providers under budgets and retention |

Production data never moves to local/preview. Staging may use anonymized generated fixtures that match production shape, not copied records.

Use separate Supabase projects or supported isolated branches for staging and production. Never connect AI Escort to an unrelated Supabase project.

## 2. Configuration and secrets

### Browser-safe

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_MAPBOX_TOKEN  # URL/domain-restricted public token
NEXT_PUBLIC_APP_ENV
```

### Server-only

```text
SUPABASE_SECRET_KEY
GEMINI_API_KEY
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
MAPBOX server token, if a server API requires it
OTEL_EXPORTER_OTLP_ENDPOINT
RELEASE_SHA
ADMIN_BOOTSTRAP control, used only by an audited one-off operation
```

Prefer current Supabase publishable/secret keys. Legacy `anon`/`service_role` keys are compatibility-only and should not be introduced into a new implementation.

Every environment validates configuration at process/worker startup with Zod. Never print secret values in validation errors. Rotate a credential after suspected exposure and update the incident record.

The production environment requires the complete SMTP group above. A partial
SMTP group is invalid in every environment. Local Supabase uses Mailpit instead
of external SMTP.

The committed local Supabase stack uses ports `54620`–`54629`, with Studio at
`http://127.0.0.1:54623` and Mailpit at
`http://127.0.0.1:54624`. The intended hosted development project is
`https://rhntelxdmuvldrxyceqx.supabase.co`; its publishable key belongs only in
an ignored local/deployment environment file. CLI authentication and link state
are per-developer and are not committed.

## 3. Deployment flow

```text
pull request
→ CI quality/database/browser gates
→ preview deployment
→ approved merge
→ staging migration and smoke tests
→ security/performance advisors
→ production migration
→ production application/Edge Function deploy
→ readiness and critical-journey smoke
→ monitor release dashboard/error budget
```

Database migrations are forward, reviewed, and committed. Create migration files with the installed Supabase CLI command discovered through `--help`; do not invent filenames. Generate database types after verified schema changes.

## 4. Migration and rollback

- Prefer expand/migrate/contract changes that allow old and new application versions to overlap.
- Add nullable/new structures first, backfill in bounded batches, switch readers/writers, then remove obsolete structures in a later release.
- Avoid long table rewrites and external provider calls inside database transactions.
- Lock multi-row resources in a consistent order and keep transactions short.
- A failed application release rolls back application code only when the applied migration remains backward compatible.
- Destructive schema rollback requires a reviewed forward repair or verified restore plan; never improvise production `DROP`/mass delete.
- Before a destructive migration, record affected tables/rows, backup/restore point, owner approval, rollback command, and validation query.

## 5. Backup and recovery

Before pilot, verify the selected Supabase plan meets RPO ≤ 24 hours and RTO ≤ 8 hours. Document enabled backups/PITR, Storage recovery limitations, and named restore owner.

Quarterly staging drill:

1. Restore the most recent recoverable database point into an isolated environment.
2. Verify migrations, Auth/profile joins, private Storage references, and core counts.
3. Run class join, group invariant, session snapshot, observation, and review smoke tests.
4. Record achieved RPO/RTO and gaps.
5. Delete the isolated restore according to retention policy.

## 6. Health and telemetry

- Liveness checks only in-process responsiveness; it never queries Supabase or providers.
- Readiness checks critical configuration and dependency reachability without exposing secrets.
- APIs record RED metrics by route template, method, status class, flow, and environment.
- Queues record depth, oldest-message age, claim rate, retry rate, dead-letter count, and processing duration.
- Gemini records request rate, success/failure category, queue latency, provider latency, and normalized-schema failures.
- Realtime records authorized connection/subscription success and reconnect rate.
- Storage records upload success/failure/bytes and preprocessing categories.
- Metrics never label by user/class/session/observation/request/trace ID.
- Logs/traces carry request/trace IDs under access control and use the retention schedule.

Telemetry must be asynchronous and may drop/summarize successful detail under pressure rather than slow the classroom path.

## 7. SLOs and alerts

Use targets in `NON_FUNCTIONAL_REQUIREMENTS.md`. Page on user-facing fast burn or security-critical events, not ordinary CPU thresholds.

Initial pages:

- sustained auth/class-join failure affecting multiple users;
- core API 5xx/error-budget fast burn;
- observation writes/uploads failing across users;
- queue oldest-message age above the Gemini degraded threshold with manual fallback affected;
- one-active-group or group-integrity invariant violation;
- suspected authorization/data exposure;
- production custom SMTP broadly failing confirmation/recovery.

Warnings/tickets:

- cost at 70%/90% of monthly envelope;
- connection/storage/provider saturation;
- slow SLO burn;
- backup/restore drill overdue;
- retention deletion job failures;
- high Realtime reconnect or AI schema-rejection rate.

Every alert has an owner, severity, dashboard link, and runbook. Correlated cause alerts are grouped so one outage does not create an alert storm.

## 8. Admin operations console

The admin console provides:

- account/school/class directory and status;
- flow funnel counts and failure rates;
- error explorer by stable code, flow/stage, release, environment, and correlation ID;
- queue/AI/upload/Realtime health;
- audit event explorer;
- incident acknowledgement and append-only notes;
- teacher provisioning and admin grant history.

Default window is 24 hours. Directory and log results use cursor pagination (50 default, 100 maximum). Expensive searches require a bounded time range.

Routine views redact exact coordinates, evidence free text, secret material, access/refresh tokens, cookies, provider raw payloads, and signed/private image URLs. Admin actions themselves are audit events.

## 9. Incident response

```text
detect
→ assign severity/incident owner
→ protect users and contain exposure
→ preserve redacted evidence/correlation IDs
→ communicate affected capability and workaround
→ restore and verify
→ document timeline/root cause
→ add regression test/runbook change
```

For suspected privacy/security exposure, revoke relevant sessions/keys, stop the leaking path, preserve audit evidence, and notify the named privacy/security owner. Do not paste sensitive payloads into chat, tickets, or roadmap evidence.

## 10. Release checklist

- Migrations and generated types match.
- RLS/advisor results reviewed.
- Custom SMTP and allowlisted redirects verified.
- Environment variables validated; browser bundle inspected for secrets.
- Critical role and mobile smoke tests pass.
- Queue/Edge Functions report ready.
- Dashboards show the new release/version.
- Rollback/forward-repair path recorded.
- Retention jobs and backup status healthy.
- No global roadmap gate or pilot blocker is unresolved.
