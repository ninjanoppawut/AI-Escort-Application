---
name: plant-analysis-worker
description: Gemini plant analysis for AI Escort — the server-only provider adapter, Supabase Queue plus Edge Function consumer, versioned structured output, Zod validation, confidence thresholds, and failure handling. Use when calling Gemini, designing the analysis job or its retries, parsing or storing provider output, deciding what the student sees while analysis runs or fails, or when any code path could put a provider key in the browser.
---

# Gemini analysis worker

Source: `docs/PLANT_SURVEY_PLUGIN.md` §5–§7, `docs/SYSTEM_ARCHITECTURE.md` §11/§12, `docs/API_AND_REALTIME.md` §15/§16, D-007…D-012.

## Hard boundaries

- Gemini is called **only from trusted server infrastructure** behind a provider adapter. The browser never holds the key.
- Gemini output is **provisional, always** (D-008). It never becomes `verified` without a teacher action.
- Gemini never receives another student's live location.
- Analysis must not depend on one long browser request. The student can close the app.

## Job pipeline

```text
student uploads evidence
→ create ai_analysis_run
→ enqueue analyze_observation (Supabase Queue)
→ Edge Function consumer claims job
→ load authorized private images
→ call Gemini adapter
→ validate output with Zod
→ store raw + normalized versioned result
→ update analysis state
→ run same-species candidate matching
→ notify client via durable state + Realtime
```

Queue must support retries, idempotency, failure status, and dead-letter / manual retry. Re-enqueueing the same observation returns the existing run (`ANALYSIS_ALREADY_QUEUED`).

MVP worker is Supabase Queue + Edge Function. A separate Node worker, Redis/BullMQ, Kubernetes, or GPU service is **out of scope** (D-011).

## Response contract

```json
{
  "schemaVersion": "plant-analysis-v1",
  "identificationStatus": "possible_match",
  "candidates": [{ "commonNameTh": "", "commonNameEn": "", "scientificName": "", "confidence": 0.87, "evidenceSummary": "" }],
  "traits": { "leafType": { "value": "simple", "visibility": "visible" } },
  "missingEvidence": ["leaf_underside"],
  "disclaimer": "provisional result"
}
```

Requirements: explicit schema version; provider, model, and prompt version stored; Zod-validated before use; unseen traits are `null` or an explicit unavailable state — **never invented**; raw provider output is restricted, retained minimally, and is not the domain model.

## Confidence behavior (D-009, configurable)

| Confidence | Student-facing behavior |
|---|---|
| < 0.40 | Emphasize insufficient evidence, name the missing image categories, offer to add photos |
| 0.40 – 0.70 | Show multiple candidates with the distinguishing traits |
| > 0.70 | Emphasize the top candidate, still show alternatives and the provisional label |

Confidence never drives teacher verification automatically. Thresholds must be changeable without a schema redesign.

## Gemini must not

Mark an observation verified; overwrite student data; invent non-visible traits; force an identity on inadequate evidence; block manual entry.

## Failure handling (D-012)

`AI_ANALYSIS_FAILED` is an **analysis-run state, not an observation state**. On failure:

- the draft survives intact;
- retry is offered;
- manual entry stays available — and the "กรอกเอง" affordance is present from the first second of *every* AI state, not only after failure;
- the student may consult an external reference such as Google Lens.

The student must be able to leave the analysis screen and photograph the next plant while a job runs.
