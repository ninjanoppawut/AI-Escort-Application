# Decisions and Open Questions

This file records accepted product decisions for developers and AI coding agents. The decisions below are authoritative for the MVP.

## Accepted decisions

### D-001 — Observation ownership

- **Status:** accepted
- **Decision:** Each observation belongs to one student, not to the group.
- **Reason:** Supports individual learning evidence, grading, revision history, and research analysis.

### D-002 — Activity and session

- **Status:** accepted
- **Decision:** An activity is a reusable plan; a session is one actual execution.

### D-003 — One active group

- **Status:** accepted
- **Decision:** Only one group may be active per exploration session.
- **Consequence:** Enforce with a PostgreSQL partial unique index and atomic RPC.

### D-004 — Waiting groups

- **Status:** accepted
- **Decision:** Waiting groups may preview route/activity information but may not publish live location or submit observations.

### D-005 — Client and map

- **Status:** accepted for MVP
- **Decision:** Build a mobile-first Next.js PWA and use Mapbox GL JS behind an adapter.
- **Consequence:** Detailed UI may be designed during implementation, but mobile usability and locked workflows cannot change.

### D-006 — Realtime

- **Status:** accepted
- **Decision:** Use Broadcast for frequent live-location events, Presence for participant state, and PostgreSQL for durable records and observation markers.

### D-007 — Plant-analysis provider

- **Status:** accepted for MVP
- **Decision:** Use Gemini behind a server-only provider adapter.

### D-008 — AI authority

- **Status:** accepted
- **Decision:** Gemini output is provisional. It never becomes verified automatically.

### D-009 — Gemini confidence behavior

- **Status:** accepted as configurable MVP default
- **Decision:** Below 0.40 request more evidence; 0.40–0.70 show multiple candidates; above 0.70 emphasize the top candidate while retaining alternatives/provisional labeling.

### D-010 — Gemini response contract

- **Status:** accepted
- **Decision:** The exact normalized JSON shape will be finalized during integration, but it must be versioned, server-validated, and store provider/model/prompt/schema versions.

### D-011 — Durable worker

- **Status:** accepted for MVP
- **Decision:** Use Supabase Queue + Edge Function consumer for Gemini processing.
- **Consequence:** A separate Node worker, Redis/BullMQ, Kubernetes, or GPU service is out of scope initially.

### D-012 — AI failure fallback

- **Status:** accepted
- **Decision:** Keep the draft, allow retry, and allow manual entry. Students may use external references such as Google Lens.

### D-013 — Required student identity

- **Status:** accepted
- **Decision:** Submission requires a Thai/common name and a scientific name. `Unknown` is not accepted as the final student submission.

### D-014 — Student verification

- **Status:** accepted
- **Decision:** Student checks each relevant AI trait as `match`, `not_match`, `unsure`, or `not_visible`; mismatches may include corrected values.

### D-015 — Evidence layers

- **Status:** accepted
- **Decision:** Gemini output, student verification/correction, submission versions, and teacher review/correction are stored separately and never overwritten.

### D-016 — Revision workflow

- **Status:** accepted
- **Decision:** Teacher may request revision. The student edits the same observation and resubmits, creating a new immutable submission version.

### D-017 — Teacher verification

- **Status:** accepted
- **Decision:** Teacher manually verifies every accepted observation and may correct the final common name, scientific name, and traits while preserving prior values.

### D-018 — Teacher completion

- **Status:** accepted
- **Decision:** The teacher manually decides when the session/activity is complete. No automatic completion formula is required for the MVP.

### D-019 — Capture location

- **Status:** accepted
- **Decision:** Capture location, capture accuracy, and capture time define the plant marker. Submission location is not required for normal MVP behavior.

### D-020 — GPS failure

- **Status:** accepted
- **Decision:** Prompt retry/wait. If GPS remains unavailable, keep an explicitly flagged record for teacher handling; never fabricate a coordinate.

### D-021 — Image limits and preprocessing

- **Status:** accepted
- **Decision:** One observation supports 1–10 images, with at least one whole-plant image. Before upload, correct orientation, limit longest edge to 2,048 px, compress toward quality 82–85, and limit each processed image to 5 MB.

### D-022 — Same-species behavior

- **Status:** accepted
- **Decision:** Search submitted observations in the same session. Warn the student but allow another individual submission.
- **Consequence:** Set a teacher-visible same-species tag on the observation/map detail.

### D-023 — Same species versus same specimen

- **Status:** accepted
- **Decision:** Same-species and possible-same-specimen are separate relationships.

### D-024 — Specimen candidate signals

- **Status:** accepted
- **Decision:** Possible same-specimen detection may combine taxon, morphology, image similarity, location, and time. Distance alone is insufficient.

### D-025 — No automatic merge

- **Status:** accepted
- **Decision:** Never automatically merge, delete, or reject observations because of dedupe. Human confirmation is required; separate observations may later share a `specimen_id`.

### D-026 — Map marker visibility

- **Status:** accepted
- **Decision:** Drafts do not appear on the teacher map. Submitted/reviewed observations appear at capture location with status-aware markers and accessible labels/icons.

### D-027 — Completed map

- **Status:** accepted
- **Decision:** After activity/session completion, authorized teachers and participating students can view the result map. Clicking a marker opens plant details.

### D-028 — Flexible data and JSONB

- **Status:** accepted
- **Decision:** Use relational columns for ownership, status, authorization, required identity, location/time, and map/review queries. Use versioned `jsonb` for flexible Gemini output, extra traits, verification snapshots, device context, and research-event payloads.

### D-029 — Research event log

- **Status:** accepted
- **Decision:** Store meaningful actions as append-only event rows with explicit relational IDs and a flexible `payload jsonb`.

### D-030 — Authorization source

- **Status:** accepted
- **Decision:** Database membership and session participant tables are authoritative. UI role checks alone are insufficient.

## Working defaults

- Thai is the default UI language.
- Observation images are private by default.
- Location broadcast is approximately every 2–5 seconds while moving.
- Durable location sampling is approximately every 10–30 seconds or meaningful event.
- Same-species matching begins within the same session.
- Teacher-map status presentation uses amber/submitted, red/revision, blue/resubmitted, green/verified, purple/unable-to-verify, and gray/rejected, with non-color labels/icons.
- Gemini missing/unseen traits use `null` or explicit unavailable state.

## Remaining non-blocking questions

These do not block initial implementation but must be finalized before production/pilot deployment.

### Q-001 — Consent and target age

What school/guardian consent and student age rules apply to location, image, and research-event collection?

### Q-002 — Retention

How long should raw live-location events, processed images, AI payloads, and research logs be retained?

### Q-003 — Production Gemini configuration

Which Gemini model, rate limits, latency target, and monthly budget will production use?

### Q-004 — Taxonomy normalization source

Gemini text is acceptable for MVP display, but which authoritative source will later normalize names/synonyms/taxon IDs?

### Q-005 — Research instruments and exports

Which final research variables, scales, reflections, and anonymized export fields are required?

### Q-006 — Deployment ownership

Who owns and supports the Supabase, Vercel, Mapbox, Gemini, privacy, and production accounts?

## Agent behavior

Do not ask the product owner about already accepted decisions. Ask only when a new choice materially affects privacy, retention, grading, public sharing, paid provider configuration, destructive migrations, or emergency behavior. For ordinary implementation details, choose the safest simple option, document it, and proceed.