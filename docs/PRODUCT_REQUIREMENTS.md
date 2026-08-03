# Product Requirements

## 1. Product vision

AI Escort is a school field-learning platform where an AI assistant guides students inside a teacher-defined exploration boundary and supports a structured plant-observation workflow. The application combines route navigation, real-time group supervision, image-based plant analysis, student verification, teacher review, and traceable location/time evidence.

The AI must support observation rather than replace it. Gemini may suggest plant names and visible characteristics, request additional evidence, and highlight uncertainty. Students must compare the AI result with the actual plant before submission. Teachers remain responsible for final academic review.

## 2. Primary users

### Student

- Join a class using an invite code or link.
- Create or join a group in that class.
- Join the active exploration session.
- Walk within the configured exploration boundary.
- Capture plant photos with location, GPS accuracy, and capture time.
- Send the observation images to Gemini for structured analysis.
- Compare each AI-proposed characteristic with the real plant.
- Mark each characteristic as matching, not matching, uncertain, or not visible.
- Correct AI-proposed values and add notes or additional images.
- Review possible duplicate species or specimen matches.
- Submit the completed observation to the teacher.
- Respond to revision requests.

### Teacher

- Create and manage classes and groups.
- Define route, exploration boundary, checkpoints, schedule, and safety notes.
- Open, pause, resume, and complete sessions.
- Activate one group at a time.
- View live group location and progress.
- Review submitted images, Gemini analysis, student verification, corrections, capture location, capture time, submission location, and submission time.
- Verify, request revision, mark unable to verify, reject, or flag duplicate records.
- Export original AI values, student-reviewed values, and teacher-reviewed values separately.

### Admin

- Manage schools, users, global roles, providers, usage limits, retention settings, and audit logs.
- Suspend abusive or unsafe content.

## 3. Core entities

```text
School
 └─ Class
     ├─ Memberships
     ├─ Groups
     └─ Activities
         ├─ Route and boundary
         ├─ Checkpoints
         ├─ Plugin configuration
         └─ Exploration sessions
             ├─ Queued groups
             ├─ Session participant snapshot
             ├─ Live locations
             ├─ Plant observations
             │   ├─ Original media
             │   ├─ Gemini analysis
             │   ├─ Student verification
             │   ├─ Duplicate candidates
             │   └─ Teacher review
             └─ Reflections and assessments
```

An **activity** is a reusable learning plan. A **session** is one actual execution of an activity on a specific date and time.

## 4. Critical business rules

1. Only active class members may access a class.
2. A session may contain several groups, but only one group may be `active` at a time.
3. Only authorized teachers may activate or switch groups.
4. Students may publish location and create observations only while participating in the active group of an open session.
5. Waiting groups may preview the route but cannot publish live location or submit observations.
6. Student location must not become a public or school-wide social feature.
7. The plant location is primarily the location captured when the image was taken, not the later submission location.
8. Capture and submission coordinates, accuracy, and timestamps must be stored separately.
9. Gemini output is provisional and must never silently become the final identification.
10. Gemini must return `null`, `unknown`, or an explicit uncertainty state when a characteristic cannot be observed; it must not invent unseen traits.
11. Students must review AI-proposed characteristics before submission.
12. Original AI output, student verification/corrections, and teacher review must be preserved separately.
13. Duplicate detection must distinguish a repeated species from a repeated individual specimen.
14. Duplicate detection must consider normalized taxon identity, plant characteristics, visual similarity, location, and time. Distance alone is insufficient.
15. A same-species warning must not block recording another individual plant.
16. Suspected specimen duplicates must require student or teacher confirmation; the system must not auto-delete or auto-merge observations.
17. Data collected offline must use idempotent client-generated IDs during synchronization.

## 5. Activity and session lifecycle

### Activity

```text
draft → published → scheduled → active → completed → archived
```

### Session

```text
scheduled → open → paused → completed
                    └────→ cancelled
```

### Group state

```text
waiting → ready → active → completed
                   └────→ paused
```

Group switching must be atomic and the database must reject two active groups in one session.

## 6. Primary plant-observation flow

```text
student enters active session
→ system confirms session/group permission
→ student walks inside exploration boundary
→ student starts a plant observation
→ app captures location, GPS accuracy, and capture time
→ student takes one or more plant photos
→ images are uploaded or queued offline
→ Gemini returns structured plant candidates and visible characteristics
→ app normalizes candidate taxonomy
→ system checks species-level and specimen-level duplicate candidates
→ student compares AI results with the real plant
→ student marks each characteristic: match / not_match / unsure / not_visible
→ student corrects mismatched values or adds evidence
→ student chooses how to handle duplicate warnings
→ app captures submission location and submission time
→ student submits
→ teacher reviews
→ verified / revision_required / unable_to_verify / rejected
```

## 7. Gemini analysis requirements

Gemini must return structured JSON containing:

- one or more possible plant candidates;
- Thai common name when available;
- English common name when available;
- scientific name when reasonably supported;
- normalized/provider taxon identifier when available;
- confidence or uncertainty indicator;
- short evidence summary;
- visible growth habit;
- visible leaf type, arrangement, shape, margin, and venation;
- visible stem/bark characteristics;
- visible flower and fruit characteristics;
- missing evidence and requested additional photos;
- explicit disclaimer that the result is provisional.

The system must validate Gemini output against a versioned schema before saving it.

## 8. Student verification requirements

For each AI-proposed characteristic, students choose:

```text
match
not_match
unsure
not_visible
```

When `not_match` is selected, the student may enter a corrected value and evidence note. The student may also change the proposed plant name, choose another AI candidate, or leave identification unresolved.

Submission must not overwrite the original Gemini response.

## 9. Duplicate detection requirements

### Species duplicate

A species duplicate means the same normalized plant taxon has already been recorded in the configured scope, initially the same activity/session.

The warning must show existing matching records and allow:

- record another individual of the same species;
- view previous records;
- add evidence to an existing record when permitted;
- indicate that the AI identification is likely incorrect.

### Specimen duplicate

A specimen duplicate means the new observation may describe the same physical plant as an existing observation.

Candidate ranking should consider:

- normalized taxon match or candidate overlap;
- AI-observed and student-verified characteristics;
- visual embedding/image similarity;
- distance between capture locations;
- capture-time difference;
- same group or observer as a weak supporting signal.

The system may rank candidates but must present them as uncertain. Student decisions:

```text
same_specimen
different_specimen
unsure
```

Teacher may override or finalize the duplicate decision. Confirmed observations of the same physical plant may share a `specimen_id`; their records and evidence remain separate.

## 10. Observation status lifecycle

```text
draft
→ media_pending
→ analyzing
→ student_review
→ duplicate_review
→ ready_to_submit
→ submitted
→ teacher_review
   ├─ verified
   ├─ revision_required → student_review
   ├─ unable_to_verify
   └─ rejected
```

## 11. Teacher review requirements

The teacher review screen must show:

- original images and any additional images;
- capture coordinate, GPS accuracy, and captured time;
- submission coordinate, GPS accuracy, and submitted time;
- boundary status at capture;
- Gemini candidates and characteristics;
- student verification decisions and corrections;
- duplicate candidate scores and student decision;
- status history and previous feedback.

Teacher actions:

- verify identification and data quality;
- verify data quality but leave identification unresolved;
- request revision with required actions;
- mark unable to verify;
- reject invalid, unrelated, or inappropriate records;
- confirm same specimen or different specimen;
- select or enter the final accepted identification.

## 12. Boundary and location behavior

- Validate the capture location against the activity boundary.
- Use GPS accuracy and a configurable tolerance; do not reject from one inaccurate sample alone.
- Warn when location accuracy is poor.
- An outside-boundary capture may require a student reason and teacher review rather than automatic deletion.
- Store capture location as the primary observation location.
- Store submission location separately for audit and workflow analysis.

## 13. Non-functional requirements

- Mobile-first interface targeting modern mobile Safari and Chrome.
- Thai-first UI with architecture ready for English.
- Graceful behavior on intermittent networks.
- Offline observation drafts and media queues.
- Accessible controls and readable map overlays.
- No secrets in client bundles.
- RLS on every exposed table.
- Audit logs for session control, Gemini requests, submissions, duplicate decisions, reviews, and admin actions.
- Raw location retention must be configurable and minimized.
- Observation exports must preserve AI, student, and teacher layers separately.

## 14. Pilot MVP acceptance scenarios

1. Teacher creates a class, activity boundary, route, and session.
2. Two student groups join; the database permits only one active group.
3. A student in the active group captures a plant image inside the boundary.
4. The app stores capture location, accuracy, and time.
5. Gemini returns multiple possible names and visible characteristics using the required JSON schema.
6. The student marks characteristics as matching, mismatching, uncertain, or not visible and corrects one value.
7. The system finds an earlier observation of the same species and warns without blocking a new specimen record.
8. The system finds a possible same-specimen candidate using taxon, visual, location, and time signals.
9. The student marks it as a different specimen and submits.
10. The app stores submission location and time separately.
11. The teacher sees all evidence layers and verifies or requests revision.
12. An offline observation syncs without duplication using the client-generated ID.