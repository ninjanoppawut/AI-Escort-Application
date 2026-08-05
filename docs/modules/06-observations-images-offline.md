# OBS — Observations, Images, and Offline Behavior

## Outcome

An active student creates a private, recoverable observation at capture location/time, prepares 1–10 authorized images, and retains the draft through weak connectivity and downstream AI failures.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §§9–10, 16–18
- `docs/DECISIONS_AND_QUESTIONS.md` D-001, D-019–D-021, D-051–D-052
- `docs/API_AND_REALTIME.md` §§13–14, 20
- `docs/DATABASE_DESIGN.md` §§8–9, 14, 17
- `docs/PRIVACY_RETENTION_AND_RESEARCH.md`

## Scope

In scope: client-generated observation ID, start draft, capture location/time/accuracy, image categories, preprocessing, private upload/delete, IndexedDB draft/retry queue, sync state, idempotency, and status/research events.

Out of scope: shared group ownership, fabricated coordinates, public buckets, auto-deleting a draft after AI/upload failure, and offline group-slot or membership mutations.

## Functional requirements

- **OBS-001:** Each observation has one owning student and is tied to an authorized session-participant snapshot.
- **OBS-002:** Only a student in the active group can start an observation; a client-generated UUID makes retries idempotent.
- **OBS-003:** Capture location, accuracy, and capture time are recorded when observation/photo capture begins and remain the marker source.
- **OBS-004:** Poor accuracy displays a warning and wait option but does not block use; no fix creates an explicit missing-location state for teacher handling.
- **OBS-005:** One to ten images are supported, including at least one whole-plant image before submission.
- **OBS-006:** Before upload, images are orientation-corrected, resized to at most 2,048 px on the longest edge, and compressed to at most 5 MB.
- **OBS-007:** Images use deterministic private Storage paths and authorized signed or authenticated access.
- **OBS-008:** Upload retry is idempotent; Storage upsert policies include the required insert/select/update permissions without broadening ownership.
- **OBS-009:** IndexedDB preserves draft fields, media queue, device context, and retry state through refresh, offline use, and browser restart.
- **OBS-010:** Sync exposes local-only, queued, uploading, synced, failed, conflict, and retry states without losing the local draft.
- **OBS-011:** `OBSERVATION_VERSION_CONFLICT` blocks the stale write, refreshes the record, explains the conflict, and offers a repeat action.

## Authorization and data boundary

Observation ownership, session participation, active-group status, and Storage object access are enforced server-side. Flexible device/sync payloads may use versioned `jsonb`; ownership, status, capture coordinates/time, and joins remain relational.

## Required states and failures

GPS waiting/unavailable, camera permission denied, invalid image, oversized source, compression failure, offline, upload retry, storage denied, stale version, and recovered draft are required.

## Verification

- Ownership and active-participant RLS tests.
- Image count, category, dimensions, orientation, and size tests.
- Private Storage cross-user denial and authorized view tests.
- Offline-to-online single-sync test without duplicate observations/media.
- Version-conflict behavior test.

## Dependencies

AUTH, SES, private Storage, IndexedDB abstraction, image-processing adapter, and event logging.

## Definition of done

Draft and media integrity survive connectivity and retry failures, while ownership, activity state, and private access remain database-authoritative.
