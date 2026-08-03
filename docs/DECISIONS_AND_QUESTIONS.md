# Decisions and Open Questions

This file allows the product owner, developers, and AI coding agents to ask and answer questions without losing context.

## How to use

For every material decision, add:

```text
ID:
Status: proposed | accepted | rejected | superseded
Question:
Decision:
Reason:
Consequences:
Date:
Owner:
```

Do not block ordinary implementation on minor visual choices. Use the defaults below until the product owner changes them.

## Accepted decisions

### D-001 — One active group scope

- **Status:** accepted
- **Question:** Does “only one group may explore at the same time” apply globally?
- **Decision:** It applies per exploration session.
- **Reason:** Different classes and schools must be able to operate independently.
- **Consequence:** PostgreSQL partial unique index on `session_id` where status is `active`.

### D-002 — Activity versus session

- **Status:** accepted
- **Decision:** Activity is a reusable plan; session is one actual execution.
- **Consequence:** observations, participants, tracks, and group queue reference a session.

### D-003 — Initial client

- **Status:** accepted for MVP
- **Decision:** Build a mobile-first Next.js PWA first.
- **Consequence:** background tracking is not guaranteed when the browser is closed. Expo/React Native remains a later option.

### D-004 — Map provider

- **Status:** accepted for MVP
- **Decision:** Use Mapbox GL JS behind a small map adapter.
- **Consequence:** restrict the public token by domain and keep domain geometry independent of Mapbox-specific UI objects.

### D-005 — Realtime transport

- **Status:** accepted
- **Decision:** Use Broadcast for frequent location events, Presence for participant state, PostgreSQL for durable samples.

### D-006 — AI authority

- **Status:** accepted
- **Decision:** AI output is provisional and never silently becomes the final plant identification.

### D-007 — Authorization source

- **Status:** accepted
- **Decision:** Class and school membership tables are authoritative; UI role checks are not sufficient.

### D-008 — Student activity creation

- **Status:** accepted
- **Decision:** Students may create activities inside a class when enabled, but teacher approval is required before scheduling.

## Working defaults

These may be changed later:

- Thai is the default UI language.
- Location broadcast: every 2–5 seconds while moving.
- Durable location sample: every 10–30 seconds and on meaningful events.
- Off-route warning requires both distance tolerance and sustained duration.
- A group has a teacher-configurable minimum and maximum size.
- Observation images are private by default.
- Students can see class observations but not unrestricted historical raw tracks.

## Open product questions

### Q-001 — Target users and consent

What exact student age range will use the production system, and what school/guardian consent process is required for location and image collection?

### Q-002 — Raw location retention

How many days should raw location events be retained? Should summarized routes remain after raw points are deleted?

### Q-003 — Group activation meaning

When only one group is active, should waiting groups be prevented from opening the map entirely, or may they preview the route without publishing location and observations?

**Recommended default:** allow route preview, but disable live publishing and submission until active.

### Q-004 — Teacher staffing

Can multiple teachers supervise one class/session? Can an assistant teacher switch the active group?

**Recommended default:** allow multiple teachers; only teacher and assistant teacher roles may control sessions.

### Q-005 — Public/community layer

Should identifications be limited to the class, shared across the school, or later shared publicly like iNaturalist?

**Recommended MVP:** class-only.

### Q-006 — Plant reference data

Which taxonomy/reference source should be authoritative for Thai common names, scientific names, synonyms, and conservation status?

### Q-007 — AI provider

Which provider or local model should handle plant identification? What are the budget, privacy, latency, and offline requirements?

### Q-008 — Activity authoring

Can students edit route and boundary, or only propose title, objectives, and survey questions?

**Recommended MVP:** students draft all fields; teacher must review geometry before approval.

### Q-009 — Observation ownership

Can any group member edit a shared group observation, or only the creator?

**Recommended default:** creator edits; group members comment or propose identification; teacher can request revision.

### Q-010 — Emergency behavior

What should happen when a student leaves the boundary, loses signal, or does not update location for a defined duration?

### Q-011 — Assessment instruments

Which research instruments must be embedded in the application: ecology knowledge test, ecological-awareness scale, observation checklist, activity log, reflection log, or all of them?

### Q-012 — Deployment ownership

Who owns the Supabase, Mapbox, Vercel, AI provider, privacy policy, and production support accounts?

## Questions an AI coding agent must ask only when necessary

Ask the product owner before implementing when a decision affects:

- student privacy or consent;
- data deletion/retention;
- final grading behavior;
- paid provider selection;
- public sharing;
- emergency escalation;
- a destructive migration.

For ordinary implementation details, choose the safest simple option, document it here as proposed, and continue.