# AGENTS.md

## Mission

Build the AI Escort Application described in `README.md` and `/docs`. Treat these files as the source of truth. When requirements conflict, use this priority:

1. Safety, privacy, and authorization
2. `docs/DECISIONS_AND_QUESTIONS.md` accepted decisions
3. `docs/PRODUCT_REQUIREMENTS.md`
4. `docs/SYSTEM_ARCHITECTURE.md`
5. Other documentation

Do not silently invent major product behavior. Record unresolved choices in `docs/DECISIONS_AND_QUESTIONS.md`.

## Required stack

- Next.js App Router with TypeScript and strict mode
- Supabase Auth, PostgreSQL, PostGIS, Realtime, Storage, Edge Functions
- Mapbox GL JS
- Tailwind CSS and shadcn/ui
- Zod for boundary validation
- React Hook Form for forms
- TanStack Query for server-state caching
- Vitest for unit tests and Playwright for critical flows

Pin dependencies and commit the lockfile.

## Repository structure

```text
apps/web/                 Next.js application
packages/domain/          Framework-independent domain types and rules
packages/database/        Generated DB types, queries, and migrations helpers
packages/map-core/        GeoJSON, route, geofence, and tracking utilities
packages/plant-plugin/    Plant survey plugin implementation
packages/ui/              Shared UI components
supabase/migrations/      SQL migrations
supabase/functions/       Edge Functions
docs/                     Product and technical specifications
```

For an initial single-app MVP, starting at the repository root is acceptable, but keep domain, data, and UI layers separate so migration to a monorepo remains possible.

## Non-negotiable rules

- Enable RLS on every exposed table.
- Never authorize with user-editable metadata.
- Never expose service-role or secret keys to the browser.
- Every update policy needs both `USING` and `WITH CHECK`.
- Database constraints must enforce critical invariants.
- Only one `active` group is allowed per exploration session.
- Students may only access classes and sessions where they are active members.
- Raw student location is private, session-scoped, and retained for a limited period.
- AI plant identification is a suggestion, not a verified answer.
- Every observation must preserve the original student answer, AI suggestion, peer suggestions, and final verification separately.

## Delivery workflow

For each feature:

1. Restate the user story and acceptance criteria.
2. Add or update schema and RLS policies first when data is involved.
3. Implement the smallest vertical slice.
4. Add tests for domain rules and authorization.
5. Run typecheck, lint, unit tests, and relevant end-to-end tests.
6. Update documentation and decision log.

## Definition of done

A feature is done only when:

- happy path and key failure states work;
- loading, empty, offline, and permission-denied states are handled;
- RLS behavior is tested with different users;
- mobile layout is usable;
- user-visible Thai text is clear and consistent;
- sensitive actions create audit events;
- documentation reflects the final behavior.

## First implementation task

Create the application foundation with:

- Next.js App Router
- environment validation
- browser and server Supabase clients
- authentication pages
- protected route groups
- profile bootstrap after sign-up
- role-aware dashboard redirect
- test setup
- CI for lint, typecheck, unit tests, and build

Do not implement fake authorization in the UI. All access must be supported by database membership and RLS.