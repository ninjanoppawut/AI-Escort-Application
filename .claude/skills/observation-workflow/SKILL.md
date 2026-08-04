---
name: observation-workflow
description: The locked plant-observation lifecycle for AI Escort — ownership, the 12 statuses, capture location and time, required identity fields, four-way trait verification, same-species vs same-specimen, revision and resubmission, teacher review decisions, and the completed map. Use when implementing or reviewing any part of observing, submitting, revising, reviewing, or displaying a plant record, or when a status transition, evidence layer, or marker visibility rule is in question.
---

# Observation workflow

Source: `docs/PLANT_SURVEY_PLUGIN.md`, `docs/PRODUCT_REQUIREMENTS.md` §9–§15, D-001, D-013…D-027.

## Ownership and scope

- An observation belongs to **one student** (D-001), never to the group.
- Only a student in the **active** group of a session may publish location or submit (D-004). Waiting groups preview route and instructions only.
- One session has exactly one `active` group at a time (D-003).

## Statuses

```text
draft → images_uploading → analysis_queued → analysis_running → student_review
→ submitted → teacher_review
   ├─ verified
   ├─ revision_required → student_review → resubmitted → teacher_review
   ├─ unable_to_verify
   └─ rejected
```

AI job status is tracked **separately**. An AI failure never invalidates or destroys the draft.

## Capture data is authoritative

The marker uses the location captured **when the observation begins**, not when submit is pressed (D-019). Store capture location, GPS accuracy, and capture time. Never fabricate a coordinate (D-020) — if GPS is unavailable after retry, keep an explicitly flagged record for the teacher.

## Evidence

- 1–10 images, at least one `whole_plant`.
- Categories: `whole_plant | leaf | leaf_underside | stem_trunk | flower | fruit | habitat | other`.
- Missing flower or fruit is acceptable when not visible.

## Three evidence layers — never overwritten (D-015)

```text
① AI proposes   → ai_analysis_runs
② student judges → student verification + corrections + submission versions
③ teacher certifies → teacher review + corrections
```

Each layer is stored independently and remains visible forever. The teacher's verified name is the primary truth; AI and student values still display beneath it.

## Student verification (D-014)

Per relevant trait: `match | not_match | unsure | not_visible`. A `not_match` may carry a corrected value and note.

Submission requires (D-013): Thai/common name, scientific name, short evidence note, at least one whole-plant image, a completed review or an explicit manual-entry path, and same-species acknowledgement when applicable. **`Unknown` is not an accepted final submission.**

## Same species vs same specimen

Two different relationships (D-023) — never merge the concepts in code or UI.

- **Same species in session** (D-022): after identity selection, compare against submitted observations in the same session. On a match: warn the student in neutral language, allow submission, record the acknowledgement, set the teacher-visible `same_species_in_session` tag, notify the teacher, and surface the tag on the marker detail and review queue. **It is never a block.**
- **Possible same specimen** (D-024): a separate scored process combining taxon, morphology, image similarity, capture distance, and time. **Distance alone is never decisive.** Human confirmation is required; confirmed records may share a `specimen_id` while remaining separate observations.

The system never automatically merges, deletes, or rejects an observation (D-025).

## Teacher review

Decisions: `verified | revision_required | unable_to_verify | rejected`. Review is always manual. The teacher may correct common name, scientific name, and traits — corrections are stored alongside, never over, prior values (D-017).

## Revision (D-016, D-048)

The **same observation** returns to its owner with the teacher's feedback. Resubmission creates a new immutable submission version; every prior version stays visible to the teacher.

**Edit scope is locked to the topics the teacher flagged** (D-048). All other fields are read-only. Within the flagged topics the student may change names, traits, and the evidence note, and may add or replace evidence up to the 10-image limit. Attempting to write a non-flagged field returns `FIELD_NOT_UNLOCKED_FOR_REVISION`.

The student may send an in-app request to unlock further topics, with a reason. The teacher decides. Endpoints: `POST /api/observations/:id/unlock-request` and `.../unlock-request/:requestId/grant`.

## Concurrent updates (D-052)

`OBSERVATION_VERSION_CONFLICT` blocks the second writer, states the reason, and returns the refreshed record with a repeat action — the same presentation as the group-slot race. A teacher decision must never land silently on a version the teacher did not read.

## Session pause (D-056)

While a session is paused, students keep and may edit drafts but cannot submit. Submission attempts return `SESSION_PAUSED`.

## Map visibility (D-026, D-027)

- Drafts are private and never appear on the teacher map.
- Submitted and reviewed observations appear at capture location with status-aware markers.
- Marker status must be readable without color — shape, icon, or label as well.
- After the teacher manually completes the session (D-018), authorized teachers and participating students open the result map; tapping a marker opens plant details.

## Research events

Emit append-only events for evidence capture, analysis attempts and results, student review and correction, same-species warning, submission, revision, resubmission, teacher review, and marker-detail opening (D-029). Relational IDs explicit, flexible `payload jsonb`.
