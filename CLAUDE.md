# CLAUDE.md

## Mission

Build the AI Escort Application as a production-minded, mobile-first MVP for school plant-exploration activities.

Read the repository documentation before changing architecture or implementing features. The existing product decisions are authoritative. Your job is to convert those decisions into a coherent, secure, maintainable application while making sensible implementation and visual-design choices where the documentation intentionally leaves freedom.

## Source-of-truth priority

When instructions conflict, follow this order:

1. Security, privacy, authorization, and data preservation
2. `docs/DECISIONS_AND_QUESTIONS.md`
3. `docs/PRODUCT_REQUIREMENTS.md`
4. `docs/SYSTEM_ARCHITECTURE.md`
5. `docs/DATABASE_DESIGN.md`
6. `docs/API_AND_REALTIME.md`
7. `docs/PLANT_SURVEY_PLUGIN.md`
8. `docs/IMPLEMENTATION_PLAN.md`
9. `docs/สรุประบบ_AI_ESCORT_ภาษาไทย.md`
10. `AGENTS.md`
11. This file for implementation and design freedom not already decided above

Do not reopen accepted product decisions unless implementation reveals a genuine security, data-integrity, privacy, or technical impossibility.

## Product summary

The application allows teachers to:

- create classes and invite students using a code, link, or QR code;
- configure group size, group limits, and group-formation state;
- manage groups, leaders, members, activities, routes, boundaries, checkpoints, and exploration sessions;
- activate one exploration group at a time;
- monitor active students on a live map;
- review submitted plant observations;
- request revision, correct, verify, reject, or mark an observation unable to verify;
- complete a session manually;
- view a completed map where markers open plant details.

The application allows students to:

- join a class;
- create one group while a slot remains and automatically become its leader;
- invite classmates using in-app notifications;
- accept or decline group invitations;
- participate when their group is active;
- capture an individual plant observation with location, time, and 1–10 images;
- receive provisional Gemini analysis;
- compare AI results with the real plant and correct them;
- enter required Thai/common and scientific names;
- submit even when the same species already exists in the session after acknowledging the warning;
- revise and resubmit the same observation when requested;
- view the completed result map and plant details.

## Non-negotiable domain rules

- One observation belongs to one student.
- One session may have only one active exploration group at a time.
- One student may belong to only one current forming/active group per class.
- One group has exactly one active leader.
- The student who successfully creates a group becomes its leader.
- A student cannot create multiple groups in the same class.
- Group-slot claims must be atomic; the UI is never the authority.
- Group creation becomes disabled when the configured maximum is reached.
- Teachers may move students, transfer leadership, delete unused groups, and archive historical groups.
- Historical session participation must remain unchanged through participant snapshots.
- In-app notifications are the MVP communication method; email is not required.
- Realtime events are invalidation signals; PostgreSQL remains the source of truth.
- Realtime does not replace transactions, constraints, RLS, or authoritative refetching.
- Draft observations do not appear on the teacher map.
- Plant markers use capture location, not submission location.
- Gemini is provisional and never verifies an observation automatically.
- Gemini failure must not destroy or block a student draft.
- Students may enter information manually and may consult external tools such as Google Lens.
- Submission requires a Thai/common name, scientific name, and evidence note.
- Same-species detection within the same session warns and tags the teacher but does not block submission.
- Same species and same physical specimen are separate concepts.
- Never auto-merge, auto-delete, or auto-reject observations because of duplicate detection.
- Teacher decisions and corrections must preserve original AI and student values.
- Revision updates the same observation while creating immutable submission/revision history.
- The teacher manually completes the activity/session.

## Required technical direction

Use the stack and patterns defined in the repository documentation, including:

- Next.js App Router
- TypeScript strict mode
- Supabase Auth
- PostgreSQL and PostGIS
- Supabase Realtime
- Supabase Storage
- Supabase Queues and Edge Functions
- Mapbox GL JS
- Gemini behind a server-only adapter
- Tailwind CSS and shadcn/ui
- Zod
- React Hook Form
- TanStack Query
- IndexedDB for offline drafts and retry queues

Do not expose service-role, Gemini, Mapbox secret, or other privileged keys to the browser.

## Mobile-first design authority

You may design the detailed student and teacher interfaces. Make concrete design decisions instead of leaving placeholder screens.

The student experience is the highest mobile priority. Design first for a phone held outdoors with one hand, intermittent connectivity, glare, and limited attention.

### Student design requirements

- Optimize primary screens for approximately 360–430 px viewport widths.
- Keep primary actions reachable near the lower half of the screen.
- Use large touch targets of at least 44 x 44 CSS pixels.
- Avoid hover-dependent interactions.
- Avoid dense desktop tables on mobile.
- Prefer cards, segmented controls, bottom sheets, drawers, steppers, and focused task screens.
- Keep the field workflow short and obvious.
- Display location, upload, sync, and AI-processing status clearly.
- Allow safe recovery after browser refresh, app backgrounding, network loss, upload failure, or AI failure.
- Do not make color the only indicator of state.
- Use Thai as the default user-interface language and design for Thai text expansion.
- Use concise labels that remain understandable to secondary-school students.
- Keep destructive actions separated from primary actions and require confirmation where appropriate.

### Teacher design requirements

Teacher screens must remain usable on mobile but may progressively enhance for tablet and desktop.

Prioritize:

- class and group overview;
- group-capacity and readiness state;
- leader/member management;
- live session control;
- observation review queue;
- map marker filtering;
- plant detail review;
- revision and verification actions.

For desktop, use available space for split map/detail panels and denser management views without creating a separate product architecture.

## Suggested navigation model

You may improve this model, but keep it shallow.

### Student

- Home
- Class
- Group
- Active activity/map
- My observations
- Notifications
- Profile/settings

During an active session, prioritize a field-mode shell with:

- Map
- Add observation
- My submitted observations
- Group/session status

### Teacher

- Home
- Classes
- Class members/groups
- Activities
- Live session
- Observation review
- Completed maps/reports
- Notifications

## Group and notification UX

- Show the Create Group action only when the student is eligible.
- Prefer disabled-with-reason over silently disappearing when the group limit has just been reached.
- When another student claims the final slot, handle the server error gracefully and immediately refetch.
- Group leaders invite eligible classmates through in-app notifications.
- Students accept or decline invitations in the application.
- A student already in a group cannot accept another invitation.
- Teacher moves and leader changes must create in-app notifications and audit events.
- Notification state must be durable in PostgreSQL and update immediately through Realtime while the app is open.
- Use initial fetch + Realtime invalidation + refetch on reconnect/focus. Do not use five-second polling as the primary synchronization strategy.

## Map and field UX

- Use the capture coordinate as the plant marker coordinate.
- Make map controls usable with one hand.
- Provide an accessible alternative list for markers and observations.
- Draft observations remain private and off the teacher map.
- Submitted/reviewed marker styles must include icon/shape/text in addition to color.
- Clicking or tapping a marker opens plant details without losing map context.
- After completion, participating students and authorized teachers can view the result map and details.
- Avoid exposing unnecessary historical raw live-location data on completed views.

## Image and AI UX

Each observation supports 1–10 images and requires at least one whole-plant image.

Before upload:

- correct orientation;
- resize the longest edge to at most 2,048 px;
- compress toward quality 82–85;
- enforce a maximum processed size of 5 MB per image.

Show separate states for:

- local draft;
- compressing;
- uploading;
- queued for AI;
- AI running;
- AI failed;
- ready for student review;
- submitted;
- revision required;
- resubmitted;
- verified;
- rejected;
- unable to verify.

Do not trap the student while Gemini is pending or unavailable. Manual entry and retry must remain available.

## Data and security expectations

- Enable RLS on every exposed table.
- Use database membership and session participant records as authorization sources.
- Use atomic PostgreSQL functions for race-sensitive operations.
- Use constraints and partial unique indexes for critical invariants.
- Use private Storage buckets and authorized/signed image access.
- Preserve immutable AI-run, submission, review, status, notification, and audit/event history where documented.
- Use relational columns for ownership, authorization, state, querying, and map filtering.
- Use versioned `jsonb` only for flexible payloads such as AI output, additional traits, device context, and event metadata.
- Never store the entire lifecycle as one mutable JSON document.

## CI and quality strategy

The exact CI system and workflow are intentionally not prescribed yet. Inspect the generated project structure and choose a pragmatic CI setup appropriate for this repository.

You are authorized to decide:

- package manager;
- repository layout, provided domain/data/UI separation remains clear;
- GitHub Actions workflow structure;
- caching strategy;
- Node.js version policy;
- test partitioning;
- preview deployment checks;
- migration and generated-type validation steps.

At minimum, CI should protect the default branch with checks equivalent to:

- dependency installation from a lockfile;
- formatting or formatting verification;
- lint;
- TypeScript typecheck;
- unit tests;
- production build;
- database migration validation when migrations exist;
- critical authorization/RLS tests when the test environment supports them;
- focused end-to-end tests for essential flows once those flows exist.

Choose the simplest reliable solution. Do not introduce heavy CI infrastructure before the application needs it. Document the chosen CI decisions in the repository when implemented.

## Testing priorities

Prioritize tests for:

1. Cross-class data isolation and RLS.
2. Atomic final group-slot creation.
3. One current group per student per class.
4. Exactly one active leader per group.
5. Teacher move/leader-transfer behavior.
6. Safe deletion versus archive behavior.
7. Session participant snapshot preservation.
8. Exactly one active exploration group per session.
9. Observation ownership.
10. Offline/idempotent observation and upload recovery.
11. Private image access.
12. Gemini queue retry and failure fallback.
13. Same-species warning without submission blocking.
14. Immutable student/teacher revision history.
15. Completed-map authorization.
16. Mobile usability for the core field workflow.

## Implementation behavior

Before starting a major feature:

1. Read the relevant documentation.
2. Restate the user story and acceptance criteria in a short implementation note.
3. Identify schema, RLS, constraint, RPC, API, Realtime, UI, and test impacts.
4. Build the smallest end-to-end vertical slice.
5. Handle loading, empty, offline, reconnecting, conflict, permission-denied, and failure states.
6. Run the appropriate checks.
7. Update documentation when a genuine implementation decision is made.

Do not create fake frontend authorization or mock data paths that bypass the real domain rules.

## Freedom and escalation

You may decide ordinary implementation details, component structure, responsive layouts, visual hierarchy, form patterns, query invalidation, caching, test organization, and CI design.

Do not stop for minor design ambiguity. Select the safest, simplest mobile-first option and document it.

Ask the product owner only when a new decision materially affects:

- privacy or consent;
- data retention or deletion;
- grading or research validity;
- public sharing;
- paid provider selection or budget;
- destructive migration;
- emergency/safety behavior;
- a direct conflict between accepted requirements.

## Definition of done

A feature is complete only when:

- domain rules are enforced beyond the UI;
- RLS and authorization are tested;
- the mobile layout is usable;
- accessibility basics are respected;
- loading, offline, retry, conflict, and permission-denied states are handled;
- audit/research events are emitted where required;
- tests and build pass;
- documentation matches the implemented behavior.
