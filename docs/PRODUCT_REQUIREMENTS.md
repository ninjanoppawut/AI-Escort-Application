# Product Requirements

## 1. Product vision

AI Escort is a mobile-first school field-learning platform. A teacher defines a class, activity, route, and exploration boundary. Students explore in groups, but each student creates individual plant observations. The application records where and when a plant was observed, sends images to Gemini for provisional analysis, asks the student to compare the result with the real plant, and sends the completed observation to a teacher for manual review.

AI assists observation; it does not replace student judgment or teacher verification.

## 2. MVP user roles

### Student

- Join a class using an invite code or link.
- Create or join a group.
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

### Teacher

- Create and manage classes, memberships, groups, activities, routes, boundaries, checkpoints, and sessions.
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
     ├─ Groups
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

## 4. Locked business rules

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

## 5. Core observation workflow

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

## 6. Observation statuses

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

## 7. Student verification fields

For each AI-proposed trait, the student may select:

```text
match
not_match
unsure
not_visible
```

When `not_match` is selected, a corrected value should be allowed. Flexible additional trait fields may be stored without requiring a schema migration, but frequently queried fields should be normalized later.

## 8. Gemini confidence behavior

Initial recommended behavior:

- Below 0.40: emphasize insufficient evidence and request additional images; manual entry remains available.
- 0.40–0.70: show multiple candidates and distinguishing traits.
- Above 0.70: show the top candidate prominently while retaining alternatives and the provisional label.

The threshold configuration must be changeable without redesigning the observation schema.

## 9. Same-species warning

After a student selects or enters the plant identity, the system checks observations in the same session.

If the normalized species matches an existing submission:

- show the student that the species has already been recorded;
- show related records when authorized;
- allow the new individual observation to continue;
- tag the submission as `same_species_in_session`;
- make the tag visible in the teacher review panel and map/detail interface.

This warning supports teacher awareness and later analysis; it is not a submission lock.

## 10. Map requirements

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

Participating students and authorized teachers can open the completed session map. Clicking a marker opens plant details, including:

- main image and gallery;
- student identity according to role/privacy rules;
- Thai/common and scientific names;
- teacher-verified name when available;
- capture time and GPS accuracy;
- Gemini candidates and traits;
- student checks and corrections;
- teacher review and feedback;
- same-species/related-observation indicators.

## 11. Image requirements

- Minimum: one whole-plant image.
- Maximum: ten images.
- Optional categories: leaf, lower leaf, stem/trunk, flower, fruit, habitat, and other.
- Accepted upload formats: JPEG, PNG, WebP.
- Before upload: correct orientation, resize longest edge to at most 2,048 px, compress toward quality 82–85, and enforce a 5 MB maximum per processed image.
- Store capture timestamp separately from image metadata.
- Use transformed derivatives for map/list/review presentation.

## 12. Offline and failure behavior

- Draft and pending uploads are stored locally using client-generated UUIDs.
- Retrying must be idempotent.
- Gemini analysis runs asynchronously through a durable queue.
- If upload or analysis fails, the student keeps the draft and may retry.
- Manual plant entry remains available.
- If GPS is unavailable, prompt the student to wait/retry; if still unavailable, allow a flagged draft/submission for teacher handling rather than silently fabricating a location.

## 13. Research and audit data

Use append-only event rows for meaningful actions such as:

```text
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

## 14. MVP acceptance scenarios

1. Teacher creates a class, activity boundary, route, session, and two groups.
2. A concurrency test proves that only one group can be active.
3. Student A creates an individual observation with capture location/time and 1–10 images.
4. Oversized images are reduced before upload and remain usable for teacher review.
5. Gemini analysis runs asynchronously and returns a versioned structured result.
6. Student compares traits with the real plant, corrects at least one field, enters both required names, and submits.
7. Student B submits the same species in the same session; the system warns but allows submission and tags the teacher view.
8. Teacher sees status-colored markers and opens the plant detail panel.
9. Teacher requests revision; Student A edits the same observation and resubmits without losing previous values.
10. Teacher corrects and verifies the final plant identity.
11. Teacher manually completes the session.
12. Teacher and participating students open the completed map and plant details.
13. A failed Gemini request leaves the draft intact and allows manual entry/retry.