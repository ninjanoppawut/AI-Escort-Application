# AI Escort Application

AI-assisted field exploration platform for schools. Teachers create classes and exploration activities, students form groups, follow a defined route in real time, systematically survey plants, and reflect on ecological relationships.

## Product goal

The application acts as an **AI learning escort**. It guides students through a teacher-defined area, prompts observation, checks data completeness, suggests possible plant identifications, and supports ecological reflection. AI suggestions are never treated as final expert verification.

## Core capabilities

- RBAC: `student`, `teacher`, `admin`
- Teacher-created classes and invite codes
- Student-created groups and proposed activities inside a class
- Teacher approval and live session control
- One active exploration group per session
- Real-time map, route, checkpoints, presence, and location updates
- Modular systematic plant-survey plugin
- Observation images, structured traits, ecology context, comments, and verification
- Offline queue and later synchronization
- Teacher review, assessment, analytics, and export

## Proposed stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Auth, PostgreSQL, PostGIS, Realtime, Storage, Edge Functions
- Mapbox GL JS
- TanStack Query, React Hook Form, Zod, Zustand
- AI provider adapters for plant identification and guided learning prompts

## Documentation

1. [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
2. [System architecture](docs/SYSTEM_ARCHITECTURE.md)
3. [Database design](docs/DATABASE_DESIGN.md)
4. [API and realtime contracts](docs/API_AND_REALTIME.md)
5. [Plant survey plugin](docs/PLANT_SURVEY_PLUGIN.md)
6. [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
7. [Decisions and open questions](docs/DECISIONS_AND_QUESTIONS.md)
8. [AI coding-agent instructions](AGENTS.md)

## Recommended implementation order

1. Bootstrap Next.js and Supabase clients.
2. Implement authentication, profiles, classes, memberships, and RBAC.
3. Add groups, activities, route builder, and approval workflow.
4. Add exploration sessions and database-enforced single active group.
5. Add Mapbox live exploration using Supabase Broadcast and Presence.
6. Add the plant-survey plugin and observation review.
7. Add offline synchronization, assessment, analytics, and exports.

## Important domain rule

Within one exploration session, only one group may have `active` status at a time. This must be enforced by PostgreSQL, not only by the UI.

## Status

The repository currently contains the product and engineering specification. Application code has not yet been scaffolded.