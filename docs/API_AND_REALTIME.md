# API and Realtime Contracts

## 1. API principles

- Use typed server actions or route handlers for trusted mutations.
- Use Supabase RLS-protected reads where appropriate.
- Validate all input and normalized Gemini output with Zod.
- Mutations that change workflow status must be idempotent and auditable.
- Secrets and privileged credentials never reach the browser.
- Database transactions and constraints provide correctness; Realtime only keeps clients responsive.
- The client refetches authoritative data after relevant Realtime events rather than trusting event payloads as final state.

## 2. Core operations

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
```

### Student-led groups

```text
POST /api/groups
PUT  /api/groups/:id
POST /api/groups/:id/invitations
POST /api/group-invitations/:id/accept
POST /api/group-invitations/:id/decline
POST /api/group-invitations/:id/cancel
POST /api/groups/:id/transfer-leadership
POST /api/groups/:id/ready
```

### Teacher group management

```text
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

### In-app notifications

```text
GET  /api/notifications
POST /api/notifications/:id/read
POST /api/notifications/read-all
```

### Activities, sessions, and observations

```text
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

## 4. Create class contract

Request:

```json
{
  "name": "Biology M.4/1",
  "subject": "Biology",
  "academicYear": "2569",
  "semester": "2",
  "description": null,
  "groupSettings": {
    "minimumSize": 3,
    "maximumSize": 5,
    "maximumGroups": 5,
    "allowStudentGroups": true,
    "formationStatus": "open"
  }
}
```

The authenticated teacher becomes an active class teacher membership in the same transaction.

## 5. Join class contract

```json
{
  "inviteCode": "BIO4-A7K9"
}
```

The trusted operation validates expiration, disabled state, usage count, and existing membership. The role is always created as `student`; the caller cannot select a role.

## 6. Class group-board read model

```json
{
  "classId": "uuid",
  "formationStatus": "open",
  "allowStudentGroups": true,
  "maximumGroups": 5,
  "currentGroupCount": 4,
  "remainingGroupSlots": 1,
  "minimumGroupSize": 3,
  "maximumGroupSize": 5,
  "viewer": {
    "isStudent": true,
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

When `currentGroupCount == maximumGroups`, `canCreateGroup=false` and `cannotCreateReason="GROUP_LIMIT_REACHED"`. The Create Group button should be disabled with explanatory text rather than silently removed.

## 7. Student group creation contract

Request:

```json
{
  "classId": "uuid",
  "name": "Green Explorers",
  "description": "Group 1"
}
```

The server invokes the atomic `create_student_group` operation. It locks the class group configuration, validates eligibility, reserves one group slot, creates the group, creates the student group-creation claim, and assigns the creator as the sole leader.

Two requests racing for the final slot return:

```text
one success
one GROUP_LIMIT_REACHED
```

The losing client must refetch the group board and display that another student created the final available group.

## 8. Group invitation contract

### Send invitation

```json
{
  "inviteeId": "uuid"
}
```

The server validates that the caller is the current group leader or an authorized teacher, the invitee is in the same class, the invitee is unassigned, the group is not full/locked, and no duplicate pending invitation exists.

### Invitation notification payload

```json
{
  "notificationType": "group_invitation_received",
  "groupId": "uuid",
  "groupName": "Green Explorers",
  "leaderId": "uuid",
  "leaderDisplayName": "Student A",
  "memberCount": 2,
  "maximumSize": 5,
  "invitationId": "uuid"
}
```

### Accept invitation

The acceptance endpoint rechecks eligibility and capacity. A stale invitation cannot bypass the one-group-per-class rule.

## 9. Transfer leadership contract

```json
{
  "newLeaderId": "uuid",
  "expectedGroupVersion": 4
}
```

The operation atomically changes the old leader to `member` and the selected active member to `leader`. It must never expose a committed state with zero or multiple active leaders.

## 10. Teacher move-student contract

```json
{
  "studentId": "uuid",
  "sourceGroupId": "uuid",
  "destinationGroupId": "uuid",
  "successorLeaderId": "uuid-or-null",
  "expectedSourceVersion": 3,
  "expectedDestinationVersion": 5
}
```

Validation includes:

- teacher role in the class;
- same class for source/destination;
- destination capacity;
- no affected active exploration session;
- successor required when moving a leader from a non-empty group;
- historical session snapshots remain unchanged.

Success creates a durable in-app notification for the student and emits a class group-change event.

## 11. Delete/archive group contract

```json
{
  "memberHandling": "return_unassigned",
  "moves": []
}
```

Allowed member-handling strategies:

```text
return_unassigned
move_members
```

Behavior:

- unused group: soft-delete, cancel pending invitations, update memberships, restore a group slot;
- group with session history: archive, never hard-delete;
- active session dependency: reject with `GROUP_IN_ACTIVE_SESSION`;
- affected users receive in-app notifications.

## 12. Notification read model

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

Notifications are durable database records. Email is not required for the MVP.

## 13. Group Realtime channels

Use private channels:

```text
class:{classId}:groups
user:{userId}:notifications
```

Recommended group events:

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

Example event:

```json
{
  "type": "group.created",
  "version": 1,
  "classId": "uuid",
  "groupId": "uuid",
  "changedAt": "2026-08-03T10:00:00Z"
}
```

The event is a signal to invalidate/refetch the group board. Clients should not compute authorization or capacity solely from the event payload.

### Notification event

```json
{
  "type": "notification.created",
  "version": 1,
  "notificationId": "uuid",
  "recipientId": "uuid",
  "changedAt": "2026-08-03T10:00:00Z"
}
```

The recipient refetches unread count/items.

## 14. Client synchronization strategy

For group and notification screens:

```text
initial fetch
→ subscribe to private Realtime channel
→ relevant event arrives
→ invalidate/refetch authoritative query
```

Also refetch when:

- browser/app returns to foreground;
- network reconnects;
- Realtime reconnects;
- a create/join/move/delete operation succeeds or fails.

Do not use a five-second polling loop as the primary design. An optional 30–60 second fallback poll while the screen is open is acceptable, but not required when focus/reconnect refetch is implemented.

## 15. Start observation

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

## 16. Media upload contract

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

## 17. Queue Gemini analysis

```json
{
  "observationId": "uuid",
  "mediaIds": ["uuid"],
  "requestedSchemaVersion": "plant-analysis-v1"
}
```

The endpoint writes `ai_analysis_runs` and publishes a durable queue message. Repeated requests with the same idempotency key return the existing run.

## 18. Gemini normalized result contract

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
    "flower": {"value": null, ""visibility": "not_visible"}
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

## 19. Student review contract

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
    }
  ],
  "additionalTraits": {},
  "studentEvidenceNote": "short evidence statement"
}
```

Manual entry is valid even when Gemini fails. Submission still requires Thai/common and scientific names.

## 20. Related-observation contract

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

The student may submit after acknowledging the warning. The server writes `same_species_in_session=true`, exposes the tag to the teacher, and creates an in-app teacher notification.

## 21. Submit/resubmit contract

```json
{
  "expectedObservationVersion": 4,
  "commonName": "มะม่วง",
  "scientificName": "Mangifera indica",
  "evidenceNote": "leaf and trunk characteristics checked",
  "sameSpeciesAcknowledged": true
}
```

Resubmission creates a new immutable submission row and updates the current observation status.

## 22. Teacher review contract

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

Teacher corrections never overwrite AI results or student submission history. Review decisions create student in-app notifications.

## 23. Session Realtime channels

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

## 24. Map/detail read models

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

## 25. Idempotency and concurrency

- Class invite use is atomic.
- Student group creation locks class configuration and reserves group slots atomically.
- Group invitation acceptance rechecks membership and capacity.
- Leadership transfer and teacher moves are atomic.
- Client-created observation ID is unique per student.
- Media upload uses deterministic media IDs/paths.
- Queue requests use idempotency keys.
- Submit uses optimistic version checking.
- Exploration group activation is atomic and database-enforced.
- Retry returns existing resources rather than duplicating them.
