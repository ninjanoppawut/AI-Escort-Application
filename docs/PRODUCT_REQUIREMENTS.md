# Product Requirements

## 1. Product vision

AI Escort is a mobile-first school field-learning platform. A teacher defines a class, activity, route, and exploration boundary. Students explore in groups, but each student creates individual plant observations. The application records where and when a plant was observed, sends images to Gemini for provisional analysis, asks the student to compare the result with the real plant, and sends the completed observation to a teacher for manual review.

AI assists observation; it does not replace student judgment or teacher verification.

## 2. MVP user roles

### Student

- Join a class using an invite code, invitation link, or QR code.
- Create one group in a class when group formation is open and a group slot remains.
- Become the group leader automatically when creating that group.
- Invite eligible classmates through in-app notifications.
- Accept or decline group invitations inside the application.
- Belong to only one active/forming group per class.
- Join an authorized exploration session.
- Preview the route while waiting.
- Publish live location and create observations only while the group is active.
- Create individual observations with 1–10 images.
- Review Gemini plant candidates and visible traits against the real plant.
- Confirm, disagree, mark unsure/not visible, and enter corrected values.
- Enter required Thai/common and scientific names.
- Submit observations even when the same species already exists after acknowledging the warning.
- Revise and resubmit the same observation when requested.
- View the completed activity map and plant details for observations visible in the class/session.

### Group leader

A group leader is a student role scoped to one group. The student who successfully creates a group becomes its first leader.

The leader may:

- rename the group while group formation is unlocked;
- invite eligible classmates from the same class;
- cancel pending invitations;
- remove members before the group is locked;
- transfer leadership to another active member;
- notify the teacher that the group is ready.

The leader may not:

- create another group in the same class;
- force a classmate into the group without acceptance;
- invite a student who is already in another group;
- exceed the teacher-defined maximum group size;
- create a second active leader;
- modify membership during an active session;
- activate the group for exploration.

### Teacher

- Create and manage classes, memberships, groups, activities, routes, boundaries, checkpoints, and sessions.
- Configure group formation: minimum size, maximum size, maximum group count, and open/closed state.
- Generate, disable, rotate, and expire class invites.
- View every group and unassigned student in the class.
- Move a student between groups when allowed.
- Change a group leader.
- Create a group manually.
- Approve, lock, unlock, archive, or delete an unused group.
- Merge or reorganize undersized groups before a session.
- Activate one group at a time.
- View live locations and submitted observation markers.
- Receive a visible same-species tag when a new submission matches a species already submitted in the same session.
- Open a marker to review images, capture location/time, Gemini output, student checks/corrections, related observations, and history.
- Manually verify, correct, request revision, mark unable to verify, or reject.
- Manually complete the session/activity.
- View the post-activity map and export reviewed data.

### Admin

- Manage global accounts, schools, system configuration, AI usage, and restricted audit data.
- Admin access must not bypass school/class scoping in normal UI flows without explicit privileged operations.

## 3. Primary domain structure

```text
School
 └─ Class
     ├─ Memberships
     ├─ Class invites
     ├─ Groups
     │   ├─ One leader
     │   ├─ Members
     │   └─ Group invitations
     └─ Activities
         ├─ Route, boundary, checkpoints
         └─ Exploration sessions
             ├─ Session group queue
             ├─ Participant snapshot
             ├─ Live location
             ├─ Individual observations
             ├─ AI analyses
             ├─ Student revisions
             └─ Teacher reviews
```

An activity is a reusable learning plan. A session is one real execution of that activity.

## 4. Class creation and invitation flow

When creating a class, the teacher enters:

- class name;
- subject;
- academic year and semester;
- optional description;
- minimum and maximum group size;
- maximum number of groups;
- whether students may create groups;
- initial group-formation state: `open` or `closed`.

The system creates the teacher as an active class member with role `teacher`.

The teacher may create class invitations using:

- short class code;
- invitation link;
- QR code based on the invitation link.

An invitation may include:

- expiry time;
- maximum uses;
- disabled/revoked state;
- created-by and usage audit data.

Joining occurs through a trusted server operation that validates the invite and always creates a class-scoped student membership. The browser must not be allowed to choose an arbitrary role or class ID.

## 5. Student-led group formation

### Creating a group

A student may create a group only when all conditions are true:

```text
active student in class
AND student-created groups enabled
AND group formation open
AND student not already in a forming/active group
AND student has not already created a student group in the class
AND current forming/active group count < maximum_groups
```

The group creator becomes the single active leader automatically.

When the maximum group count is reached, the Create Group control becomes disabled, not silently hidden. The UI explains that all group slots are occupied and directs the student to join or accept an invitation from an existing group.

### Realtime group availability

The group screen uses:

1. an authoritative initial database fetch;
2. private Realtime events to invalidate/refetch class-group data immediately;
3. refetch when the app regains focus, reconnects to the network, or reconnects to Realtime.

A fixed five-second poll is not the primary synchronization mechanism. An optional slow fallback poll may be used, but correctness comes from the database transaction and current refetch.

### Preventing race conditions

Group creation occurs through one atomic database operation. If two students attempt to claim the last available group slot, exactly one succeeds. The other receives `GROUP_LIMIT_REACHED`, refetches, and sees the updated state.

### Inviting classmates

The group leader sees only classmates who:

- are active members of the same class;
- are not already active/forming members of another group;
- have not already accepted another invitation;
- can join without exceeding group capacity.

The leader sends an in-app invitation. The classmate accepts or declines. A leader cannot directly force-add another student.

Invitation states:

```text
pending
accepted
declined
cancelled
expired
```

## 6. Group rules and lifecycle

Recommended group statuses:

```text
forming → ready → approved → locked → archived
```

- `forming`: leader may invite classmates and membership may change.
- `ready`: group meets the minimum size and may be submitted for teacher review.
- `approved`: teacher accepts the group configuration.
- `locked`: normal membership changes are blocked for session preparation/participation.
- `archived`: group is no longer used for future sessions but historical records remain.

Locked business rules:

1. Each group has exactly one active leader.
2. A student may belong to only one forming/active group per class.
3. A student may create only one student-created group per class unless a teacher explicitly resets the failed/removed group state.
4. The maximum number of forming/active groups is teacher-configurable and database-enforced.
5. Group capacity is teacher-configurable and database-enforced.
6. Leadership transfer is atomic; a populated group cannot be left without a leader.
7. Teacher actions and leadership changes create audit events and in-app notifications.

## 7. Teacher group management

### Move student between groups

A teacher may move a student when:

- source and destination groups belong to the same class;
- the destination has capacity;
- the student is not currently participating in an active exploration;
- the operation does not leave a populated source group without a leader.

If the student is the source group leader, the teacher must assign a successor, move all remaining members, or delete/archive the now-empty group as part of the same workflow.

A move changes current group membership for future sessions. It never rewrites a historical session snapshot.

### Delete or archive group

- An unused group with no session history may be deleted.
- Pending invitations are cancelled.
- Members return to unassigned state unless the teacher moves them first.
- Deletion restores an available group slot.
- A group already referenced by a session must not be hard-deleted; it is archived.
- Archived groups remain visible in historical maps, reports, observations, and research data.

### Active-session restriction

Normal move, removal, deletion, and leadership changes are blocked while the affected student/group participates in an active session. Emergency removal is a separate teacher-supervised operation with explicit audit history.

### Participant snapshot

When a session is opened, current group membership is copied into session participant records. Later class-group changes affect future sessions only.

## 8. In-app notifications

The MVP uses in-app notifications; email is not required.

Notifications are durable PostgreSQL rows and are delivered immediately while the app is open using private Realtime channels. Users can reopen the app and still see unread notifications.

Student notifications include:

- class joined;
- group invitation received;
- invitation accepted/declined/cancelled;
- moved to another group;
- leadership assigned or transferred;
- group approved, locked, unlocked, archived, or deleted;
- group is next or active;
- teacher requested observation revision;
- additional edit access granted during revision;
- observation verified, unable to verify, or rejected;
- session completed.

Teacher notifications include:

- student joined class;
- group reached minimum size;
- group requested approval;
- new or resubmitted observation;
- same species submitted again in the session;
- student requested additional edit access during revision;
- student reported an issue on an observation;
- important location/session warning.

Every notification type above maps to one of the eight designed row layouts, with a defined icon, Thai copy string, and deep-link target (D-058).

Notification access is recipient-scoped through RLS. Realtime events improve responsiveness but do not replace durable notification rows.

## 9. Locked observation business rules

1. Each observation belongs to one student.
2. A session may contain many groups, but only one may have `active` status at a time.
3. Waiting groups may preview the route but may not publish live location or submit observations.
4. The capture location is the authoritative plant marker location.
5. Capture time and GPS accuracy are stored with the observation.
6. One observation requires at least one whole-plant image and allows at most ten images.
7. Gemini is the MVP analysis provider and is called only from trusted server infrastructure.
8. Gemini output is provisional and must never be silently accepted as verified.
9. Students must review the AI output against the real plant.
10. Submission requires a Thai/common name, scientific name, and short evidence note. A final `unknown` submission is not allowed.
11. If Gemini fails or is unavailable, the student may enter information manually and may use an external reference such as Google Lens.
12. A same-species match inside the same session creates a warning and a teacher-visible tag, but the student may still submit.
13. Same-species and possible-same-specimen are different concepts.
14. Possible same-specimen detection may use taxon identity, morphology, image similarity, location, and time. Distance alone is insufficient.
15. The system never automatically merges or deletes observations.
16. Teacher verification is manual and may correct the final identity while preserving original AI and student values.
17. Revision edits the same observation and preserves revision/submission history.
18. The teacher manually decides when to complete a session/activity.
19. After completion, authorized teachers and participating students may view the result map and click markers to open plant details.

## 10. Core observation workflow

```text
student starts observation
→ capture location, GPS accuracy, and capture time
→ capture 1–10 images
→ preprocess and upload images
→ enqueue Gemini analysis
→ student may continue waiting or enter data manually
→ Gemini returns versioned structured output
→ student reviews every relevant trait against the real plant
→ student confirms/corrects identity and traits
→ system checks same-species and possible specimen relationships
→ student acknowledges warning and submits
→ observation marker becomes visible to teacher
→ teacher manually reviews
   ├─ verified
   ├─ revision_required
   ├─ unable_to_verify
   └─ rejected
→ revision_required returns the same observation to the student
→ student changes/adds evidence and resubmits
```

## 11. Observation statuses

```text
draft
→ images_uploading
→ analysis_queued
→ analysis_running
→ student_review
→ submitted
→ teacher_review
   ├─ verified
   ├─ revision_required → student_review → resubmitted → teacher_review
   ├─ unable_to_verify
   └─ rejected
```

AI failure is a separate analysis state and does not invalidate the observation draft.

Session group statuses:

```text
waiting → ready → active → paused → completed
```

A teacher may pause and resume a session, and may complete one group without ending the session (D-056). While paused, students keep and may edit their drafts but cannot submit.

Group statuses, observation statuses, and session group statuses each require colour, shape, icon, and Thai text tokens; none may rely on colour alone (D-053).

## 12. Student verification fields

For each AI-proposed trait, the student may select:

```text
match
not_match
unsure
not_visible
```

When `not_match` is selected, a corrected value should be allowed. Flexible additional trait fields may be stored without requiring a schema migration, but frequently queried fields should be normalized later.

## 13. Gemini confidence behavior

Initial recommended behavior:

- Below 0.40: emphasize insufficient evidence and request additional images; manual entry remains available.
- 0.40–0.70: show multiple candidates and distinguishing traits.
- Above 0.70: show the top candidate prominently while retaining alternatives and the provisional label.

The threshold configuration must be changeable without redesigning the observation schema.

## 14. Same-species warning

After a student selects or enters the plant identity, the system checks observations in the same session.

If the normalized species matches an existing submission:

- show the student that the species has already been recorded;
- show related records when authorized;
- allow the new individual observation to continue;
- tag the submission as `same_species_in_session`;
- create a teacher notification;
- make the tag visible in the teacher review panel and map/detail interface.

This warning supports teacher awareness and later analysis; it is not a submission lock.

## 15. Map requirements

### During activity

Teacher map displays submitted/reviewed observations using status-aware markers. Draft observations are private to their creator and do not appear.

Recommended status representation:

- submitted/teacher review: amber;
- revision required: red;
- resubmitted: blue;
- verified: green;
- unable to verify: purple;
- rejected: gray.

Color must be accompanied by text/icon/shape for accessibility.

### After activity

Participating students and authorized teachers can open the completed session map. Participants of the same session see each other's images and the recorder's name (D-055). Live-location identification is teacher-only and stops when the session ends (D-054). Reviewed-data export is delivered in-app; a large export becomes a queued job with an in-app notification when ready (D-046).

Clicking a marker opens plant details, including:

- main image and gallery;
- student identity according to role/privacy rules;
- Thai/common and scientific names;
- teacher-verified name when available;
- capture time and GPS accuracy;
- Gemini candidates and traits;
- student checks and corrections;
- teacher review and feedback;
- same-species/related-observation indicators.

## 16. Image requirements

- Minimum: one whole-plant image.
- Maximum: ten images.
- Optional categories: leaf, lower leaf, stem/trunk, flower, fruit, habitat, and other.
- Accepted upload formats: JPEG, PNG, WebP.
- Before upload: correct orientation, resize longest edge to at most 2,048 px, compress toward quality 82–85, and enforce a 5 MB maximum per processed image.
- Store capture timestamp separately from image metadata.
- Use transformed derivatives for map/list/review presentation.

## 17. Offline and failure behavior

- Draft and pending uploads are stored locally using client-generated UUIDs.
- Retrying must be idempotent.
- Gemini analysis runs asynchronously through a durable queue.
- If upload or analysis fails, the student keeps the draft and may retry.
- Manual plant entry remains available.
- If GPS is unavailable, prompt the student to wait/retry; if still unavailable, allow a flagged draft/submission for teacher handling rather than silently fabricating a location.

## 18. Research and audit data

Use append-only event rows for meaningful actions such as:

```text
class_joined
group_created
group_invitation_sent
group_invitation_accepted
group_leader_changed
student_moved_between_groups
group_locked
group_deleted
group_archived
session_joined
observation_started
photo_captured
image_uploaded
ai_analysis_queued
ai_analysis_completed
ai_analysis_failed
student_reviewed_ai_result
student_corrected_ai_trait
same_species_warning_shown
observation_submitted
teacher_requested_revision
observation_resubmitted
teacher_verified
session_completed
map_marker_opened
```

Each event has relational identifiers and a flexible `payload jsonb`. The final research variables are not yet fixed, so the event model must remain flexible while avoiding sensitive data duplication.

## 19. MVP acceptance scenarios

1. Teacher creates a class and configures group size, maximum groups, and group formation.
2. Students join using an in-app class invite flow without email.
3. The first eligible students atomically create the available groups and become their single leaders.
4. When the maximum group count is reached, classmates receive Realtime updates and the Create Group control becomes disabled with an explanation.
5. Two students racing for the final group slot produce one success and one `GROUP_LIMIT_REACHED` response.
6. A leader invites an eligible classmate; the classmate receives an in-app notification and accepts.
7. A student cannot belong to or lead multiple active groups in the same class.
8. Teacher moves a non-active-session student to another group and both students/groups update in Realtime.
9. Teacher changes leadership without leaving a populated group leaderless.
10. Teacher deletes an unused group, cancelling invitations and restoring one group slot.
11. A group with session history is archived rather than hard-deleted.
12. Session opening snapshots group membership so later moves do not alter history.
13. A concurrency test proves that only one exploration group can be active.
14. Student creates an individual observation with capture location/time and 1–10 images.
15. Oversized images are reduced before upload and remain usable for teacher review.
16. Gemini analysis runs asynchronously and returns a versioned structured result.
17. Student compares traits with the real plant, corrects at least one field, enters both required names, and submits.
18. Another student submits the same species in the same session; the system warns, allows submission, tags the teacher view, and creates an in-app teacher notification.
19. Teacher sees status-colored markers and opens the plant detail panel.
20. Teacher requests revision; the student edits the same observation and resubmits without losing previous values.
21. Teacher corrects and verifies the final plant identity.
22. Teacher manually completes the session.
23. Teacher and participating students open the completed map and plant details.
24. A failed Gemini request leaves the draft intact and allows manual entry/retry.
