# Decisions and Open Questions

This file records product decisions for developers and AI coding agents.

## Accepted decisions

### D-001 — One active group scope

- **Status:** accepted
- **Decision:** Only one group may be active per exploration session.
- **Consequence:** PostgreSQL partial unique index on `session_id` where status is `active`.

### D-002 — Activity versus session

- **Status:** accepted
- **Decision:** Activity is a reusable plan; session is one actual execution.

### D-003 — Initial client

- **Status:** accepted for MVP
- **Decision:** Build a mobile-first Next.js PWA first.
- **Consequence:** background location is not guaranteed when the browser is closed.

### D-004 — Map provider

- **Status:** accepted for MVP
- **Decision:** Use Mapbox GL JS behind a small adapter.

### D-005 — Realtime transport

- **Status:** accepted
- **Decision:** Use Broadcast for frequent location events, Presence for participant state, and PostgreSQL for durable samples.

### D-006 — AI authority

- **Status:** accepted
- **Decision:** Gemini output is provisional and never becomes the final plant identification automatically.

### D-007 — Authorization source

- **Status:** accepted
- **Decision:** Class/session membership tables are authoritative; UI role checks are insufficient.

### D-008 — Observation flow

- **Status:** accepted
- **Decision:** Student captures a plant image, Gemini proposes names and visible characteristics, student compares the result with the real plant, then submits to the teacher.

### D-009 — Evidence layers

- **Status:** accepted
- **Decision:** Store Gemini output, student verification/corrections, and teacher review separately. Never overwrite prior layers.

### D-010 — Location and time

- **Status:** accepted
- **Decision:** Store capture location/time and submission location/time separately. Capture location is the primary plant location.

### D-011 — Student trait verification

- **Status:** accepted
- **Decision:** Each AI trait is marked `match`, `not_match`, `unsure`, or `not_visible`. A mismatched value may include a correction and evidence note.

### D-012 — Species dedupe

- **Status:** accepted
- **Decision:** The system warns when the same normalized plant species already exists in the configured activity/session scope.
- **Consequence:** Same-species warnings do not block recording a different individual plant.

### D-013 — Specimen dedupe

- **Status:** accepted
- **Decision:** Possible same-plant detection combines taxon match, trait similarity, image similarity, capture distance, and time difference.
- **Consequence:** Distance alone is never sufficient. The system cannot auto-delete or auto-merge observations.

### D-014 — Duplicate confirmation

- **Status:** accepted
- **Decision:** Student chooses `same_specimen`, `different_specimen`, or `unsure`; teacher may finalize or override. Confirmed observations may share a specimen ID while remaining separate records.

### D-015 — Gemini provider

- **Status:** accepted for MVP
- **Decision:** Use Gemini as the initial image-analysis provider behind a provider adapter and versioned response schema.

### D-016 — Waiting group behavior

- **Status:** accepted for MVP
- **Decision:** Waiting groups may preview the route but cannot publish live location or create/submit observations.

## Working defaults

- Thai is the default UI language.
- Location broadcast: every 2–5 seconds while moving.
- Durable location sample: every 10–30 seconds and on meaningful events.
- Observation images are private by default.
- Dedupe scope starts with the same activity/session.
- Species matching uses normalized taxonomy when available.
- Specimen matching is advisory and always requires human confirmation.
- Gemini must return `null`, `unknown`, or uncertainty when evidence is not visible.

## Remaining open questions

### Q-001 — Target users and consent

What exact student age range will use the production system, and what guardian/school consent is required for location and image collection?

### Q-002 — Raw location retention

How many days should raw location events be retained? Should summarized routes remain after raw points are deleted?

### Q-003 — Plant taxonomy source

Which source will normalize Thai names, scientific names, synonyms, and taxon IDs?

### Q-004 — Gemini model and budget

Which Gemini model, image limits, rate limits, latency target, and monthly budget should production use?

### Q-005 — Gemini failure fallback

When Gemini is unavailable, may students manually enter an unknown plant and submit, or must analysis complete first?

**Recommended MVP:** allow manual unresolved submission with a recorded AI failure state.

### Q-006 — Required photo evidence

Is one photo sufficient to begin analysis, and which additional views are mandatory before submission?

**Recommended MVP:** one photo starts analysis; Gemini or teacher may request leaf/stem/flower/fruit images as applicable.

### Q-007 — Dedupe scope

Should species/specimen matching search only the current session, the entire activity, or historical activities in the same area?

**Recommended MVP:** current activity, prioritizing current session results.

### Q-008 — Dedupe threshold calibration

What thresholds should generate informational species warnings versus possible same-specimen warnings?

**Recommended MVP:** keep thresholds configurable and collect pilot data before treating scores as strong evidence.

### Q-009 — Revision behavior

Can a student revise a submitted observation after leaving the plant location, or must additional evidence be captured during another active session?

### Q-010 — Teacher final identification

May teachers enter free-text plant names, or must they select a normalized taxonomy record?

**Recommended MVP:** allow free text with optional normalized taxon link.

### Q-011 — Research instruments

Which assessment and reflection instruments must be embedded in the app?

### Q-012 — Deployment ownership

Who owns the Supabase, Mapbox, Vercel, Gemini, privacy, and support accounts?

## Agent behavior

Ask the product owner only when a decision affects privacy, retention, grading, paid provider selection, destructive migration, emergency escalation, or public sharing. For ordinary implementation details, choose the safest simple default, document it here, and continue.