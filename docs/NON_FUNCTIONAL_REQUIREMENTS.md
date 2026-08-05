# Non-Functional Requirements

## 1. Status and assumptions

These are MVP engineering targets for the first 12 months. They are deliberately modest and revisable after measured pilot usage. They size the architecture without authorizing paid resource changes by themselves.

## 2. Capacity envelope

| Input | 12-month target |
|---|---:|
| Schools | 10 active schools |
| Registered accounts | 5,000 |
| Daily active users | 1,000 |
| Peak concurrent authenticated users | 500 |
| Simultaneous live sessions | 50 |
| Students per class | 50 typical, 100 hard design limit |
| Groups per class | 10 typical, 25 hard design limit |
| Observations per student per session | 5 typical, 20 hard design limit |
| Images per observation | 3 typical, 10 hard limit |
| Processed image size | 1.5 MB planning average, 5 MB hard limit |
| Peak factor | 5× daily average during scheduled field periods |

Crossing 70% of any hard capacity target triggers a measurement review before raising limits.

## 3. Latency and freshness targets

Targets apply at p95 over a rolling 30-day pilot window unless stated otherwise.

| Journey | Target |
|---|---:|
| Authenticated page/read-model response | ≤ 800 ms |
| Ordinary mutation excluding media/AI | ≤ 1.5 s |
| Atomic group/session mutation | ≤ 2 s including contention |
| Group/notification committed change visible after refetch | ≤ 3 s |
| Teacher live-location freshness while connected/moving | ≤ 5 s |
| Processed image upload start feedback | ≤ 1 s |
| Gemini job begins after durable enqueue | ≤ 10 s at p95 |
| Gemini normalized result | ≤ 90 s at p95; manual entry always available |
| Completed map initial usable view | ≤ 3 s for 500 markers |
| Admin flow dashboard | ≤ 3 s for default 24-hour window |

API p99 must remain below 3× its p95 target. Averages are not release criteria.

## 4. Availability and degraded behavior

- Core authenticated classroom and observation services target 99.5% monthly availability during pilot.
- AI analysis is excluded from core availability because manual entry is an accepted degraded mode.
- Realtime degradation falls back to authoritative foreground/reconnect/mutation refetch; optional slow polling may be used where documented.
- Map tile/provider degradation preserves lists, observation capture, and saved drafts where feasible.
- Email delivery degradation blocks new confirmation/recovery but must not sign out valid active sessions.
- Offline observation drafts must survive browser restart and reconnect without duplicate server records.

## 5. Consistency and durability

- Strong transactional consistency is required for class invite consumption, group slots/capacity/leadership, session activation, immutable submission/review versions, and admin grants.
- Read-your-write behavior is required after a successful mutation through returned data or immediate authoritative refetch.
- Realtime and admin metrics may be eventually consistent; their UI must show freshness.
- A success response is not returned until the authoritative PostgreSQL mutation is committed.
- Pilot disaster-recovery targets: RPO ≤ 24 hours and RTO ≤ 8 hours, subject to the selected Supabase plan and verified restore procedure.
- Offline local drafts target zero loss after IndexedDB acknowledgement on the same device.

## 6. Security and privacy qualities

- All exposed tables use RLS; all privileged operations are separately authorized and audited.
- Admin routes require active platform-admin grant plus MFA at `aal2`.
- Secrets never enter browser bundles, logs, research payloads, or roadmap evidence.
- Operational logs are redacted before storage; precise live location and private image URLs are prohibited in general logs.
- Auth, admin, Storage, and destructive/sensitive operations receive negative authorization tests.
- Critical dependency and application security updates are reviewed within 7 days and high-severity fixes are prioritized immediately.

## 7. Accessibility and client support

- Student critical journeys support current and previous major mobile Safari and Chrome releases.
- Teacher desktop supports current and previous major Chrome, Edge, and Safari releases.
- Student layouts pass at 360, 390, and 430 CSS px without horizontal scrolling in primary flows.
- Text/touch targets meet documented accessibility requirements; status never relies on color alone.
- Thai is the default locale; mixed Thai/English/scientific names and Asia/Bangkok display time are supported.

## 8. Cost guardrail

The working pilot envelope is THB 5,000 per month across Supabase, hosting, Mapbox, Gemini, SMTP, and telemetry, excluding one-time domain costs. Alert at 70% and 90%; do not raise a paid limit or enable an add-on that can exceed the envelope without owner approval.

AI requests enforce per-user/session limits and image preprocessing before provider calls. Map and image delivery use caching/derivatives to control repeated transfer.

## 9. Observability targets

- Every request has a request ID; multi-hop async flows also carry a trace/correlation ID.
- Metrics use route templates and low-cardinality flow/stage/error dimensions.
- Keep 100% of error traces during pilot when practical; sample successful traces when volume requires it.
- Page only on user-facing fast SLO burn or security-critical failure; cause/resource thresholds create tickets/dashboard warnings.
- Every page has an owner and runbook.

## 10. Reassessment triggers

Recalculate capacity and targets when a pilot exceeds 70% of the envelope, a new school cohort changes usage shape, p95 misses persist for seven days, provider cost exceeds 70% of budget, or retention/consent requirements change.
