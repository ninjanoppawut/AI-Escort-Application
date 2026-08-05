# MAP — Completed Map, Exports, and Research Data

## Outcome

After manual completion, authorized teachers and session participants can explore the durable plant map and teachers can export permitted reviewed/research data without exposing private live-location history.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §§15, 18–19
- `docs/DECISIONS_AND_QUESTIONS.md` D-018, D-026–D-029, D-046, D-053, D-055
- `docs/API_AND_REALTIME.md` §§18–19
- `docs/DATABASE_DESIGN.md` §§13–14, 16–17
- `docs/PRIVACY_RETENTION_AND_RESEARCH.md`
- `docs/RESEARCH_EVENT_DICTIONARY.md`

## Scope

In scope: manual completion, completed-session map read model, accessible markers/filtering, plant detail, authorized image access, CSV/GeoJSON exports, queued large export, retention hooks, and append-only research/audit events.

Out of scope: public maps, raw historical location playback for students, email export delivery, automatic completion, and unreviewed data presented as verified.

## Functional requirements

- **MAP-001:** Only a teacher manually completes a session/activity; completion is audited.
- **MAP-002:** Draft observations never appear on teacher or completed maps; visibility follows documented submitted/reviewed statuses.
- **MAP-003:** Markers use capture coordinates and encode status with color plus shape/icon/Thai label.
- **MAP-004:** An authorized teacher can view all permitted session observations; a participating student can view the completed session and peer plant records allowed by D-055.
- **MAP-005:** Plant detail preserves map context and shows permitted images, recorder name, final teacher identity when available, evidence layers, review state, and relationship indicators.
- **MAP-006:** Authorization derives from class-teacher membership or immutable session participation, not URL knowledge or current group membership alone.
- **MAP-007:** Teachers can export authorized reviewed data as CSV and GeoJSON with stable schemas and explicit provenance/status fields.
- **MAP-008:** Large exports run as idempotent queued jobs and notify the requesting teacher in-app when an authorized download is ready.
- **MAP-009:** Raw historical live-location data is hidden/restricted independently from observation capture locations.
- **MAP-010:** Research and sensitive actions emit append-only events with relational actor/resource IDs and versioned payloads.
- **MAP-011:** Retention/anonymization controls can be applied separately to live locations, images, AI payloads, notifications, audit logs, research logs, and export artifacts once policy is accepted.

## Authorization and privacy boundary

Completed-map queries and Storage access reauthorize every request. Export jobs snapshot the requester's authorized scope and validate it again at download. Research exports minimize or pseudonymize identity according to the accepted consent/retention policy.

## Required states and failures

No observations, mixed review statuses, missing capture location, restricted image, loading clusters, permission denied, export queued/running/failed/expired/ready, and retention-removed artifact states are required.

## Verification

- Teacher/participant/non-participant map isolation tests.
- Draft exclusion and marker capture-location accuracy tests.
- Accessible marker token coverage for all observation states.
- CSV/GeoJSON schema and authorization tests.
- Queued export idempotency, notification, expiry, and download reauthorization tests.
- Raw live-location non-disclosure test.

## Dependencies

AUTH, NOT, SES, OBS, REV, Mapbox adapter, Storage, Queues, and accepted privacy/retention decisions for production.

## Definition of done

Maps and exports are correct, accessible, privacy-scoped, history-preserving, and verified for every authorized role and key failure state.
