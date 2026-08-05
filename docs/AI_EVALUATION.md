# AI Plant-Analysis Evaluation

## 1. Purpose

This specification defines how a Gemini model/prompt/schema version earns pilot use and how regressions are detected. AI output remains provisional evidence; passing evaluation never grants automatic teacher verification.

The exact production Gemini model and normalized Zod schema are selected during Phase 10 and recorded as an accepted configuration before pilot.

## 2. Versioned analysis unit

Every evaluation result identifies:

```text
provider
model
model configuration
prompt version
normalized schema version
image preprocessing version
dataset version
evaluation-code version
```

Comparisons change one major variable at a time where practical. Stored run provenance must reproduce which configuration generated a result even when the provider model later changes.

## 3. Dataset

Start with at least 100 consented or openly licensed observation cases representing:

- common Thai school-ground plants;
- visually similar species;
- whole-plant plus leaf/flower/fruit combinations;
- insufficient/blurred/occluded evidence;
- juvenile, damaged, or atypical specimens;
- multiple specimens/background clutter;
- Thai common-name variation and scientific synonyms;
- cases that should produce `needs_more_evidence` rather than confident identity.

Each case has teacher/botanist-reviewed reference identity where obtainable, visible-trait labels, evidence-quality labels, allowed uncertainty, and license/consent provenance. Split cases into development and held-out evaluation sets. Do not tune prompts against held-out expected answers.

Real student images enter an evaluation dataset only under the approved research/consent policy. Otherwise use synthetic, staff-created, openly licensed, or separately consented pilot material.

## 4. Required normalized behavior

The versioned schema must support:

- zero or more ranked candidates;
- common and scientific names when supported;
- confidence/score with documented semantics;
- visible traits and image/evidence references;
- missing/unseen values as `null` or explicit unavailable state;
- evidence-quality warnings and requested additional image categories;
- `needs_more_evidence`/insufficient-evidence behavior;
- provisional disclaimer;
- provider/model/prompt/schema provenance.

Provider text never directly becomes database-bound normalized data. Zod parsing rejects unknown/invalid critical fields and preserves a sanitized failure reference.

## 5. Pilot quality gates

| Measure | Gate |
|---|---:|
| Normalized schema-valid responses | ≥ 99% |
| Provisional label present in normalized/UI path | 100% |
| Top-3 candidate contains reviewed species on sufficient-evidence cases | ≥ 80% |
| Top-1 candidate contains reviewed species on sufficient-evidence cases | ≥ 60% |
| Insufficient-evidence cases that request more evidence or remain uncertain | ≥ 90% |
| Unsupported required trait invented as visible | ≤ 5% |
| Draft/media preserved after provider/schema failure | 100% |
| Cross-student live location or unrelated identity sent to provider | 0 cases |
| Analysis result p95 from durable enqueue | ≤ 90 seconds under target pilot load |

Taxonomic accuracy gates are pilot baselines, not claims of verified identification. Teacher manual review and student real-plant comparison remain mandatory even when a model exceeds them.

## 6. Confidence evaluation

Evaluate the configured thresholds from D-009:

- below 0.40: insufficient evidence emphasis;
- 0.40–0.70: multiple candidates;
- above 0.70: top candidate emphasized while alternatives/provisional labeling remain.

Use calibration buckets to compare confidence with observed top-1 correctness. If high-confidence errors are materially overrepresented, lower presentation emphasis or revise the prompt/schema; never hide alternatives or remove human checks to improve apparent conversion.

## 7. Robustness and failure suite

Run each version against:

- missing required image category;
- corrupt/unsupported image;
- duplicate images;
- maximum ten images and near-size-limit payloads;
- provider timeout, `429`, `5xx`, malformed JSON, unexpected fields, and partial response;
- duplicate queue delivery and worker restart;
- prompt-injection text visible in an image or user note;
- scientific-name formatting and Thai Unicode edge cases;
- provider returning a species outside the expected region;
- same-species and possible-specimen signals remaining separate.

All failures retain manual entry, bounded retry, and durable run history.

## 8. Human review protocol

At least two qualified reviewers independently label disagreements on a representative subset. Record reviewer role, disagreement category, and adjudicated result. Do not expose student identity during model-quality labeling when it is unnecessary.

Track error categories rather than only aggregate accuracy:

- wrong species but plausible genus;
- implausible taxon;
- unsupported trait;
- missed visible trait;
- failed uncertainty behavior;
- name/synonym normalization issue;
- schema/provider failure.

## 9. Rollout and rollback

- New provider/model/prompt/schema versions run offline evaluation first.
- Staging verifies queue, latency, redaction, and UI compatibility.
- Pilot rollout may use a small approved cohort while keeping manual entry.
- Compare correction rate, schema failures, latency, cost, and teacher outcomes by version.
- Roll back by configuration to the last accepted version when schema validity, high-confidence error, privacy, latency, or cost gates regress.
- Never delete prior AI runs/results during rollback.

## 10. Monitoring and cost

Monitor low-cardinality metrics for queue wait, provider duration, attempts, result state, schema version, error category, manual-entry use, and student correction occurrence. Do not put user/observation IDs in metric labels.

Enforce rate and budget controls defined during Q-003. Cost comparisons use processed image count/bytes and provider usage, without storing image content in telemetry.

## 11. Release evidence

Phase 10 evidence includes dataset/provenance summary, exact configuration versions, metric table by development/held-out set, robustness results, latency/cost run, known limitations, reviewer approval, and rollback target. Sensitive images or student data are never committed to the repository.
