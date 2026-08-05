# REV — Student Submission and Teacher Review

## Outcome

Students turn provisional evidence into an immutable submission, teachers review it manually, and revisions preserve every AI, student, and teacher evidence layer.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §§10–14
- `docs/PLANT_SURVEY_PLUGIN.md` §§8–13
- `docs/DECISIONS_AND_QUESTIONS.md` D-013–D-017, D-022–D-025, D-048–D-049, D-052, D-057
- `docs/API_AND_REALTIME.md` §§17–18, 20
- `docs/DATABASE_DESIGN.md` §§11–15
- `docs/UI_CONTRACTS.md` §§2, 5–6

## Scope

In scope: candidate/manual identity, trait verification, evidence note, same-species warning, immutable submit/resubmit, related-observation signals, teacher review decisions/corrections, targeted revision topics, unlock request, issue report, histories, events, and notifications.

Out of scope: final `Unknown`, AI auto-verification, automatic duplicate blocking/merge/delete, student-side same-specimen linking, and editing unflagged revision topics without teacher approval.

## Functional requirements

- **REV-001:** A student can select an AI candidate or enter identity manually and record each relevant trait as `match`, `not_match`, `unsure`, or `not_visible` with corrections where applicable.
- **REV-002:** Submission requires a Thai/common name, scientific name, short evidence note, required whole-plant image, and current authorized session state.
- **REV-003:** Submission creates an immutable version while retaining AI output and mutable draft state as separate records.
- **REV-004:** A same-species match within the same session warns the student, requires acknowledgement, permits submission, adds a teacher-visible tag, and creates a teacher notification.
- **REV-005:** Possible same-specimen candidates may combine taxon, morphology, image similarity, location, and time; distance alone never determines a match.
- **REV-006:** Related observations are never automatically merged, deleted, or rejected; only a teacher confirms specimen relationships.
- **REV-007:** A teacher can verify, verify with correction, request revision, mark unable to verify, or reject after viewing images, capture metadata, AI output, student verification, related items, and history.
- **REV-008:** A review decision creates an immutable review row and append-only status/event history without overwriting earlier evidence.
- **REV-009:** Revision edits the same observation, restricts changes to teacher-flagged topics, and creates a new immutable submission version on resubmit.
- **REV-010:** A student can request additional unlocked topics with a reason; teacher approval expands the revision scope and is audited.
- **REV-011:** A student can report an issue on a plant record at most once per record per 24 hours; the owner does not see reporter identity and the teacher receives a queue item.
- **REV-012:** Optimistic concurrency prevents a teacher decision from landing on a submission version the teacher did not review.

## Authorization and data boundary

Only the owning student edits the allowed draft/revision scope. Only an authorized class teacher reviews or confirms specimen relationships. Reporter identity is limited to authorized teacher/audit access. Submission, review, relationship, status, and event histories are append-only.

## Required states and failures

AI pending/failed, manual entry, missing required identity/evidence, same-species warning, submission conflict, teacher review, targeted revision, unlock pending/denied/granted, resubmitted, verified, unable to verify, rejected, and report rate-limited are required.

## Verification

- Required-field and `Unknown` rejection tests.
- Same-species warning permits submission and produces tag/notification.
- Immutable submission/review/status history tests.
- Revision field-lock and unlock-request authorization tests.
- Concurrent review version-conflict test.
- Issue-report anonymity and rate-limit tests.

## Dependencies

AUTH, NOT, SES, OBS, AI, and related-observation query support.

## Definition of done

Every decision is manual and attributable, every evidence layer remains recoverable, and revision/concurrency rules are enforced below the UI.
