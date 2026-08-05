# AI — Durable Plant Analysis

## Outcome

Gemini analysis runs asynchronously behind a server-only adapter, produces a versioned validated provisional result, and never blocks or destroys the student's manual workflow.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §§9, 13
- `docs/PLANT_SURVEY_PLUGIN.md` §§5–7
- `docs/DECISIONS_AND_QUESTIONS.md` D-007–D-012
- `docs/API_AND_REALTIME.md` §§15–16
- `docs/DATABASE_DESIGN.md` §10
- `docs/AI_EVALUATION.md`

## Scope

In scope: analysis request, durable queue message, Edge Function consumer, Gemini adapter, prompt/model/schema versioning, Zod validation, normalized result, retry/idempotency, failure state, and student status notification.

Out of scope: browser-to-Gemini calls, automatic verification, destructive draft cleanup, training on student data, and a separate worker/Kubernetes/GPU platform for MVP.

## Functional requirements

- **AI-001:** An authorized observation owner can request analysis only after required media is durably available.
- **AI-002:** The request creates an `ai_analysis_runs` row and durable queue message using an idempotency key.
- **AI-003:** A Supabase Queue consumer invokes Gemini through a server-only provider adapter; provider keys and raw credentials never reach the browser.
- **AI-004:** Each run records provider, model, prompt version, schema version, timestamps, attempt count, status, and sanitized error information.
- **AI-005:** Provider output is parsed and validated with a version-specific Zod schema before becoming a normalized AI result.
- **AI-006:** Raw provider response references and normalized output are stored separately from student verification and teacher decisions.
- **AI-007:** Confidence presentation follows the configured thresholds while always labeling output provisional and retaining manual entry.
- **AI-008:** Retry is bounded, idempotent, observable, and supports dead-letter/manual retry handling.
- **AI-009:** A failed or invalid analysis leaves the observation draft and images intact and usable.
- **AI-010:** Gemini receives only authorized observation media/context and never receives other students' live locations.

## Security and privacy boundary

Queue producers, consumers, and result writes use least privilege. Logs omit secrets, signed URLs, and unnecessary student identifiers. Raw provider payload retention follows the production retention decision. All AI responses are untrusted input and pass schema validation.

## Required states and failures

Queued, running, delayed, insufficient evidence, invalid provider response, rate limited, transient failure, permanent failure, retrying, succeeded, and manual-entry fallback are explicit.

## Verification

- Queue idempotency and duplicate-delivery tests.
- Provider adapter contract tests with malformed/partial responses.
- Zod schema-version validation tests.
- Retry/dead-letter and draft-preservation tests.
- Secret-boundary test proving browser bundles contain no provider/service keys.

## Dependencies

OBS media readiness, Supabase Queues/Edge Functions, server environment validation, and NOT status delivery.

## Definition of done

The asynchronous path survives browser closure and provider failure, records complete provenance, validates every output, and preserves manual student control.
