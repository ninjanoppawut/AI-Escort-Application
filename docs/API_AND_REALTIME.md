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
POST /api/classes/:id/invites/:inviteId/rotate
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

Stable activity and session setup errors (added in P6, additive):

```text
VALIDATION_FAILED
ACTIVITY_GEOMETRY_INVALID
ACTIVITY_VERSION_CONFLICT
ACTIVITY_NOT_PUBLISHED
SESSION_ALREADY_RUNNING
```

`VALIDATION_FAILED` and `ACTIVITY_GEOMETRY_INVALID` return `422` with safe
details naming only the failing field (`fields`, `field`, or a publish
`reason` with `sequenceNumber`); the other three return `409`.

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

P1-03 class operations are implemented as authenticated route handlers backed by trusted PostgreSQL RPCs:

- `create_class` validates active confirmed teacher capability and school membership, locks the school row, creates the class and creator class-teacher membership atomically, and emits `class_created`.
- `update_class_group_settings` validates active class-teacher membership, locks the class row, updates minimum/maximum group size, maximum group count, student-creation flag, and formation status, and emits `class_group_settings_updated`.
- `issue_class_invite` validates active class-teacher membership, creates one code and one raw link token, stores only the token hash, returns the raw token once for link/QR display, and emits `class_invitation_issued`.
- `disable_class_invite` is idempotent for an already disabled invite and emits `class_invitation_disabled` only for the first state change.
- `rotate_class_invite` locks the source invite, disables it, creates a replacement invite, returns the replacement token once, and emits `class_invitation_rotated`.

Teacher invite-management routes reject URL class/invite mismatches before invoking mutation RPCs.

## 5. Join class

```json
{
  "inviteCode": "BIO4-A7K9"
}
```

Link/QR landing submits the opaque bearer token instead:

```json
{
  "token": "opaque-link-token"
}
```

P1-04 implements `POST /api/classes/join` as a same-origin authenticated route
backed by `join_class_with_invite(text,text)`. The server validates confirmed
email, active student account capability, active class/school status, invite
lookup by code or token hash, expiry, disabled state, usage count, and existing
membership. The resulting role is always `student`; the same transaction creates
or reactivates an active student school membership and active class membership
when needed.

Replay by an already active student class member is idempotent and returns
`already_joined=true` without incrementing `used_count` or duplicating join
events. First successful joins emit `class_joined` audit/research events plus
`class_joined` and `student_joined_class` notification rows. Research payloads
exclude invite codes, raw tokens, token hashes, emails, and free text.

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

P3-03 implements `GET /api/classes/:id/group-board` backed by
`get_class_group_board(uuid)`. Additive fields beyond the example: `className`,
`allowStudentGroups`, `viewer.userId`, `viewer.role`, `viewer.isLeader`,
per-group `description`, `creatorType`, `availableSeats`, `meetsMinimumSize`,
`members` (`id`, `displayName`, `role`), `createdAt`, top-level
`unassignedStudents` (`id`, `displayName`), and `refreshedAt`. Groups are
ordered by `(createdAt, id)`; soft-deleted and archived groups are excluded.
`cannotCreateReason` follows the `create_student_group` precedence
(`STUDENT_GROUP_CREATION_DISABLED`, `GROUP_FORMATION_CLOSED`,
`STUDENT_ALREADY_IN_GROUP`, `STUDENT_GROUP_ALREADY_CREATED`,
`GROUP_LIMIT_REACHED`) and is `FORBIDDEN` for a teacher viewer. The response is
advisory: creation revalidates under the class row lock. Only active class
members may read it; no email is returned. Errors: `AUTH_REQUIRED` `401`;
`ACCOUNT_DISABLED`/`FORBIDDEN` `403`; `CLASS_NOT_ACTIVE` `409`; malformed class
ID `404`.

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

P3-02 implements `POST /api/groups` backed by
`create_student_group(uuid,text,text)`. The RPC returns one row with `outcome`
(`created` or `denied`), `error_code`, the created group fields, the creator as
`leader_id`, and authoritative `current_group_count`, `maximum_groups`, and
`remaining_group_slots`. Domain denials (`STUDENT_GROUP_CREATION_DISABLED`,
`GROUP_FORMATION_CLOSED`, `STUDENT_ALREADY_IN_GROUP`,
`STUDENT_GROUP_ALREADY_CREATED`, `GROUP_LIMIT_REACHED`) are committed results so
their audit and research events persist; the route maps them to `409` error
envelopes with the slot counts in `details`. `AUTH_REQUIRED` returns `401`;
`ACCOUNT_DISABLED`, `EMAIL_NOT_CONFIRMED`, and `FORBIDDEN` return `403`;
`CLASS_NOT_ACTIVE` returns `409`; an invalid body returns `422`. The operation is
naturally keyed by the one-current-group and one-creation-claim invariants, so a
retried request cannot create a second group and needs no `Idempotency-Key`.

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

P4-02 and P4-03 implement these operations as authenticated routes backed by
trusted RPCs:

- `POST /api/groups/:id/invitations` → `send_group_invitation(uuid,uuid)`.
  Locks the group row; the caller must be the active leader or a class teacher
  (`NOT_GROUP_LEADER` for other classmates, `FORBIDDEN` otherwise). The invitee
  must be an active student of the class. Returns `sent` (`201`) or replays an
  existing pending invitation as `already_pending` (`200`). Committed denials:
  `GROUP_LOCKED`, `GROUP_FORMATION_CLOSED` (students only), `STUDENT_ALREADY_IN_GROUP`,
  and `GROUP_FULL` when active members plus unexpired pending invitations
  already fill `max_group_size`. Invitations expire after 24 hours.
- `GET /api/groups/:id/eligible-classmates` → `list_group_eligible_classmates(uuid)`.
  Leader or class teacher only. Returns `availableSeats`, `canInvite`,
  `cannotInviteReason`, and every other active student with `state`
  `eligible`, `pending` (with `invitationId`, `expiresAt`), or `in_group` (with
  `groupName`). Advisory only; sending revalidates.
- `POST /api/group-invitations/:id/cancel` → `cancel_group_invitation(uuid)`.
  Leader or teacher; idempotent for cancelled invitations; `INVITATION_NOT_PENDING`,
  `INVITATION_EXPIRED`, or `GROUP_LOCKED` (leaders of a locked group) otherwise.
- `POST /api/group-invitations/:id/accept` → `accept_group_invitation(uuid)`.
  Invitee only. Locks the invitee's class membership, the group, then the
  invitation; revalidates pending state, expiry (marking `expired`), group state
  (`DESTINATION_GROUP_INVALID`, `GROUP_LOCKED`), formation, one current group,
  and capacity (`GROUP_FULL`). Success creates or reactivates the member row,
  cancels the invitee's other pending invitations in the class, and notifies the
  leader (`group_invitation_accepted`) and, on reaching minimum size, class
  teachers (`group_minimum_reached`). Replay returns `accepted` again.
- `POST /api/group-invitations/:id/decline` → `decline_group_invitation(uuid)`.
  Invitee only; idempotent for declined invitations; notifies the leader.
- `GET /api/group-invitations/:id` → `get_group_invitation(uuid)` (additive):
  invitee, current leader, or class teacher. Returns effective `status`
  (`expired` once past expiry), group summary with leader, members, and seats,
  inviter, and `viewer.canRespond`/`cannotRespondReason`.
- `GET /api/classes/:id/groups/:groupId` → `get_group_detail(uuid)`: active class
  members; pending invitations are included only for the leader and class
  teachers. A group ID under the wrong class URL returns `404`.

The group board additionally returns `viewer.pendingInvitations`
(`id`, `groupId`, `groupName`, `inviterName`, `expiresAt`). Invitation rows emit
`group.invitation_changed` on the class-group channel without invitee IDs.

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

P4-04 implements the student-leader operations:

- `POST /api/groups/:id/transfer-leadership` with `{ "newLeaderId": "uuid" }` →
  `transfer_group_leadership(uuid,uuid)`. The current leader or a class teacher
  may transfer to an active member of the same group. The RPC locks the group
  row and rechecks leadership after the lock, so a concurrent or stale transfer
  by the former leader raises `NOT_GROUP_LEADER`; it demotes before promoting and
  never commits zero or two leaders. `expectedGroupVersion` is not accepted in
  this slice because the post-lock leadership check provides the stale-write
  protection. Committed denials: `GROUP_LOCKED` and `INVALID_STATUS_TRANSITION`
  (target not an active member). Transferring to the current leader is a no-op.
  Notifications: `leadership_assigned` to the new leader and
  `leadership_transferred` to other active members; research event
  `group_leader_changed` with `reason_category` `leader_transfer` or
  `teacher_change`.
- `POST /api/groups/:id/ready` → `mark_group_ready(uuid)`. Leader only; a
  `forming` group at or above minimum size with open formation becomes `ready`
  and class teachers receive `group_approval_requested`. Replay returns `ready`.
  Denials: `GROUP_LOCKED`, `GROUP_FORMATION_CLOSED`, `INVALID_STATUS_TRANSITION`.
- `DELETE /api/groups/:id/members/:studentId` → `remove_group_member(uuid,uuid)`.
  Leader or class teacher; a leader cannot be removed (`LEADER_SUCCESSOR_REQUIRED`).
  Denials: `GROUP_LOCKED`, `GROUP_FORMATION_CLOSED` (students only). A `ready` group
  that falls below minimum size returns to `forming`. Replay is idempotent.

Active-session restrictions (`GROUP_IN_ACTIVE_SESSION`) apply once sessions exist
in Phase 6–7; teacher moves between groups remain Phase 5.

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

P5 implements teacher group management as authenticated routes backed by
trusted RPCs. Every RPC authorizes `auth.uid()` as a teacher of the group's
class (`FORBIDDEN` otherwise) and locks the class or group row first.

- `POST /api/classes/:id/groups` → `create_teacher_group(...)` with `name`,
  optional `description`, `leaderStudentId`, and `memberStudentIds`. Uses the
  same class-row lock and absolute `maximum_groups` as student creation
  (`GROUP_LIMIT_REACHED`, D-047); `GROUP_FULL`, `STUDENT_ALREADY_IN_GROUP`.
- `POST /api/classes/:id/groups/move-student` → `move_student_between_groups(...)`
  with `studentId`, `destinationGroupId` (null returns the student to
  unassigned), and `successorLeaderId`. `sourceGroupId` is derived under lock.
  Denials: `LEADER_SUCCESSOR_REQUIRED`, `GROUP_FULL`, `GROUP_LOCKED`,
  `DESTINATION_GROUP_INVALID`, `GROUP_IN_ACTIVE_SESSION`. Returns `moved` or
  `unchanged` with `leaderChanged`.
- `POST /api/groups/:id/change-leader` → the P4-04 transfer RPC, recorded as
  `teacher_change`.
- `POST /api/groups/:id/approve` → `approve_group(uuid)`: `forming` or `ready`
  at minimum size becomes `approved`; replay returns `approved`. Denials:
  `GROUP_LOCKED`, `INVALID_STATUS_TRANSITION`, `DESTINATION_GROUP_INVALID`.
  Notifies members (`group_approved`).
- `POST /api/groups/:id/lock` → `lock_group(uuid)`: cancels pending invitations
  and returns `cancelledInvitations`; notifies members (`group_locked`).
- `POST /api/groups/:id/unlock` → `unlock_group(uuid)`: restores `approved` when
  previously approved, otherwise `forming`; `GROUP_IN_ACTIVE_SESSION` while a
  session runs; notifies members (`group_unlocked`).
- `DELETE /api/groups/:id` → `delete_or_archive_group(uuid)`: archives when the
  group has session history, otherwise soft-deletes. Both cancel invitations,
  notify then release active members to unassigned, and return
  `releasedMembers` and `remainingGroupSlots`. The database decides between
  delete and archive, so no separate archive route or `memberHandling` body is
  accepted; explicit re-homing uses move-student first.
- `GET /api/classes/:id/group-creation-claims` → `list_class_creation_claims(uuid)`:
  unreset claims with student, claimed group name and state
  (`current`/`deleted`/`archived`), `canReset`, and `cannotResetReason`.
- `POST /api/classes/:id/group-creation-claims/:studentId/reset` with
  `{ "reason": "..." }` (1–1000 characters) → `reset_group_creation_claim(...)`.
  Allowed only when the claimed group is deleted, archived, or no longer
  contains the student, and no active session blocks it
  (`INVALID_STATUS_TRANSITION`, `GROUP_IN_ACTIVE_SESSION`). Returns `claimId`
  and `auditLogId`; writes a `claim_reset` history row.

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

P3-04 implements `class:{classId}:groups` as private Broadcast sent by database
triggers through `private.send_class_group_signal`. The payload is exactly
`type`, `version`, `classId`, `groupId` (null for class-setting changes), and
`changedAt`; names, members, and invitees are never included. Membership
changes map to `group.member_joined`/`group.member_left`/`group.member_moved`/
`group.leader_changed`; group rows map to `group.created`/`group.updated`/
`group.deleted`/`group.archived`/`group.locked`/`group.unlocked`; class formation
or status changes send `group.formation_changed`; size or maximum-count changes
send `group.capacity_changed`; teacher claim resets send `group.updated`.
Receipt requires active membership in the class named by the topic. The student
board polls every 60 seconds only as a fallback.

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

P1-05 implements `GET /api/classes` and
`GET /api/classes/:id/members?role=&status=&limit=&cursor=` as authenticated
read routes backed by `list_authorized_classes()` and
`list_class_members(uuid,text,text,integer,text,uuid)`. Student class lists
include only active authorized classes. Teacher class lists include authorized
classes, including archived classes so the UI can show the class-not-active
state. Teacher member rows include display name, email, role, status, joined
date, and the current group placeholder. Student member rows include active
student classmates only, omit email, and return `currentGroup=null` until group
tables ship in later phases. The member cursor is an opaque encoding of
`(display_name asc, member_id asc)`; default page size is 50 and the route caps
requests at 100.

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

P6-02 implements the activity write and read models:

- `POST /api/activities` with `classId` plus the write model (without
  `expectedVersion`) → `save_activity_draft(draft, target_class_id)`; returns
  `201` with `activityId`, `activityVersionId`, and `versionNumber` 1.
- `PUT /api/activities/:id` with `expectedVersion` → `save_activity_draft(draft,
  null, target_activity_id, expected_version_number)`. `expectedVersion` is the
  version number the editor loaded (the draft, or the published version when no
  draft exists). Saving replaces the single draft's content atomically, or starts
  the next draft version after a publish. Denials: `ACTIVITY_VERSION_CONFLICT`
  (`currentVersionNumber`, `currentStatus`), `ACTIVITY_GEOMETRY_INVALID`
  (`field`: `boundary`, `route`, or `checkpoints`, including invalid or
  self-intersecting shapes the browser cannot detect), and `VALIDATION_FAILED`.
- `POST /api/activities/:id/publish` with `{ "expectedVersion": n }` →
  `publish_activity`. Requires a boundary, a route that intersects it, and at
  least one checkpoint, all checkpoints covered by the boundary; otherwise
  `ACTIVITY_GEOMETRY_INVALID` with `reason` `boundary_required`,
  `route_required`, `checkpoint_required`, `route_outside_boundary`, or
  `checkpoint_outside_boundary` (`sequenceNumber`). Replaying the published
  version returns `published`. Supersedes the previous version and writes an
  `activity_published` audit row.
- `GET /api/activities?classId=` → `list_class_activities`: teachers see drafts
  and `draftVersionNumber`; students see published activities only. Capped at
  100 items ordered by `(updated_at desc, id desc)`.
- `GET /api/activities/:id` → `get_activity_detail`: activity summary,
  `published` and teacher-only `draft` versions with GeoJSON geometry (7 decimal
  places), plugin config, and `summary` (`boundaryAreaM2`, `routeLengthM`,
  `checkpointCount`).

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
