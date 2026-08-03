# API and Realtime Contracts

## API style

Use typed server actions or route handlers for trusted mutations and Supabase queries for RLS-protected CRUD. Validate every input with Zod.

## Core operations

```text
POST /api/classes
POST /api/classes/:id/invites
POST /api/classes/join
POST /api/groups
POST /api/activities
POST /api/activities/:id/submit
POST /api/activities/:id/approve
POST /api/sessions
POST /api/sessions/:id/open
POST /api/sessions/:id/activate-group
POST /api/sessions/:id/complete-group
POST /api/observations
POST /api/observations/:id/submit
POST /api/observations/:id/identify
POST /api/observations/:id/verify
POST /api/ai/plant-identification
POST /api/ai/escort-guidance
```

## Standard response

```json
{
  "data": {},
  "error": null,
  "requestId": "uuid"
}
```

Errors must use stable codes such as `FORBIDDEN`, `SESSION_NOT_OPEN`, `ACTIVE_GROUP_CONFLICT`, `VALIDATION_FAILED`, and `RATE_LIMITED`.

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

### Checkpoint reached

```json
{
  "type": "checkpoint.reached",
  "version": 1,
  "checkpointId": "uuid",
  "groupId": "uuid",
  "userId": "uuid",
  "capturedAt": "2026-08-03T10:05:00Z"
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

### Teacher alert

```json
{
  "type": "teacher.alert",
  "version": 1,
  "severity": "info",
  "message": "กลับเข้าสู่เส้นทางที่กำหนด",
  "requiresAcknowledgement": true,
  "sentAt": "2026-08-03T10:06:00Z"
}
```

## Presence state

```json
{
  "userId": "uuid",
  "role": "student",
  "state": "exploring",
  "joinedAt": "2026-08-03T10:00:00Z",
  "lastHeartbeatAt": "2026-08-03T10:00:20Z"
}
```

## Frequency guidance

- Broadcast moving location every 2–5 seconds.
- Reduce frequency while stationary.
- Persist sampled track data every 10–30 seconds or on meaningful events.
- Presence is not a GPS transport.

## Idempotency

Client-created observations and uploads must include UUID idempotency keys. Retrying a failed sync must return the existing resource instead of creating duplicates.

## Authorization

Realtime subscription alone is not authorization. Channel access, database reads, writes, media URLs, and mutations must each be protected by class/session membership and role checks.