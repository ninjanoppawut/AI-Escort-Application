# Plant Survey Plugin

## Purpose

The plant-survey plugin implements a systematic field-observation workflow. It is modular so future activities can add insect, soil, water, or biodiversity plugins without changing the session engine.

## Plugin contract

```ts
export interface ExplorationPlugin<TDraft, TSubmission> {
  id: string;
  version: string;
  validateDraft(input: unknown): TDraft;
  validateSubmission(input: unknown): TSubmission;
  getRequirements(config: unknown): SurveyRequirement[];
  getCompletion(input: TDraft): CompletionResult;
}
```

The UI implementation may expose capture, editor, summary, and review components, but stored data must be validated independently on the server.

## Observation workflow

```text
select plant
→ capture location and context
→ capture required images
→ describe observable traits
→ record ecological context
→ request optional AI guidance
→ completeness check
→ submit
→ peer/teacher review
→ verification
```

## Required evidence

Teacher-configurable photo types:

- whole plant;
- trunk or stem;
- upper leaf surface;
- lower leaf surface;
- flower;
- fruit;
- surrounding habitat.

Students may mark a feature as unavailable, for example no visible flower or fruit. The system should request a reason rather than force an irrelevant image.

## Structured plant fields

- local/common name proposed by student;
- scientific name proposed by student, when known;
- growth habit;
- stem or bark characteristics;
- leaf arrangement;
- leaf shape, margin, and venation;
- flower and fruit characteristics;
- abundance or frequency observed;
- notes and uncertainty.

## Ecological context

- light level;
- moisture;
- soil description;
- nearby water;
- associated organisms;
- neighboring plants;
- human activity;
- signs of disturbance;
- possible threats;
- student's explanation of ecological relationships.

## AI behavior

AI may:

- detect missing or low-quality evidence;
- request a specific additional image;
- suggest multiple possible taxa with uncertainty;
- highlight observable differences between candidates;
- ask inquiry questions;
- prompt links between the plant and environmental factors;
- generate a completeness summary.

AI must not:

- silently replace the student's answer;
- label a suggestion as verified;
- invent traits that are not visible or recorded;
- expose private observations outside authorized scope;
- penalize a student solely because model confidence is low.

## Normalized AI response

```json
{
  "suggestions": [
    {
      "taxonId": "provider-or-catalog-id",
      "scientificName": "Mangifera indica",
      "commonName": "มะม่วง",
      "confidence": 0.82,
      "evidenceSummary": "รูปใบและลักษณะทรงพุ่มสอดคล้องบางส่วน"
    }
  ],
  "needsMoreEvidence": true,
  "requestedEvidence": ["leaf_underside"],
  "guidingQuestions": [
    "ใบเรียงแบบสลับหรือตรงข้าม?",
    "บริเวณนี้ได้รับแสงต่างจากจุดก่อนหน้าอย่างไร?"
  ],
  "disclaimer": "ผลลัพธ์เป็นข้อเสนอเบื้องต้นและต้องตรวจสอบเพิ่มเติม"
}
```

## Identification states

Keep these separately:

```text
student proposed
AI suggested
peer suggested
teacher verified
expert verified
unresolved
```

A final accepted identification must reference a stored identification record and verifier.

## Duplicate detection

Warn when a new observation is near an existing observation and has similar media or proposed identity. Do not automatically merge; plants of the same species may legitimately be separate specimens.

## Completion rules

A submission can require:

- valid session and group;
- location and GPS accuracy;
- minimum photo evidence;
- required trait fields;
- minimum ecological-context fields;
- a student identification or explicit `unknown`;
- a short evidence statement;
- acknowledgement that AI output is provisional.

## Teacher review

Teacher can:

- request revision;
- accept data quality while leaving identification unresolved;
- select an accepted identification;
- add feedback;
- flag duplicate or invalid records;
- export original and reviewed values.

Never overwrite the original submitted values. Store reviewed corrections as separate revision or verification records.