# AI Escort Application

AI-assisted, mobile-first field exploration application for schools. Teachers create classes and plant-exploration activities, students form teacher-controlled groups, walk inside a defined area, photograph plants, receive provisional Gemini analysis, verify the result against the real plant, and submit observations for manual teacher review.

## Locked MVP workflow

```text
Teacher creates class and group settings
→ teacher shares class code/link/QR
→ students join the class
→ eligible students create the available groups and become group leaders
→ leaders invite classmates through in-app notifications
→ classmates accept or decline
→ teacher may move students, change leaders, lock groups, delete unused groups, or archive historical groups
→ teacher creates activity, route, boundary, and session
→ session snapshots group membership
→ teacher activates one group
→ student walks inside the activity boundary
→ student creates an individual observation
→ app records capture location, GPS accuracy, and capture time
→ student uploads 1–10 plant images
→ durable AI job sends images to Gemini
→ Gemini returns provisional plant candidates and visible traits
→ student checks each trait against the real plant
→ student confirms or corrects the result
→ student provides required Thai/common and scientific names
→ system warns about the same species already submitted in this session
→ student may still submit another individual observation
→ submitted observation appears as a status-colored map marker
→ teacher manually verifies, corrects, rejects, or requests revision
→ student edits the same observation and resubmits when revision is required
→ teacher manually completes the activity/session
→ after completion, teachers and students can view the result map and open plant details from each marker
```

## Core decisions

- Every account uses verified email/password authentication; class invitations themselves use code, link, or QR rather than email delivery.
- In-app notifications are durable PostgreSQL rows with private Realtime update signals.
- Teacher configures group size, maximum group count, student group creation, and formation open/closed state.
- The student who successfully creates a group becomes its sole leader.
- A student may belong to only one current group and create only one student group per class unless a teacher resets the claim.
- Group creation is atomic; only one student can claim the final available group slot.
- Group screens use initial fetch + Realtime signal + authoritative refetch, not five-second primary polling.
- Teacher may move students, change leaders, delete unused groups, and archive groups with session history.
- Session participant snapshots preserve historical membership after later group changes.
- Each observation belongs to one student.
- Only one exploration group may be `active` in a session at one time.
- Gemini is the MVP plant-analysis provider.
- Gemini output is provisional and never becomes verified automatically.
- Students must provide a Thai/common name and scientific name before submission; `unknown` is not accepted.
- Students may use external tools such as Google Lens and manually enter information when Gemini fails.
- The map uses the capture location.
- Same-species detection warns, tags, and notifies the teacher but does not block submission.
- Teacher verification is manual and may correct the final identity while preserving all prior AI and student values.
- One observation supports 1–10 images.
- The teacher manually decides when a session/activity is complete.
- Submitted and reviewed observations remain available on a post-activity map for teachers and participating students.

## MVP technology

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Auth, PostgreSQL, PostGIS, Realtime, Storage, Queues, and Edge Functions
- Mapbox GL JS
- Gemini through a server-side provider adapter
- IndexedDB for offline observation drafts and upload retry
- Zod, React Hook Form, TanStack Query, and Zustand

## Documentation

1. [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
2. [System architecture](docs/SYSTEM_ARCHITECTURE.md)
3. [Database design](docs/DATABASE_DESIGN.md)
4. [API and realtime contracts](docs/API_AND_REALTIME.md)
5. [Plant survey plugin](docs/PLANT_SURVEY_PLUGIN.md)
6. [Build roadmap and verification checklist](docs/ROADMAP.md)
7. [Requirements traceability matrix](docs/TRACEABILITY_MATRIX.md)
8. [Authentication, identity, and tenancy](docs/AUTH_IDENTITY_AND_TENANCY.md)
9. [UI contracts](docs/UI_CONTRACTS.md)
10. [Non-functional requirements](docs/NON_FUNCTIONAL_REQUIREMENTS.md)
11. [Test strategy](docs/TEST_STRATEGY.md)
12. [Environments and operations](docs/ENVIRONMENTS_AND_OPERATIONS.md)
13. [Privacy, retention, and research](docs/PRIVACY_RETENTION_AND_RESEARCH.md)
14. [AI evaluation](docs/AI_EVALUATION.md)
15. [Research event dictionary](docs/RESEARCH_EVENT_DICTIONARY.md)
16. [Module specifications](docs/modules/README.md)
17. [Decisions and open questions](docs/DECISIONS_AND_QUESTIONS.md)
18. [Thai consolidated specification](docs/สรุประบบ_AI_ESCORT_ภาษาไทย.md)
19. [AI coding-agent instructions](AGENTS.md)

## Status

The repository now contains the locally verified Phase 0 Next.js foundation:
strict TypeScript, Tailwind/shadcn configuration, Supabase browser/server
boundaries, local Supabase/PostgreSQL/Auth/Mailpit configuration, stable API and
event contracts, observability/redaction conventions, Vitest, Playwright, and
CI workflows. The dedicated hosted project is authenticated, linked, healthy,
and configured with its modern browser-safe publishable key; legacy API keys
are disabled. The Phase 1 identity/provisioning foundation migration is
verified locally and deployed to the hosted development database. P1-01 Auth is
implemented and locally verified with Supabase Auth, PKCE, SSR claim validation,
Thai-first responsive UI, and Mailpit end-to-end coverage. Hosted CI now passes
quality, database, and real local Auth/Mailpit browser jobs. P1-01 remains
unchecked until custom SMTP and deployed redirect evidence exists; trusted
provisioning and the broader Phase 1 slice remain in progress.

The exact Gemini normalized JSON schema will be finalized during the AI integration phase, but it must be versioned, validated, and compatible with the fields described in the documentation.
