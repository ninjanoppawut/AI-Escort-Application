# Module Specifications

These files translate the canonical product documentation into build-sized feature contracts. They do not replace the product requirements, accepted decisions, database design, or API contracts.

## Precedence

When documents conflict, use the precedence in `AGENTS.md`. A module specification may narrow implementation scope, but it may not weaken a safety, privacy, authorization, data-integrity, or accepted product rule.

## Modules

| ID | Module | Primary phases |
|---|---|---|
| AUTH | [Authentication, classes, and RBAC](01-auth-classes-rbac.md) | 0–1 |
| NOT | [Notifications](02-notifications.md) | 2 and cross-cutting |
| GRP | [Student group formation](03-group-formation.md) | 3–4 |
| MGT | [Teacher group management](04-group-management.md) | 5 |
| SES | [Activities, sessions, and live map](05-activities-sessions-live-map.md) | 6–7 |
| OBS | [Observations, images, and offline behavior](06-observations-images-offline.md) | 8–9 and 14 |
| AI | [AI plant analysis](07-ai-plant-analysis.md) | 10 |
| REV | [Student submission and teacher review](08-teacher-review-revision.md) | 11–12 |
| MAP | [Completed map, exports, and research data](09-completed-map-exports.md) | 13–14 |
| ADM | [Platform admin operations](10-admin-operations.md) | 0, 1, and 15 |

## Required sections

Every module specification defines its outcome, scope, requirements, authorization boundary, states and failures, events, verification, dependencies, and definition of done. Requirement IDs are stable references used by `docs/ROADMAP.md` and `docs/TRACEABILITY_MATRIX.md`.

## Change rule

If implementation reveals a missing product decision, record it in `docs/DECISIONS_AND_QUESTIONS.md` before changing module behavior. Update the affected module, roadmap item, traceability row, and tests in the same change.
