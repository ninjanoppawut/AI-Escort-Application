# API and Realtime Contracts

## 1. Principles

- Trusted mutations use typed server actions, route handlers, or PostgreSQL RPCs.
- Validate inputs and Gemini output with Zod.
- Database transactions and constraints provide correctness.
- Realtime events are change signals; clients refetch authoritative data.
- Every sensitive mutation is authorized, auditable, and idempotent where retries are possible.
- Secrets never reach the browser.

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
POST /api/sessions
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
GET  /api/sessions/:id/map
GET  /api/observations/:id/details
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

Every code above requires a defined UI state before the feature that raises it ships. `RATE_LIMITED` and `CLASS_NOT_ACTIVE` are currently unmapped (D-060).

`OBSERVATION_VERSION_CONFLICT` blocks the second writer, states the reason, and returns the refreshed record with a repeat action (D-052).

## 4. Create class

```json
{
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

The authenticated teacher becomes an active teacher member in the same transaction.

## 5. Join class

```json
{
  "inviteCode": "BIO4-A7K9"
}
```

The server validates expiry, disabled state, usage count, and existing membership. The resulting role is always `student`.

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
