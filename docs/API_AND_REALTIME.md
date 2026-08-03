# API and Realtime Contracts

## API style

Use typed server actions or route handlers for trusted mutations and Supabase queries for RLS-protected CRUD. Validate every input and every Gemini response with versioned schemas.

## Core operations

```text
POST /api/classes
POST /api/classes/:id/invites
POST /api/classes/join
POST /api/groups
POST /api/activities
POST /api/sessions
POST /api/sessions/:id/open
POST /api/sessions/:id/activate-group
POST /api/observations
POST /api/observations/:id/media
POST /api/observations/:id/analyze
POST /api/observations/:id/student-verifications
POST /api/observations/:id/dedupe
POST /api/observations/:id/duplicate-decision
POST /api/observations/:id/submit
POST /api/observations/:id/review
```

## Standard response

```json
{
  "data": {},
  "error": null,
  "requestId": "uuid"
}
```

Stable errors include:

```text
FORBIDDEN
SESSION_NOT_OPEN
GROUP_NOT_ACTIVE
OUTSIDE_BOUNDARY
POOR_GPS_ACCURACY
ACTIVE_GROUP_CONFLICT
MEDIA_NOT_READY
AI_ANALYSIS_FAILED
AI_SCHEMA_INVALID
STUDENT_REVIEW_INCOMPLETE
DUPLICATE_REVIEW_REQUIRED
VALIDATION_FAILED
RATE_LIMITED
```

## Create observation

```json
{
  "clientGeneratedId": "uuid",
  "sessionId": "uuid",
  "captureLocation": {
    "lat": 13.7563,
    "lng": 100.5018,
    "accuracyM": 8.5,
    "capturedAt": "2026-08-03T10:15:24+07:00"
  }
}
```

## Gemini analysis response

```json
{
  "schemaVersion": 1,
  "analysisRunId": "uuid",
  "identificationStatus": "possible_match",
  "candidates": [
    {
      "taxonId": "provider-id",
      "normalizedTaxonId": "catalog-id-or-null",
      "commonNameTh": "มะม่วง",
      "commonNameEn": "Mango",
      "scientificName": "Mangifera indica",
      "confidence": 0.87,
      "evidenceSummary": "ลักษณะใบสอดคล้องบางส่วน"
    }
  ],
  "visibleTraits": {
    "leafType": "ใบเดี่ยว",
    "leafArrangement": "เรียงสลับ",
    "leafMargin": "ขอบเรียบ",
    "flower": null
  },
  "requestedEvidence": ["leaf_underside"],
  "uncertainties": ["ไม่เห็นดอกหรือผล"],
  "disclaimer": "ผลลัพธ์เป็นข้อเสนอเบื้องต้น"
}
```

## Student verification request

```json
{
  "verifications": [
    {
      "aiTraitId": "uuid",
      "status": "not_match",
      "correctedValue": "ใบเรียงตรงข้าม",
      "evidenceNote": "ตรวจจากกิ่งจริงแล้วพบใบออกเป็นคู่"
    }
  ],
  "selectedIdentificationId": "uuid-or-null",
  "studentIdentification": null
}
```

## Dedupe response

```json
{
  "speciesMatches": [
    {
      "observationId": "uuid",
      "normalizedTaxonId": "taxon-id",
      "reason": "same_normalized_taxon"
    }
  ],
  "specimenCandidates": [
    {
      "candidateId": "uuid",
      "candidateObservationId": "uuid",
      "taxonMatchScore": 0.95,
      "traitSimilarityScore": 0.84,
      "visualSimilarityScore": 0.89,
      "distanceMeters": 3.2,
      "timeDifferenceSeconds": 420,
      "combinedScore": 0.88,
      "recommendation": "possible_same_specimen"
    }
  ]
}
```

Distance alone must never produce a confirmed duplicate.

## Duplicate decision

```json
{
  "candidateId": "uuid",
  "decision": "different_specimen"
}
```

Allowed student decisions:

```text
same_specimen
different_specimen
unsure
```

## Submit observation

```json
{
  "submissionLocation": {
    "lat": 13.7565,
    "lng": 100.502,
    "accuracyM": 12.2,
    "submittedAt": "2026-08-03T10:19:31+07:00"
  },
  "acknowledgeAiIsProvisional": true
}
```

Submission validation must confirm media, Gemini result or documented fallback, required student verification, duplicate acknowledgement, and active-session authorization.

## Teacher review

```json
{
  "decision": "revision_required",
  "feedback": "กรุณาถ่ายภาพด้านใต้ใบเพิ่มเติม",
  "acceptedIdentificationId": null,
  "duplicateDecision": null
}
```

Allowed decisions:

```text
verified
revision_required
unable_to_verify
rejected
```

## Realtime channels

```text
session:{sessionId}:group:{groupId}
session:{sessionId}:teachers
```

### Location event

```json
{
  "type": "location.updated",
  "version": 1,
  "userId": "uuid",
  "lat": 13.7563,
  "lng": 100.5018,
  "accuracyM": 8.5,
  "heading": 125,
  "speedMps": 1.2,
  "capturedAt": "2026-08-03T10:00:00Z"
}
```

### Observation state event

```json
{
  "type": "observation.state_changed",
  "version": 1,
  "observationId": "uuid",
  "status": "submitted",
  "changedAt": "2026-08-03T10:19:31Z"
}
```

### Session state

```json
{
  "type": "session.state_changed",
  "version": 1,
  "sessionId": "uuid",
  "status": "open",
  "activeGroupId": "uuid-or-null",
  "changedAt": "2026-08-03T10:00:00Z"
}
```

## Frequency guidance

- Broadcast moving location every 2–5 seconds.
- Reduce frequency while stationary.
- Persist sampled track data every 10–30 seconds or on meaningful events.
- Presence is not a GPS transport.

## Idempotency

Observation creation, media registration, and submission retries must use client UUID/idempotency keys. Retrying must return the existing resource rather than create duplicates.

## Authorization

- Only an active group member can create or submit an observation.
- Waiting groups cannot publish live location or observations.
- Gemini endpoints are server-only and rate-limited.
- Teacher review is limited to classes the reviewer teaches.
- Dedupe searches must not reveal records outside the caller's authorized scope.
- Realtime subscription is not a replacement for RLS or mutation authorization.