# API and Realtime Contracts

## 1. API principles

- Use typed server actions or route handlers for trusted mutations.
- Use Supabase RLS-protected reads where appropriate.
- Validate all input and normalized Gemini output with Zod.
- Mutations that change workflow status must be idempotent and auditable.
- Secrets and privileged credentials never reach the browser.

## 2. Core operations

```text
POST /api/classes
POST /api/classes/:id/invites
POST /api/classes/join
POST /api/groups
POST /api/activities
POST /api/sessions
POST /api/sessions/:id/open
POST /api/sessions/:id/activate-group
POST /api/sessions/:id/complete

POST /api/observations/start
POST /api/observations/:id/media
DELETE /api/observations/:id/media/:mediaId
POST /api/observations/:id/analyze
GET  /api/observations/:id/analysis
PUT  /api/observations/:id/student-review
GET  /api/observations/:id/related
POST /api/observations/:id/submit
POST /api/observations/:id/resubmit

POST /api/observations/:id/review
GET  /api/sessions/:id/observations
GET  /api/sessions/:id/map
GET  /api/observations/:id/details
```

Implementation may use server actions instead of literal REST routes, but the domain contracts must remain equivalent.

## 3. Standard response

```json
{
  "data": {},
  "error": null,
  "requestId": "uuid"
}
```

Stable error codes include:

```text
FORBIDDEN
SESSION_NOT_OPEN
GROUP_NOT_ACTIVE
ACTIVE_GROUP_CONFLICT
OBSERVATION_VERSION_CONFLICT
IMAGE_LIMIT_EXCEEDED
IMAGE_TOO_LARGE
INVALID_IMAGE_TYPE
LOCATION_UNAVAILABLE
ANALYSIS_ALREADY_QUEUED
AI_ANALYSIS_FAILED
STUDENT_REVIEW_REQUIRED
PLANT_NAME_REQUIRED
SCIENTIFIC_NAME_REQUIRED
SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED
INVALID_STATUS_TRANSITION
RATE_LIMITED
```

## 4. Start observation

Request:

```json
{
  "clientGeneratedId": "uuid",
  "sessionId": "uuid",
  "capture": {
    "lat": 13.7563,
    "lng": 100.5018,
    "accuracyM": 8.5,
    "capturedAt": "2026-08-03T10:00:00Z"
  }
}
```

The server validates participant/group state. The returned observation belongs to the authenticated student.

If GPS remains unavailable after retry, a flagged draft may be created with an explicit location state; no fabricated coordinate is accepted.

## 5. Media upload contract

One observation supports 1–10 media items.

Processed upload requirements:

```text
mime: image/jpeg | image/png | image/webp
maximum bytes: 5 MB
maximum longest edge: 2,048 px
position: 1–10
category: whole_plant | leaf | leaf_underside | stem_trunk | flower | fruit | habitat | other
```

The client preprocesses oversized images before upload. Server/bucket validation remains authoritative.

## 6. Queue Gemini analysis

Request:

```json
{
  "observationId": "uuid",
  "mediaIds": ["uuid"],
  "requestedSchemaVersion": "plant-analysis-v1"
}
```

Response:

```json
{
  "data": {
    "analysisRunId": "uuid",
    "status": "queued"
  },
  "error": null,
  "requestId": "uuid"
}
```

The endpoint writes `ai_analysis_runs` and publishes a durable queue message. Repeated requests with the same idempotency key return the existing run.

## 7. Gemini normalized result contract

The exact JSON structure will be finalized during integration. The initial required semantic fields are:

```json
{
  "schemaVersion": "plant-analysis-v1",
  "identificationStatus": "possible_match",
  "candidates": [
    {
      "commonNameTh": "มะม่วง",
      "commonNameEn": "Mango",
      "scientificName": "Mangifera indica",
      "confidence": 0.87,
      "evidenceSummary": "visible evidence summary"
    }
  ],
  "traits": {
    "plantType": {"value": "tree", "visibility": "visible"},
    "leafType": {"value": "simple", "visibility": "visible"},
    "leafArrangement": {"value": "alternate", "visibility": "uncertain"},
    "flower": {"value": null, "visibility": "not_visible"}
  },
  "missingEvidence": ["leaf_underside"],
  "disclaimer": "provisional result"
}
```

Rules:

- every response has a schema version;
- unavailable evidence is `null`/explicit, never invented;
- provider, model, prompt version, and timing are stored separately;
- client uses only server-validated normalized output.

## 8. Student review contract

```json
{
  "analysisRunId": "uuid",
  "selectedCandidate": {
    "commonNameTh": "มะม่วง",
    "scientificName": "Mangifera indica"
  },
  "traitChecks": [
    {
      "traitKey": "leafType",
      "aiValue": "simple",
      "status": "match",
      "correctedValue": null,
      "note": null
    },
    {
      "traitKey": "leafArrangement",
      "aiValue": "alternate",
      "status": "not_match",
      "correctedValue": "opposite",
      "note": "checked against the real plant"
    }
  ],
  "additionalTraits": {},
  "studentEvidenceNote": "short evidence statement"
}
```

Allowed status values:

```text
match
not_match
unsure
not_visible
```

Manual entry is valid even when Gemini fails. Submission still requires Thai/common and scientific names.

## 9. Related-observation contract

Response:

```json
{
  "sameSpeciesInSession": true,
  "sameSpeciesCount": 2,
  "candidates": [
    {
      "observationId": "uuid",
      "relationshipType": "same_species",
      "commonName": "มะม่วง",
      "scientificName": "Mangifera indica",
      "possibleSameSpecimen": false,
      "scores": {
        "taxon": 1.0,
        "morphology": 0.7,
        "visual": 0.5,
        "distanceM": 32.4
      }
    }
  ]
}
```

The student may submit after acknowledging the warning. The server writes `same_species_in_session=true` and exposes the tag to the teacher.

## 10. Submit/resubmit contract

```json
{
  "expectedObservationVersion": 4,
  "commonName": "มะม่วง",
  "scientificName": "Mangifera indica",
  "evidenceNote": "leaf and trunk characteristics checked",
  "sameSpeciesAcknowledged": true
}
```

Server validation checks:

- authenticated owner;
- active/allowed session workflow;
- required names/evidence;
- at least one whole-plant image;
- total media count <= 10;
- student verification exists or manual path is explicitly recorded;
- same-species acknowledgement when applicable;
- valid status transition.

Resubmission creates a new immutable submission row and updates the current observation status.

## 11. Teacher review contract

```json
{
  "submissionId": "uuid",
  "decision": "verified",
  "verifiedCommonName": "มะม่วง",
  "verifiedScientificName": "Mangifera indica",
  "correctedTraits": {},
  "feedback": "ข้อมูลครบถ้วน"
}
```

Allowed decisions:

```text
verified
revision_required
unable_to_verify
rejected
```

Teacher corrections never overwrite AI results or student submission history.

## 12. Realtime channels

```text
session:{sessionId}:group:{groupId}
session:{sessionId}:teachers
session:{sessionId}:observations
user:{userId}:observation-jobs
```

### Live location event

```json
{
  "type": "location.updated",
  "version": 1,
  "userId": "uuid",
  "lat": 13.7563,
  "lng": 100.5018,
  "accuracyM": 8.5,
  "capturedAt": "2026-08-03T10:00:00Z"
}
```

### Observation marker event

```json
{
  "type": "observation.marker_changed",
  "version": 1,
  "observationId": "uuid",
  "status": "submitted",
  "captureLocation": {"lat": 13.7563, "lng": 100.5018},
  "sameSpeciesInSession": true,
  "changedAt": "2026-08-03T10:12:00Z"
}
```

Drafts are never emitted as teacher-map markers.

### AI analysis state

```json
{
  "type": "observation.analysis_changed",
  "version": 1,
  "observationId": "uuid",
  "analysisRunId": "uuid",
  "status": "succeeded",
  "changedAt": "2026-08-03T10:08:00Z"
}
```

### Review state

```json
{
  "type": "observation.review_changed",
  "version": 1,
  "observationId": "uuid",
  "status": "revision_required",
  "reviewedAt": "2026-08-03T10:20:00Z"
}
```

## 13. Map/detail read models

### Session map

Returns GeoJSON or equivalent marker DTOs based on capture location, status, accessible display name, main thumbnail, and same-species tag.

### Plant detail

Returns authorized display data:

- gallery;
- capture metadata;
- student submission versions;
- AI candidates/traits;
- student checks/corrections;
- related same-species records;
- teacher review history;
- final verified identity.

The completed-session endpoint uses the same read model with historical live-location data omitted or restricted.

## 14. Idempotency and concurrency

- Client-created observation ID is unique per student.
- Media upload uses deterministic media IDs/paths.
- Queue requests use idempotency keys.
- Submit uses optimistic version checking.
- Group activation is atomic and database-enforced.
- Retry returns existing resources rather than duplicating them.