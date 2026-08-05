# API and Realtime Contracts

## 1. Principles

- Trusted mutations use typed server actions, route handlers, or PostgreSQL RPCs.
- Validate inputs and Gemini output with Zod.
- Database transactions and constraints provide correctness.
- Realtime events are change signals; clients refetch authoritative data.
- Every sensitive mutation is authorized, auditable, and idempotent where retries are possible.
- Secrets never reach the browser.

## 2. Core operations

### Authentication, identity, and platform operations

```text
POST /api/auth/sign-up
GET  /api/auth/callback
POST /api/auth/resend-confirmation
POST /api/auth/forgot-password
POST /api/auth/update-password
POST /api/auth/sign-out

GET  /api/me
PUT  /api/me/profile
POST /api/teacher-invitations/:token/accept

GET  /api/admin/users
GET  /api/admin/users/:id
GET  /api/admin/schools
POST /api/admin/schools
POST /api/admin/schools/:id/teacher-invitations
POST /api/admin/teacher-invitations/:id/revoke
GET  /api/admin/audit-events
GET  /api/admin/errors
GET  /api/admin/flow-health
GET  /api/admin/incidents
POST /api/admin/incidents/:id/acknowledge
POST /api/admin/incidents/:id/notes
POST /api/admin/break-glass
POST /api/admin/break-glass/:id/approve
POST /api/admin/break-glass/:id/revoke
```

### Classes and invitations

```text
POST /api/classes
PUT  /api/classes/:id/group-settings
POST /api/classes/:id/invites
POST /api/classes/:id/invites/:inviteId/disable
POST /api/classes/join
POST /api/classes/:id/group-formation/open
POST /api/classes/:id/group-formation/close
GET  /api/classes/:id/group-board
GET  /api/classes/:id/members
GET  /api/classes/:id/groups/:groupId
GET  /api/groups/:id/eligible-classmates
DELETE /api/groups/:id/members/:studentId
```

### Groups

```text
POST /api/groups
PUT  /api/groups/:id
POST /api/groups/:id/invitations
POST /api/group-invitations/:id/accept
POST /api/group-invitations/:id/decline
POST /api/group-invitations/:id/cancel
POST /api/groups/:id/transfer-leadership
POST /api/groups/:id/ready

POST /api/classes/:id/groups
POST /api/classes/:id/groups/move-student
POST /api/groups/:id/change-leader
POST /api/groups/:id/approve
POST /api/groups/:id/lock
POST /api/groups/:id/unlock
DELETE /api/groups/:id
POST /api/groups/:id/archive
POST /api/classes/:id/group-creation-claims/:studentId/reset
```

### Notifications

```text
GET  /api/notifications
POST /api/notifications/:id/read
POST /api/notifications/read-all
```

### Sessions and observations

```text
POST /api/activities
GET  /api/activities
GET  /api/activities/:id
PUT  /api/activities/:id
POST /api/activities/:id/publish
POST /api/sessions
GET  /api/sessions
GET  /api/sessions/:id
GET  /api/sessions/:id/group-queue
POST /api/sessions/:id/open
POST /api/sessions/:id/activate-group
POST /api/sessions/:id/pause
POST /api/sessions/:id/resume
POST /api/sessions/:id/groups/:groupId/complete
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
POST /api/observations/:id/unlock-request
POST /api/observations/:id/unlock-request/:requestId/grant
POST /api/observations/:id/report
GET  /api/observations
GET  /api/reviews
GET  /api/sessions/:id/map
GET  /api/observations/:id/details

POST /api/exports
GET  /api/exports
GET  /api/exports/:id
GET  /api/exports/:id/download
```

Literal REST routes are optional; equivalent server actions/RPC contracts are valid.

## 3. Standard response and errors

```json
{
  "data": {},
  "error": null,
  "requestId": "uuid"
}
```

Error responses use one envelope:

```json
{
  "data": null,
  "error": {
    "code": "GROUP_LIMIT_REACHED",
    "message": "A safe localized fallback message.",
    "retryable": false,
    "details": {}
  },
  "requestId": "uuid"
}
```

Do not return stack traces, secrets, signed URLs, raw provider payloads, or unauthorized resource identifiers in `details`.

Stable auth/admin errors:

```text
AUTH_REQUIRED
EMAIL_REQUIRED
EMAIL_NOT_CONFIRMED
INVALID_CREDENTIALS
PASSWORD_POLICY_FAILED
AUTH_CALLBACK_INVALID
RECOVERY_LINK_INVALID
ACCOUNT_DISABLED
TEACHER_INVITE_REQUIRED
TEACHER_INVITE_INVALID
TEACHER_INVITE_EXPIRED
ADMIN_REQUIRED
MFA_REQUIRED
TELEMETRY_SOURCE_UNAVAILABLE
CONFIGURATION_INVALID
BREAK_GLASS_REQUIRED
BREAK_GLASS_EXPIRED
INVALID_CURSOR
TIME_RANGE_TOO_LARGE
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_REUSE
```

`CONFIGURATION_INVALID` is reserved for operational readiness checks. It
returns `503` with only invalid environment field names in safe details; it
never returns configured values.

Stable group/class errors:

```text
FORBIDDEN
CLASS_NOT_ACTIVE
INVITE_INVALID
INVITE_EXPIRED
INVITE_DISABLED
GROUP_FORMATION_CLOSED
STUDENT_GROUP_CREATION_DISABLED
GROUP_LIMIT_REACHED
STUDENT_ALREADY_IN_GROUP
STUDENT_GROUP_ALREADY_CREATED
GROUP_FULL
GROUP_LOCKED
NOT_GROUP_LEADER
LEADER_SUCCESSOR_REQUIRED
GROUP_HAS_SESSION_HISTORY
GROUP_IN_ACTIVE_SESSION
INVITATION_NOT_PENDING
INVITATION_EXPIRED
DESTINATION_GROUP_INVALID
```

Stable field-work errors:

```text
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
FIELD_NOT_UNLOCKED_FOR_REVISION
SESSION_PAUSED
RATE_LIMITED
```

Every code above requires a defined UI state before the feature that raises it ships. `UI_CONTRACTS.md` defines the required mappings, including `RATE_LIMITED` and `CLASS_NOT_ACTIVE` (D-060).

`OBSERVATION_VERSION_CONFLICT` blocks the second writer, states the reason, and returns the refreshed record with a repeat action (D-052).

### HTTP, pagination, and idempotency rules

- Domain validation returns `422`; authorization returns `403`; missing authorized resource returns `404`; state/version/idempotency contention returns `409`; rate limiting returns `429` with retry guidance; unexpected dependency/server failure returns `5xx` and `retryable=true` only when safe.
- Contracts evolve additively. A breaking shape requires a new explicit API/schema version.
- Mutable/growing lists use opaque cursor pagination ordered by a documented stable tuple, normally `(created_at desc, id desc)`.
- Default list size is 50 and maximum is 100. Responses return `items`, `nextCursor`, and `hasMore`; total count is optional and separate.
- Admin error/audit searches default to the previous 24 hours and reject ranges beyond 31 days without a narrower archive/export operation.
- Non-idempotent POST mutations require an `Idempotency-Key` UUID unless the underlying RPC is naturally keyed by a client-generated resource ID.
- Idempotency scope is caller + operation. Entries live for 24 hours. Same key/same request returns the stored response; same key/different request hash returns `IDEMPOTENCY_KEY_REUSE`; an in-flight duplicate returns `409`.
- Clients honor `Retry-After` for `429` and use exponential backoff with jitter for retryable failures.

Paginated response:

```json
{
  "data": {
    "items": [],
    "nextCursor": null,
    "hasMore": false
  },
  "error": null,
  "requestId": "uuid"
}
```

## 4. Create class

```json
{
  "schoolId": "uuid",
  "name": "Biology M.4/1",
  "subject": "Biology",
  "academicYear": "2569",
  "semester": "2",
  "groupSettings": {
    "minimumSize": 3,
    "maximumSize": 5,
    "maximumGroups": 5,
    "allowStudentGroups": true,
    "formationStatus": "open"
  }
}
```

The authenticated user must have trusted teacher capability and an active teacher membership in `schoolId`. The teacher becomes an active class teacher member in the same transaction.

## 5. Join class

```json
{
  "inviteCode": "BIO4-A7K9"
}
```

The server validates confirmed email, active student account capability, class/school status, expiry, disabled state, usage count, and existing membership. The resulting role is always `student`; the same transaction creates an active student school membership when one does not already exist.

## 6. Group board

```json
{
  "classId": "uuid",
  "formationStatus": "open",
  "maximumGroups": 5,
  "currentGroupCount": 4,
  "remainingGroupSlots": 1,
  "minimumGroupSize": 3,
  "maximumGroupSize": 5,
  "viewer": {
    "currentGroupId": null,
    "hasCreatedStudentGroup": false,
    "canCreateGroup": true,
    "cannotCreateReason": null
  },
  "groups": [
    {
      "id": "uuid",
      "name": "Green Explorers",
      "status": "forming",
      "leader": {"id": "uuid", "displayName": "Student A"},
      "memberCount": 3,
      "maximumSize": 5,
      "isAcceptingMembers": true
    }
  ]
}
```

When all slots are occupied, return `canCreateGroup=false` and `cannotCreateReason="GROUP_LIMIT_REACHED"`. The UI disables the button and explains why.

## 7. Atomic student group creation

```json
{
  "classId": "uuid",
  "name": "Green Explorers",
  "description": "Group 1"
}
```

The server invokes `create_student_group`. It locks class configuration, validates eligibility, reserves a slot, creates the group, stores the creation claim, and assigns the creator as the sole leader.

If two students race for the final slot:

```text
one request succeeds
one request returns GROUP_LIMIT_REACHED
```

The losing client refetches the group board.

## 8. Group invitation

Send:

```json
{
  "inviteeId": "uuid"
}
```

Validate same class, active membership, unassigned invitee, unlocked group, capacity, current leader/teacher permission, and no duplicate pending invitation.

Notification payload:

```json
{
  "notificationType": "group_invitation_received",
  "groupId": "uuid",
  "groupName": "Green Explorers",
  "leaderDisplayName": "Student A",
  "memberCount": 2,
  "maximumSize": 5,
  "invitationId": "uuid"
}
```

Acceptance revalidates current membership and capacity. Stale invitations never bypass constraints.

## 9. Leadership and teacher movement

Transfer leadership:

```json
{
  "newLeaderId": "uuid",
  "expectedGroupVersion": 4
}
```

The transaction changes the old leader to member and the selected member to leader without exposing a zero-leader or two-leader committed state.

Teacher move:

```json
{
  "studentId": "uuid",
  "sourceGroupId": "uuid",
  "destinationGroupId": "uuid",
  "successorLeaderId": "uuid-or-null"
}
```

Validate teacher role, same class, destination capacity, active-session restrictions, and successor requirement. Historical session snapshots remain unchanged. Success creates notification, audit history, and group-change signal.

## 10. Delete or archive group

```json
{
  "memberHandling": "return_unassigned",
  "moves": []
}
```

- Unused group: soft-delete, cancel invitations, update members, restore a group slot.
- Group with session history: archive.
- Affected active session: return `GROUP_IN_ACTIVE_SESSION`.
- Notify affected users.

## 11. Notifications

```json
{
  "unreadCount": 3,
  "items": [
    {
      "id": "uuid",
      "type": "student_moved_group",
      "title": "Group changed",
      "message": "Your teacher moved you to Plant Hunters.",
      "entityType": "group",
      "entityId": "uuid",
      "payload": {},
      "readAt": null,
      "createdAt": "2026-08-03T12:00:00Z"
    }
  ]
}
```

Notifications are durable rows. Email is out of scope for the MVP.

## 12. Group and notification Realtime

Private channels:

```text
class:{classId}:groups
user:{userId}:notifications
```

Group events:

```text
group.created
group.updated
group.deleted
group.archived
group.locked
group.unlocked
group.member_joined
group.member_left
group.member_moved
group.leader_changed
group.invitation_changed
group.capacity_changed
group.formation_changed
```

Example:

```json
{
  "type": "group.created",
  "version": 1,
  "classId": "uuid",
  "groupId": "uuid",
  "changedAt": "2026-08-03T10:00:00Z"
}
```

Notification signal:

```json
{
  "type": "notification.created",
  "version": 1,
  "notificationId": "uuid",
  "recipientId": "uuid",
  "changedAt": "2026-08-03T10:00:00Z"
}
```

Clients use:

```text
initial fetch
→ private subscription
→ signal received
→ invalidate/refetch authoritative query
```

Also refetch on foreground, network reconnect, Realtime reconnect, and mutation completion. Five-second polling is not the primary mechanism. Optional slow fallback polling is acceptable.

## 13. Start observation

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

Validate participant and active-group state. Never fabricate coordinates.

## 14. Media upload

```text
mime: image/jpeg | image/png | image/webp
maximum bytes: 5 MB
maximum longest edge: 2,048 px
position: 1–10
category: whole_plant | leaf | leaf_underside | stem_trunk | flower | fruit | habitat | other
```

At least one `whole_plant` image is required before submission.

## 15. Queue Gemini analysis

```json
{
  "observationId": "uuid",
  "mediaIds": ["uuid"],
  "requestedSchemaVersion": "plant-analysis-v1"
}
```

Create `ai_analysis_run`, enqueue a durable message, and return the existing run on idempotent retry.

## 16. Gemini normalized result

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

Every response has a schema version. Missing evidence is `null` or explicit, never invented.

## 17. Student review and submission

Student review supports:

```text
match
not_match
unsure
not_visible
```

Manual entry remains valid after Gemini failure. Submission requires Thai/common name, scientific name, evidence note, whole-plant image, valid review/manual path, and same-species acknowledgement when applicable.

Same-species response example:

```json
{
  "sameSpeciesInSession": true,
  "sameSpeciesCount": 2,
  "candidates": [
    {
      "observationId": "uuid",
      "relationshipType": "same_species",
      "scientificName": "Mangifera indica",
      "possibleSameSpecimen": false
    }
  ]
}
```

A match warns the student, tags the observation, permits submission, and creates a teacher notification.

## 18. Teacher review

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

Teacher corrections never overwrite AI or student history. Review results create student notifications.

## 19. Session Realtime and map

Channels:

```text
session:{sessionId}:group:{groupId}
session:{sessionId}:teachers
session:{sessionId}:observations
user:{userId}:observation-jobs
```

Observation marker signal:

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

Drafts never appear on the teacher map. Session map and plant details use authorized read models and capture location.

## 20. Idempotency and concurrency

- Class invite use is atomic.
- Student group creation atomically reserves group slots.
- Invitation acceptance rechecks membership and capacity.
- Leadership transfer and teacher moves are atomic.
- Session group activation is atomic and database-enforced.
- Client-generated observation IDs prevent duplicate drafts.
- Media and AI jobs use deterministic IDs/idempotency keys.
- Submission uses optimistic version checks.

## 21. Authentication and trusted provisioning

Logical signup input:

```json
{
  "email": "student@example.edu",
  "password": "long passphrase",
  "returnTo": "/join/opaque-invite-token"
}
```

`returnTo` must resolve to an allowlisted same-origin route. Signup never accepts account type, class role, school ID, class ID, or admin flag. Until confirmation, return `EMAIL_NOT_CONFIRMED` for protected reads.

The PKCE callback consumes the authorization code, validates state/redirect, bootstraps the default student profile, and then resumes the invitation flow. Server route protection validates signed current claims; it does not treat an unvalidated cookie session as proof.

Teacher invitation acceptance:

```json
{
  "token": "opaque-token"
}
```

The server hashes the token, validates pending/expiry/school state, compares the normalized invitation email with the confirmed Auth email, and atomically grants teacher account type plus school membership. The token is single-use and never stored in logs.

Password-reset and confirmation resend responses do not reveal whether an arbitrary email is registered. Production mail uses custom SMTP; local tests use Mailpit.

## 22. Class, group, activity, session, and work-queue read models

Class members:

```text
GET /api/classes/:id/members?role=student&status=active&limit=50&cursor=opaque
```

Teacher results include permitted email/join/group fields. Student results omit email and expose only active classmates plus permitted group assignment. Stable order is `(display_name asc, id asc)` with the full tuple encoded in the cursor.

Eligible classmates return only active, unassigned student members who are not already pending for the same group and whose acceptance would not exceed current capacity. The response is advisory; send/accept mutations revalidate.

Leader member removal is an atomic trusted operation available only before lock/active-session restriction. It cannot remove the leader without an explicit same-operation successor transfer and emits history, notification, and group invalidation.

Activity write model:

```json
{
  "title": "Plant survey 1",
  "description": "Field survey",
  "instructions": "Stay inside the boundary.",
  "expectedVersion": 3,
  "geometry": {
    "boundary": {"type": "Polygon", "coordinates": []},
    "route": {"type": "LineString", "coordinates": []},
    "checkpoints": [
      {
        "sequenceNumber": 1,
        "title": "Start",
        "instructions": "Meet here",
        "location": {"type": "Point", "coordinates": [100.5018, 13.7563]},
        "radiusM": 20
      }
    ]
  },
  "plugin": {
    "key": "plant_survey",
    "schemaVersion": 1,
    "config": {}
  }
}
```

All GeoJSON coordinates are `[longitude, latitude]` in WGS84/SRID 4326. Boundary must be a valid non-empty Polygon, route a valid LineString, checkpoint sequence unique, and complexity within documented database limits. Publishing creates an immutable published version; sessions reference that version. Editing after publish creates a new draft version.

Session detail returns activity version, queue order, authorized participant summary, current session/group status, route/boundary/checkpoints, state freshness, and allowed actions. Waiting students never receive peer live locations. Teacher live read models may include named current positions but not unrestricted historical tracks.

Student observation list:

```text
GET /api/observations?classId=&activityId=&status=&limit=50&cursor=opaque
```

It returns only the caller's authorized observations across classes, ordered by `(updated_at desc, id desc)`, plus local-sync reconciliation keys where safe.

Teacher review queue:

```text
GET /api/reviews?classId=&sessionId=&status=&sameSpecies=&limit=50&cursor=opaque
```

It returns submitted/resubmitted items authorized to the teacher, ordered by `(latest_submitted_at asc, id asc)` so oldest work is reviewed first.

## 23. Admin operations contracts

Every `/api/admin/*` operation requires a current active platform-admin grant. Admin mutations and sensitive reads require MFA at `aal2`. Routine results are redacted by the server before serialization.

User directory:

```text
GET /api/admin/users?accountType=teacher&schoolId=&status=active&query=&limit=50&cursor=opaque
```

```json
{
  "id": "uuid",
  "email": "teacher@example.edu",
  "displayName": "Teacher A",
  "accountType": "teacher",
  "status": "active",
  "emailVerified": true,
  "schoolSummaries": [],
  "classCount": 3,
  "lastSignInAt": "2026-08-04T08:00:00Z"
}
```

Audit/error explorer:

```text
GET /api/admin/audit-events?from=&to=&actorId=&action=&resourceType=&outcome=&limit=50&cursor=opaque
GET /api/admin/errors?from=&to=&flow=&stage=&code=&release=&environment=&traceId=&limit=50&cursor=opaque
```

Error items include flow/stage/code/severity/time/release/fingerprint/request/trace correlation and allowlisted redacted context. They never include access/refresh tokens, cookies, passwords, SMTP/Gemini keys, signed URLs, exact coordinates, image bytes/URLs, or student evidence free text.

Flow health returns freshness plus low-cardinality aggregates:

```json
{
  "window": {"from": "...", "to": "..."},
  "freshAt": "...",
  "flows": [
    {
      "flow": "observation_upload",
      "requests": 120,
      "successRate": 0.975,
      "p95Ms": 1800,
      "topErrorCodes": [{"code": "IMAGE_TOO_LARGE", "count": 2}]
    }
  ],
  "queues": {
    "analysisDepth": 4,
    "oldestMessageAgeSeconds": 12,
    "deadLetterCount": 0
  }
}
```

Incident acknowledgement/note writes are idempotent, append-only where applicable, and return the updated incident. Source audit/error events cannot be edited.

Break-glass access is a separate server contract requiring reason, exact resource type/ID, expiry of at most one hour, MFA reauthentication, and immutable audit. It is not a generic admin query parameter. Deployment policy may require approval by a second active admin before activation.

## 24. Revision access, issue reports, and exports

Unlock request:

```json
{
  "fieldKeys": ["scientific_name", "trait:leaf_arrangement"],
  "reason": "พบหลักฐานเพิ่มจากต้นจริง"
}
```

The owner may create one pending request per observation. Teacher grant supplies the exact allowed field keys; a grant does not unlock unrelated fields. Decisions create notifications and audit/status events.

Issue report:

```json
{
  "type": "identity",
  "reason": "ชื่อพืชอาจไม่ตรงกับรูป"
}
```

Creation enforces one report per reporter/observation per rolling 24 hours and returns `RATE_LIMITED` with retry guidance when exceeded. Owner-facing observation data never exposes reporter identity.

Export request:

```json
{
  "classId": "uuid",
  "sessionId": "uuid",
  "type": "csv",
  "filters": {
    "statuses": ["verified"],
    "includeResearchFields": false
  }
}
```

The request requires an `Idempotency-Key`. Small exports may complete synchronously; large exports return `202` with an export resource. Generation reauthorizes the requester, snapshots scope, uses the versioned schema in `PRIVACY_RETENTION_AND_RESEARCH.md`, writes a private artifact, and creates `export_ready` only after commit.

Download reauthorizes current teacher/admin scope, returns a short-lived authorized response, and never places permanent public URLs in rows or notifications. Artifacts expire after seven days.
