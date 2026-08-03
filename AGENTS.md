# AGENTS.md

## Mission

Build the AI Escort Application described in `README.md` and `/docs`. Treat the documentation as the source of truth. When requirements conflict, use this priority:

1. Safety, privacy, and authorization
2. Accepted decisions in `docs/DECISIONS_AND_QUESTIONS.md`
3. `docs/PRODUCT_REQUIREMENTS.md`
4. `docs/SYSTEM_ARCHITECTURE.md`
5. Other documentation

Do not silently invent major behavior. Minor UI decisions may be made using a mobile-first design, but data, workflow, authorization, class/group, AI, image, and review rules must follow the documentation.

## Required stack

- Next.js App Router with TypeScript strict mode
- Supabase Auth, PostgreSQL, PostGIS, Realtime, Storage, Queues, and Edge Functions
- Mapbox GL JS
- Gemini behind a server-only provider adapter
- Tailwind CSS and shadcn/ui
- Zod for request, database-boundary, and AI-response validation
- React Hook Form for forms
- TanStack Query for server state
- IndexedDB abstraction for offline observation drafts and retry queues
- Vitest and Playwright

Pin dependencies and commit the lockfile.

## Non-negotiable class and group rules

- Class joining uses a validated code/link/QR invitation flow; the client cannot choose its role.
- Email is not required for the MVP.
- In-app notifications are durable database rows with private Realtime change signals.
- Teacher configures minimum group size, maximum group size, maximum group count, student creation enabled/disabled, and formation open/closed.
- Student group creation occurs only through an atomic database function that locks the class configuration.
- If two students race for the final group slot, exactly one succeeds.
- The student who creates a group becomes its first and only active leader.
- A student may belong to only one current group per class.
- A student may create only one student-created group per class unless a teacher explicitly resets the creation claim.
- A group with active members must have exactly one leader.
- Leaders invite classmates; classmates accept or decline. Do not force-add students through leader UI.
- Invitation acceptance revalidates membership and capacity.
- When the maximum group count is reached, disable Create Group with an explanation; do not silently hide it.
- Group-board UI uses initial fetch + private Realtime signal + authoritative refetch. Do not use five-second polling as the primary design.
- Refetch on foreground, network reconnect, Realtime reconnect, and mutation completion.
- Teacher may move students between groups, but destination capacity and active-session restrictions must be validated atomically.
- Moving a leader from a non-empty group requires a successor in the same operation.
- Teacher may delete an unused group. Groups with session history are archived, not hard-deleted.
- Opening a session snapshots current group membership and leadership. Later group changes never rewrite history.

## Non-negotiable observation rules

- Each observation is owned by one student.
- One session may have only one `active` exploration group at a time; enforce this in PostgreSQL.
- Students publish live location and create observations only while their group is active.
- The map marker location is the location captured when the observation begins/photo is captured.
- One observation supports 1–10 images.
- Before upload, oversized images are orientation-corrected, resized to a maximum 2,048 px longest edge, and compressed to a maximum 5 MB.
- Gemini processing is asynchronous and durable. A failed Gemini job must not delete or block the student's draft.
- Students may manually enter plant information and may use an external reference such as Google Lens.
- Submission requires a Thai/common name, scientific name, and short evidence note. `Unknown` is not an accepted final student submission.
- AI output, student checks/corrections, and teacher decisions are stored separately and never overwritten.
- Same-species matching inside the same session produces a warning, teacher tag, and teacher in-app notification; it never blocks submission automatically.
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
- Students access only their authorized class, group, session, notifications, and permitted observations.
- Leaders manage only their own unlocked group.
- Raw live location is session-scoped and private.
- Do not send other students' live locations to Gemini.
- Use private Storage buckets and signed/authorized image access.
- Sensitive actions and research-relevant actions create append-only events.

## Data-design rules

Use relational columns for identity, status, authorization, group membership, roles, joins, filtering, and map queries. Use `jsonb` for versioned flexible payloads such as normalized Gemini output, raw provider response references, student trait verification, notification context, device context, and research-event payloads.

Do not store a whole group or observation lifecycle in one mutable JSON document. Use append-only history/event tables for memberships, leadership changes, submissions, reviews, status changes, AI runs, and research events.

## UI responsibility

Claude or another coding agent may design the detailed student and teacher screens, but the result must be:

- mobile-first for students;
- usable in modern mobile Safari and Chrome;
- clear under weak connectivity;
- explicit about group-slot availability, invitation status, AI uncertainty, and sync status;
- status-color accessible using labels/icons in addition to color;
- optimized for the shortest classroom and field workflows.

## Definition of done

A feature is complete only when:

- database schema, constraints, RLS, and authorization tests exist;
- concurrency tests exist for final group slot, one leader, one group per student, and one active exploration group;
- happy path and key failure states work;
- loading, empty, offline, retry, and permission-denied states are handled;
- mobile layout is usable;
- audit/research events and notifications are emitted where specified;
- documentation is updated;
- lint, typecheck, tests, and build pass.
