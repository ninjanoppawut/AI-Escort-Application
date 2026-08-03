# AGENTS.md

## Mission

Build the AI Escort Application described in `README.md` and `/docs`. Treat the documentation as the source of truth. When requirements conflict, use this priority:

1. Safety, privacy, and authorization
2. Accepted decisions in `docs/DECISIONS_AND_QUESTIONS.md`
3. `docs/PRODUCT_REQUIREMENTS.md`
4. `docs/SYSTEM_ARCHITECTURE.md`
5. Other documentation

Do not silently invent major behavior. Minor UI decisions may be made using a mobile-first design, but data, workflow, authorization, AI, image, and review rules must follow the documentation.

## Required stack

- Next.js App Router with TypeScript strict mode
- Supabase Auth, PostgreSQL, PostGIS, Realtime, Storage, Queues, and Edge Functions
- Mapbox GL JS
- Gemini behind a server-only provider adapter
- Tailwind CSS and shadcn/ui
- Zod for request, database-boundary, and AI-response validation
- React Hook Form for forms
- TanStack Query for server state
- IndexedDB abstraction for offline drafts and retry queues
- Vitest and Playwright

Pin dependencies and commit the lockfile.

## Non-negotiable product rules

- Each observation is owned by one student.
- One session may have only one `active` group at a time; enforce this in PostgreSQL.
- Students publish live location and create observations only while their group is active.
- The map marker location is the location captured when the observation begins/photo is captured.
- One observation supports 1–10 images.
- Before upload, oversized images are orientation-corrected, resized to a maximum 2,048 px longest edge, and compressed to a maximum 5 MB.
- Gemini processing is asynchronous and durable. A failed Gemini job must not delete or block the student's draft.
- Students may manually enter plant information and may use an external reference such as Google Lens.
- Submission requires a Thai/common name, scientific name, and short evidence note. `Unknown` is not an accepted final student submission.
- AI output, student checks/corrections, and teacher decisions are stored separately and never overwritten.
- Same-species matching inside the same session produces a warning and teacher tag; it never blocks submission automatically.
- Potential same-specimen matching may use species, morphology, image similarity, location, and time, but must never rely on distance alone or auto-merge observations.
- Teacher review is manual. The teacher may verify, correct, request revision, mark unable to verify, or reject.
- Revision edits the same observation and creates a new revision/submission-history record.
- The teacher manually completes the session/activity.
- After completion, participating students and authorized teachers can view the observation map and click markers to open plant details.

## Security rules

- Enable RLS on every exposed table.
- Never authorize with user-editable metadata.
- Never expose service-role, Gemini, or other secret keys to the browser.
- Every update policy needs both `USING` and `WITH CHECK`.
- Students access only their authorized class, session, and permitted observations.
- Raw live location is session-scoped and private.
- Do not send other students' live locations to Gemini.
- Use private Storage buckets and signed/authorized image access.
- Sensitive actions and research-relevant actions create append-only events.

## Data-design rules

Use relational columns for identity, status, authorization, joins, filtering, and map queries. Use `jsonb` for versioned flexible payloads such as normalized Gemini output, raw provider response references, student trait verification, device context, and research-event payloads.

Do not store the whole observation lifecycle in one mutable JSON document. Use append-only history/event tables for submissions, reviews, status changes, and AI runs.

## UI responsibility

Claude or another coding agent may design the detailed student and teacher screens, but the result must be:

- mobile-first for students;
- usable in modern mobile Safari and Chrome;
- clear under weak connectivity;
- explicit about AI uncertainty and sync status;
- status-color accessible using labels/icons in addition to color;
- optimized for the shortest field workflow.

## Definition of done

A feature is complete only when:

- database schema, constraints, RLS, and authorization tests exist;
- happy path and key failure states work;
- loading, empty, offline, retry, and permission-denied states are handled;
- mobile layout is usable;
- audit/research events are emitted where specified;
- documentation is updated;
- lint, typecheck, tests, and build pass.