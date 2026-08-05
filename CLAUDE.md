# CLAUDE.md — Implementation Handoff

## Mission

Build the AI Escort Application from the accepted product documentation and completed design artifacts. Production implementation is now authorized; the earlier design-only restriction no longer applies.

Follow `AGENTS.md` for source precedence, security rules, stack requirements, repository discipline, and the definition of done. This file explains how to turn the design handoff into production code without weakening the documented behavior.

## Start here

Read in this order before changing a feature:

1. `AGENTS.md`
2. The current phase and prerequisites in `docs/ROADMAP.md`
3. The relevant module contract in `docs/modules/`
4. The matching rows in `docs/TRACEABILITY_MATRIX.md`
5. `docs/AUTH_IDENTITY_AND_TENANCY.md`, `docs/UI_CONTRACTS.md`, and `docs/PRIVACY_RETENTION_AND_RESEARCH.md`
6. Linked sections of `docs/DECISIONS_AND_QUESTIONS.md` and `docs/PRODUCT_REQUIREMENTS.md`
7. Relevant contracts in `docs/API_AND_REALTIME.md` and `docs/DATABASE_DESIGN.md`
8. `docs/NON_FUNCTIONAL_REQUIREMENTS.md`, `docs/ENVIRONMENTS_AND_OPERATIONS.md`, `docs/TEST_STRATEGY.md`, `docs/AI_EVALUATION.md`, and `docs/RESEARCH_EVENT_DICTIONARY.md`
9. `docs/SYSTEM_ARCHITECTURE.md`
10. Matching screens and states under `design/`

The Thai consolidated specification and `docs/PLANT_SURVEY_PLUGIN.md` provide domain context. They do not override the precedence in `AGENTS.md`.

## Current repository state

The repository contains product, architecture, module, roadmap, traceability, and design specifications. Application scaffolding and a dedicated linked Supabase project are still roadmap work. Do not point the application at an unrelated existing Supabase project.

Begin with Phase 0 in `docs/ROADMAP.md`; do not skip environment validation, CI, test infrastructure, or server/client boundaries.

## Implementation method

Work in vertical slices tied to stable requirement IDs:

```text
requirement and design state
→ schema/constraint/RLS
→ typed server contract or atomic RPC
→ UI and recovery states
→ audit/research event and notification
→ database/integration/browser verification
→ roadmap evidence
```

Use the build workflow in `AGENTS.md` for entry/exit discipline and retry limits, and `docs/TEST_STRATEGY.md` for concurrency harnesses, offline reconciliation, quality gates, and the evidence template.

For each slice:

- state the requirement IDs being implemented;
- preserve accepted behavior and immutable histories;
- enforce authorization and concurrency in PostgreSQL or trusted server code;
- validate browser input, database-boundary data, and AI output with Zod;
- use TanStack Query for authoritative server state and React Hook Form for forms;
- use private Realtime messages as invalidation signals followed by authoritative refetch;
- add loading, empty, offline, retry, stale, conflict, and permission-denied behavior where the module requires it;
- add tests before marking the roadmap item complete.

Avoid large horizontal passes such as “build all screens” or “add all tables” without a working authorized journey and its tests.

## Design implementation

The artifacts in `design/` are the visual and interaction handoff. Reuse their information architecture, flows, status language, and responsive intent while implementing maintainable components with Tailwind CSS and shadcn/ui.

Student experiences are mobile-first at 360–430 px and must work outdoors, one-handed, and under weak connectivity. Teacher experiences must remain usable on mobile and progressively enhance for tablet/desktop.

Preserve these design behaviors:

- Thai-first concise copy with support for English and italic scientific names;
- minimum touch targets near 44 × 44 CSS px;
- visible sync, upload, location, AI, and submission state;
- labels/icons/shapes in addition to color;
- no hover-only critical interaction;
- shallow role-aware navigation;
- map details that do not unnecessarily discard map context.

If a design artifact conflicts with a product, authorization, data-integrity, or accepted decision, follow `AGENTS.md` precedence and update the handoff note rather than implementing the conflict.

## Supabase implementation rules

- Use a dedicated development project or local Supabase stack and committed migrations.
- Enable RLS on every exposed table and write explicit ownership/membership predicates.
- Every update policy needs both `USING` and `WITH CHECK`.
- Never authorize with user-editable metadata or expose service-role/provider secrets.
- Prefer constraints and atomic transactions/RPCs for invariants and concurrency.
- Treat SECURITY DEFINER functions as exceptional: put them in a non-exposed schema, set a fixed `search_path`, check `auth.uid()`, and restrict execute grants.
- Keep Storage private and authorize object access from relational ownership/membership.
- Test private Realtime channel authorization as well as table access.
- Generate TypeScript database types after verified schema changes.

## Required first build sequence

1. Scaffold the pinned application and quality tooling.
2. Configure validated environment boundaries, Supabase SSR clients, local Mailpit, and production custom-SMTP requirements.
3. Link a dedicated development Supabase project or start the local stack.
4. Establish migrations, RLS-test helpers, multi-user fixtures, request/trace IDs, redaction, and generated types.
5. Implement verified-email AUTH and trusted teacher provisioning as the first vertical product slice.
6. Continue in `docs/ROADMAP.md` order, respecting dependencies and exit criteria.

Do not start Gemini integration until class/group authorization, session snapshots, observation ownership, private Storage, and lifecycle history are proven.

## Test and evidence expectations

Every completed slice should leave behind:

- schema/constraint tests when data changes;
- positive and negative RLS tests with multiple identities;
- concurrency tests for atomic invariants;
- unit tests for validation and state transitions;
- integration tests for server/RPC/queue boundaries;
- Playwright coverage for the happy path and key failure/recovery state;
- mobile viewport checks for student workflows;
- successful format, lint, strict typecheck, test, and production build commands;
- roadmap evidence and an accurate traceability row.

Use fake student data in development and tests. Never copy real student identity, location, images, or research data into fixtures, logs, screenshots, or AI prompts.

## Decision boundary

Proceed without asking for ordinary implementation choices when the documents already constrain the answer. Stop and request owner input only when a new choice materially affects privacy, consent, retention, grading, public sharing, paid-provider configuration, destructive production migration, emergency behavior, or another item explicitly listed as unresolved.

When a new decision is accepted, update `docs/DECISIONS_AND_QUESTIONS.md`, the affected module contract, `docs/TRACEABILITY_MATRIX.md`, and `docs/ROADMAP.md` in the same change.

## Completion

The application is ready for pilot consideration only after every global gate and required phase exit in `docs/ROADMAP.md` is checked with evidence and the remaining pilot-blocking decisions are resolved. A visually complete prototype is not a completed feature.
