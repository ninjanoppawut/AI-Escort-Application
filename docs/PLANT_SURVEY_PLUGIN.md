# Plant Survey Plugin

## Purpose

The plant-survey plugin supports a focused field workflow: a student photographs a plant inside the assigned area, Gemini proposes names and visible characteristics, the student checks those results against the real plant, and the teacher performs final review.

## Observation workflow

```text
start observation
→ capture GPS, accuracy, and capture time
→ capture one or more plant images
→ send images to Gemini
→ validate structured Gemini response
→ normalize plant candidates
→ run species/specimen dedupe
→ student verifies AI characteristics
→ student corrects mismatches or adds evidence
→ capture submission GPS and submission time
→ submit to teacher
→ teacher verifies / requests revision / cannot verify / rejects
```

## Capture requirements

The app must store:

- original image files;
- observation and media IDs;
- observer, group, activity, and session;
- capture location;
- capture GPS accuracy;
- captured time;
- image type when supplied, such as whole plant, leaf, stem, flower, or fruit;
- optional additional images requested by Gemini.

Capture location is the primary plant location. Submission location is separate.

## Gemini behavior

Gemini may:

- suggest multiple possible taxa;
- return Thai, English, and scientific names when supported;
- describe visible leaf, flower, fruit, stem, bark, and growth-habit characteristics;
- explain short observable evidence;
- request additional photos;
- explicitly identify missing or uncertain evidence.

Gemini must not:

- label its answer as verified;
- invent characteristics that are not visible;
- replace the student's later verification;
- silently choose a final identification;
- merge or delete observations.

## Normalized Gemini response

```json
{
  "schemaVersion": 1,
  "identificationStatus": "possible_match",
  "candidates": [
    {
      "taxonId": "provider-or-catalog-id",
      "commonNameTh": "มะม่วง",
      "commonNameEn": "Mango",
      "scientificName": "Mangifera indica",
      "confidence": 0.87,
      "evidenceSummary": "ลักษณะใบและทรงพุ่มสอดคล้องบางส่วน"
    }
  ],
  "visibleTraits": {
    "growthHabit": "ไม้ต้น",
    "leafType": "ใบเดี่ยว",
    "leafArrangement": "เรียงสลับ",
    "leafShape": "รูปรีถึงรูปหอก",
    "leafMargin": "ขอบเรียบ",
    "leafVenation": "ไม่แน่ชัดจากภาพ",
    "stemOrBark": "ลำต้นเป็นเนื้อไม้ เปลือกสีน้ำตาล",
    "flower": null,
    "fruit": null
  },
  "requestedEvidence": ["leaf_underside"],
  "uncertainties": ["ไม่เห็นดอกหรือผล"],
  "disclaimer": "ผลลัพธ์เป็นข้อเสนอเบื้องต้น ต้องตรวจสอบกับต้นพืชจริง"
}
```

Responses must be validated against a versioned schema. Unknown or unseen values must be `null`, `unknown`, or an explicit uncertainty string.

## Student verification

Each AI trait is reviewed using:

```text
match
not_match
unsure
not_visible
```

When a student selects `not_match`, they may provide:

- corrected value;
- evidence note;
- additional image.

Store separately:

```text
AI-proposed value
student verification state
student corrected value
student note/evidence
teacher-reviewed value
```

## Duplicate detection

Duplicate detection has two distinct meanings.

### Species-level duplicate

The normalized taxon already exists in the configured scope, initially the same activity/session.

This is informational. It must not block a student from recording another plant of the same species.

### Specimen-level duplicate

The observation may refer to the same physical plant as an earlier observation.

The matcher should combine:

- normalized taxon overlap;
- visible and student-verified trait similarity;
- visual embedding/image similarity;
- capture-location distance;
- capture-time distance;
- observer/group context as a weak signal.

Distance alone must never decide duplication.

Suggested output:

```json
{
  "candidateObservationId": "uuid",
  "taxonMatchScore": 0.95,
  "traitSimilarityScore": 0.84,
  "visualSimilarityScore": 0.89,
  "distanceMeters": 3.2,
  "timeDifferenceSeconds": 420,
  "combinedScore": 0.88,
  "recommendation": "possible_same_specimen"
}
```

Student decision:

```text
same_specimen
different_specimen
unsure
```

Teacher may override or finalize the decision. Confirmed records for the same physical plant may share one `specimen_id`, but their observation records remain separate.

## Completion rules

A submission requires:

- valid open session and active group;
- capture location, accuracy, and capture time;
- minimum image evidence;
- completed Gemini analysis or an explicit AI failure fallback;
- student review of required AI traits;
- duplicate warnings acknowledged;
- student identification selection or unresolved state;
- submission location and submission time.

## Teacher review

Teacher can:

- verify the record;
- request revision;
- accept evidence while leaving identification unresolved;
- mark unable to verify;
- reject invalid content;
- select the final accepted identification;
- confirm same/different specimen;
- add feedback.

Never overwrite original Gemini or student values. Preserve status and review history.