# AI Escort Application

AI-assisted, mobile-first field exploration application for schools. Teachers create classes and plant-exploration activities, students form groups, walk inside a defined area, photograph plants, receive provisional Gemini analysis, verify the result against the real plant, and submit observations for manual teacher review.

## Locked MVP workflow

```text
Teacher creates class, activity, route, boundary, and session
→ students join a class and form groups
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

- Each observation belongs to one student.
- Only one group may be `active` in a session at one time.
- Gemini is the MVP plant-analysis provider.
- Gemini output is provisional and never becomes verified automatically.
- Students must provide a Thai/common name and scientific name before submission; `unknown` is not accepted.
- Students may use external tools such as Google Lens and manually enter information when Gemini fails.
- The map uses the capture location, not the later submission location.
- Same-species detection warns and tags the teacher but does not block submission.
- Teacher verification is manual and may correct the final identity while preserving all prior AI and student values.
- One observation supports 1–10 images.
- The teacher manually decides when a session/activity is complete.
- Submitted and reviewed observations remain available on a post-activity map for both teachers and participating students.

## MVP technology

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Auth, PostgreSQL, PostGIS, Realtime, Storage, Queues, and Edge Functions
- Mapbox GL JS
- Gemini through a server-side provider adapter
- IndexedDB for offline drafts and upload retry
- Zod, React Hook Form, TanStack Query, and Zustand

## Documentation

1. [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
2. [System architecture](docs/SYSTEM_ARCHITECTURE.md)
3. [Database design](docs/DATABASE_DESIGN.md)
4. [API and realtime contracts](docs/API_AND_REALTIME.md)
5. [Plant survey plugin](docs/PLANT_SURVEY_PLUGIN.md)
6. [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
7. [Decisions and open questions](docs/DECISIONS_AND_QUESTIONS.md)
8. [Thai consolidated specification](docs/สรุประบบ_AI_ESCORT_ภาษาไทย.md)
9. [AI coding-agent instructions](AGENTS.md)

## Status

The repository contains the locked MVP product and engineering specification. The exact Gemini normalized JSON schema will be finalized during the AI integration phase, but it must be versioned, validated, and compatible with the fields described in the documentation.