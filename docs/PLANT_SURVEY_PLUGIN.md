# Plant Survey Plugin

## 1. Purpose

The plant-survey plugin guides one student through one individual plant observation. It captures evidence, obtains provisional Gemini analysis, requires the student to compare the result with the real plant, checks related observations, and sends the record to a teacher for manual review.

It is a learning workflow, not an automatic species-identification authority.

## 2. Plugin contract

```ts
export interface ExplorationPlugin<TDraft, TSubmission> {
  id: string;
  version: string;
  validateDraft(input: unknown): TDraft;
  validateSubmission(input: unknown): TSubmission;
  getCompletion(input: TDraft): CompletionResult;
  getReviewSummary(input: TSubmission): ReviewSummary;
}
```

Server validation is authoritative. UI fields may evolve without weakening submission rules.

## 3. Locked workflow

```text
start individual observation
→ capture GPS location, accuracy, and time
→ capture 1–10 images
→ preprocess/upload evidence
→ queue Gemini analysis
→ receive provisional candidates and visible traits
→ student checks traits against the real plant
→ student confirms or corrects values
→ student enters Thai/common and scientific names
→ check same-species records in the same session
→ warn and require acknowledgement, but allow submission
→ teacher manually reviews
→ revision may return the same observation to the student
→ teacher verifies/corrects or closes with another decision
```

## 4. Image evidence

### Required

- At least one `whole_plant` image.

### Optional categories

- leaf;
- leaf underside;
- stem/trunk;
- flower;
- fruit;
- habitat;
- other.

### Limits

- Minimum: 1 image.
- Maximum: 10 images.
- Processed longest edge: no more than 2,048 px.
- Processed file: no more than 5 MB.
- Preferred quality: approximately 82–85.
- Accepted formats: JPEG, PNG, WebP.

Gemini may request more evidence. The student can add images until the maximum is reached. Missing flower or fruit is allowed when not visible.

## 5. Gemini behavior

Gemini may:

- suggest multiple possible plant identities;
- return Thai/common, English common, and scientific names when supported;
- describe visible leaf, stem, flower, fruit, and growth-habit traits;
- express confidence/uncertainty;
- identify missing evidence;
- request additional image categories;
- explain distinguishing visible features.

Gemini must not:

- mark an observation verified;
- overwrite student data;
- invent traits that are not visible;
- force an identity when evidence is inadequate;
- block manual entry;
- receive live locations of other students.

## 6. Confidence behavior

Recommended initial thresholds:

```text
confidence < 0.40
→ emphasize insufficient evidence and request more images

0.40–0.70
→ show multiple candidates and distinguishing features

> 0.70
→ highlight top candidate but retain provisional label and alternatives
```

Thresholds are configurable. Confidence never controls teacher verification automatically.

## 7. Versioned structured output

The exact JSON contract will be finalized during implementation. It must support:

```json
{
  "schemaVersion": "plant-analysis-v1",
  "candidates": [],
  "traits": {},
  "missingEvidence": [],
  "confidenceSummary": {},
  "disclaimer": "provisional"
}
```

Requirements:

- schema version is required;
- server validation is required;
- provider/model/prompt version are recorded;
- unseen traits use `null` or explicit unavailable state;
- raw provider output is not treated as the UI/domain model.

## 8. Student review

For each relevant AI trait, the student chooses:

```text
match
not_match
unsure
not_visible
```

When `not_match`, the student can enter a corrected value and note. Additional flexible fields may be entered manually.

Before submission, the student must provide:

- Thai/common plant name;
- scientific name;
- short evidence note;
- completed review or explicit manual-entry path;
- same-species warning acknowledgement when applicable.

`Unknown` is not accepted as the final student submission. If Gemini fails, the student may use another reference such as Google Lens and manually enter the required fields.

## 9. Same-species warning

After identity selection/manual entry, compare with submitted observations in the same session.

When a species match exists:

```text
This species has already been submitted in this session.
You may continue because this is your individual observation.
```

The system:

- shows related same-species observations when permitted;
- allows submission;
- records acknowledgement;
- sets a teacher-visible `same_species_in_session` tag;
- includes the tag on map marker detail/review queue.

It does not automatically reject, merge, or delete the new record.

## 10. Possible same specimen

A separate process may flag observations that could represent the same physical plant. Signals may include:

- same normalized species;
- matching traits;
- image similarity;
- nearby capture locations;
- close capture time.

Distance alone is insufficient. Human confirmation is required. Multiple student observations remain independent even when linked to one confirmed `specimen_id`.

## 11. Observation states

```text
draft
images_uploading
analysis_queued
analysis_running
student_review
submitted
teacher_review
revision_required
resubmitted
verified
unable_to_verify
rejected
```

AI job status is tracked separately. AI failure does not destroy or invalidate the draft.

## 12. Teacher review

Teacher sees:

- marker at capture location;
- GPS accuracy and capture time;
- 1–10 images;
- Gemini result and confidence;
- student trait checks and corrected values;
- required student identity/evidence;
- same-species tag and related observations;
- previous submissions and teacher feedback.

Teacher decisions:

```text
verified
revision_required
unable_to_verify
rejected
```

Teacher may enter corrected common/scientific names and traits. These corrections are stored separately from AI and student values.

## 13. Revision

When revision is required:

- the same observation returns to the owner;
- teacher feedback is displayed;
- the student may add/replace evidence within the 10-image limit;
- student may change names, traits, and evidence note;
- a new immutable submission version is created;
- prior versions remain visible to the teacher.

## 14. Map behavior

Only submitted or reviewed observations appear on the teacher map. Status determines marker presentation. Same-species tag is visible in marker details.

After the teacher completes the session, authorized teachers and participating students can view the result map and click markers to open the plant detail view.

## 15. Research events

The plugin emits events for evidence capture, analysis attempts/results, student review/correction, same-species warning, submission, revision, resubmission, teacher review, and marker-detail opening. Event payloads may use `jsonb`, while relational IDs remain explicit.