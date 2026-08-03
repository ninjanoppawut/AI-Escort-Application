# AI Escort Application

AI-assisted field exploration platform for schools. Teachers define an exploration area and control live sessions. Students walk inside the area, photograph plants, receive structured Gemini suggestions, verify the result against the real plant, and submit evidence with location and time for teacher review.

## Core observation flow

```text
enter active session
→ walk inside exploration boundary
→ photograph a plant
→ capture GPS, accuracy, and capture time
→ Gemini suggests possible names and visible traits
→ student checks each trait against the real plant
→ system checks same-species and possible same-specimen duplicates
→ student submits with separate submission GPS/time
→ teacher verifies or requests revision
```

## Core capabilities

- RBAC: student, teacher, admin
- Teacher-created classes, groups, activities, routes, and boundaries
- One active exploration group per session, enforced by PostgreSQL
- Mapbox live map with Supabase Broadcast and Presence
- Private observation images and offline synchronization
- Gemini structured plant candidates and visible characteristics
- Student trait verification: match, not match, unsure, not visible
- Separate AI, student, and teacher evidence layers
- Species-level duplicate warning without blocking another individual plant
- Specimen-level duplicate ranking using taxon, traits, image similarity, location, and time
- Human confirmation before linking observations to the same specimen
- Teacher review with capture/submission location and timestamps

## Proposed stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Auth, PostgreSQL, PostGIS, Realtime, Storage, Edge Functions
- Mapbox GL JS
- Gemini through a provider adapter and versioned JSON schema
- TanStack Query, React Hook Form, Zod, Zustand
- IndexedDB for offline drafts and media queues

## Documentation

1. [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
2. [System architecture](docs/SYSTEM_ARCHITECTURE.md)
3. [Database design](docs/DATABASE_DESIGN.md)
4. [API and realtime contracts](docs/API_AND_REALTIME.md)
5. [Plant survey plugin](docs/PLANT_SURVEY_PLUGIN.md)
6. [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
7. [Decisions and open questions](docs/DECISIONS_AND_QUESTIONS.md)
8. [AI coding-agent instructions](AGENTS.md)

## Recommended vertical slice

1. Authentication, class membership, and RLS.
2. Teacher activity boundary and session control.
3. Single active group and live map.
4. Plant image capture with capture GPS/time.
5. Gemini structured analysis.
6. Student verification.
7. Basic species dedupe, then specimen candidate matching.
8. Submission GPS/time and teacher review.
9. Offline synchronization and exports.

## Important domain rules

- Gemini output is provisional.
- Capture location is the primary plant location; submission location is stored separately.
- Same species does not automatically mean duplicate observation.
- Distance alone cannot identify the same physical plant.
- The system never auto-deletes or auto-merges observations from dedupe scores.
- Original AI, student, and teacher values must remain traceable.

## Status

The repository currently contains the updated product and engineering specification. Application code has not yet been scaffolded.