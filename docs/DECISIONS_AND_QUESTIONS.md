# Decisions and Open Questions

This file records accepted product decisions for developers and AI coding agents. The decisions below are authoritative for the MVP.

## Accepted decisions

### D-001 — Observation ownership

- **Status:** accepted
- **Decision:** Each observation belongs to one student, not to the group.
- **Reason:** Supports individual learning evidence, grading, revision history, and research analysis.

### D-002 — Activity and session

- **Status:** accepted
- **Decision:** An activity is a reusable plan; a session is one actual execution.

### D-003 — One active exploration group

- **Status:** accepted
- **Decision:** Only one group may be active per exploration session.
- **Consequence:** Enforce with a PostgreSQL partial unique index and atomic RPC.

### D-004 — Waiting groups

- **Status:** accepted
- **Decision:** Waiting groups may preview route/activity information but may not publish live location or submit observations.

### D-005 — Client and map

- **Status:** accepted for MVP
- **Decision:** Build a mobile-first Next.js PWA and use Mapbox GL JS behind an adapter.

### D-006 — Realtime

- **Status:** accepted
- **Decision:** Use Broadcast for frequent live-location events, class/group change signals, and notification signals; Presence for participant state; PostgreSQL for durable authoritative records.

### D-007 — Plant-analysis provider

- **Status:** accepted for MVP
- **Decision:** Use Gemini behind a server-only provider adapter.

### D-008 — AI authority

- **Status:** accepted
- **Decision:** Gemini output is provisional. It never becomes verified automatically.

### D-009 — Gemini confidence behavior

- **Status:** accepted as configurable MVP default
- **Decision:** Below 0.40 request more evidence; 0.40–0.70 show multiple candidates; above 0.70 emphasize the top candidate while retaining alternatives/provisional labeling.

### D-010 — Gemini response contract

- **Status:** accepted
- **Decision:** The exact normalized JSON shape will be finalized during integration, but it must be versioned, server-validated, and store provider/model/prompt/schema versions.

### D-011 — Durable worker

- **Status:** accepted for MVP
- **Decision:** Use Supabase Queue + Edge Function consumer for Gemini processing.
- **Consequence:** A separate Node worker, Redis/BullMQ, Kubernetes, or GPU service is out of scope initially.

### D-012 — AI failure fallback

- **Status:** accepted
- **Decision:** Keep the draft, allow retry, and allow manual entry. Students may use external references such as Google Lens.

### D-013 — Required student identity

- **Status:** accepted
- **Decision:** Submission requires a Thai/common name and a scientific name. `Unknown` is not accepted as the final student submission.

### D-014 — Student verification

- **Status:** accepted
- **Decision:** Student checks each relevant AI trait as `match`, `not_match`, `unsure`, or `not_visible`; mismatches may include corrected values.

### D-015 — Evidence layers

- **Status:** accepted
- **Decision:** Gemini output, student verification/correction, submission versions, and teacher review/correction are stored separately and never overwritten.

### D-016 — Revision workflow

- **Status:** accepted
- **Decision:** Teacher may request revision. The student edits the same observation and resubmits, creating a new immutable submission version.

### D-017 — Teacher verification

- **Status:** accepted
- **Decision:** Teacher manually verifies every accepted observation and may correct the final common name, scientific name, and traits while preserving prior values.

### D-018 — Teacher completion

- **Status:** accepted
- **Decision:** The teacher manually decides when the session/activity is complete. No automatic completion formula is required for the MVP.

### D-019 — Capture location

- **Status:** accepted
- **Decision:** Capture location, capture accuracy, and capture time define the plant marker. Submission location is not required for normal MVP behavior.

### D-020 — GPS failure

- **Status:** accepted
- **Decision:** Prompt retry/wait. If GPS remains unavailable, keep an explicitly flagged record for teacher handling; never fabricate a coordinate.

### D-021 — Image limits and preprocessing

- **Status:** accepted
- **Decision:** One observation supports 1–10 images, with at least one whole-plant image. Before upload, correct orientation, limit longest edge to 2,048 px, compress toward quality 82–85, and limit each processed image to 5 MB.

### D-022 — Same-species behavior

- **Status:** accepted
- **Decision:** Search submitted observations in the same session. Warn the student but allow another individual submission.
- **Consequence:** Set a teacher-visible same-species tag and create an in-app teacher notification.

### D-023 — Same species versus same specimen

- **Status:** accepted
- **Decision:** Same-species and possible-same-specimen are separate relationships.

### D-024 — Specimen candidate signals

- **Status:** accepted
- **Decision:** Possible same-specimen detection may combine taxon, morphology, image similarity, location, and time. Distance alone is insufficient.

### D-025 — No automatic merge

- **Status:** accepted
- **Decision:** Never automatically merge, delete, or reject observations because of dedupe. Human confirmation is required; separate observations may later share a `specimen_id`.

### D-026 — Map marker visibility

- **Status:** accepted
- **Decision:** Drafts do not appear on the teacher map. Submitted/reviewed observations appear at capture location with status-aware markers and accessible labels/icons.

### D-027 — Completed map

- **Status:** accepted
- **Decision:** After activity/session completion, authorized teachers and participating students can view the result map. Clicking a marker opens plant details.

### D-028 — Flexible data and JSONB

- **Status:** accepted
- **Decision:** Use relational columns for ownership, status, authorization, required identity, location/time, group membership, and map/review queries. Use versioned `jsonb` for flexible Gemini output, extra traits, verification snapshots, notification payloads, device context, and research-event payloads.

### D-029 — Research event log

- **Status:** accepted
- **Decision:** Store meaningful actions as append-only event rows with explicit relational IDs and a flexible `payload jsonb`.

### D-030 — Authorization source

- **Status:** accepted
- **Decision:** Database membership and session participant tables are authoritative. UI role checks alone are insufficient.

### D-031 — Class invitation delivery

- **Status:** accepted
- **Decision:** Teacher invites students using class code, link, or QR code. Email is not required for the MVP.
- **Consequence:** Joining is validated by a trusted server function and always creates a student membership.

### D-032 — In-app notifications

- **Status:** accepted
- **Decision:** Use durable in-app notifications stored in PostgreSQL and private Realtime signals for immediate updates.
- **Consequence:** Notifications remain visible after reopening the app; users can read/mark only their own rows through RLS.

### D-033 — Group formation configuration

- **Status:** accepted
- **Decision:** Teacher configures minimum group size, maximum group size, maximum number of groups, whether students may create groups, and whether group formation is open or closed.

### D-034 — Student-created group leadership

- **Status:** accepted
- **Decision:** The student who successfully creates a group becomes its first and only active leader.

### D-035 — Maximum group slots

- **Status:** accepted
- **Decision:** The first eligible students may create groups until the teacher-defined maximum is reached.
- **Consequence:** After the maximum is reached, Create Group is disabled with an explanation; it does not silently disappear.

### D-036 — Atomic final group slot

- **Status:** accepted
- **Decision:** Group creation runs in an atomic database operation that locks class group configuration.
- **Consequence:** If two students attempt the final slot, one succeeds and one receives `GROUP_LIMIT_REACHED`.

### D-037 — One current group per student

- **Status:** accepted
- **Decision:** A student may belong to only one forming/active group per class, whether as leader or member.

### D-038 — One student-created group claim

- **Status:** accepted
- **Decision:** A student may create only one student-created group per class.
- **Consequence:** Deleting a group does not automatically allow repeated group creation; a teacher may explicitly reset the claim with audit history.

### D-039 — Classmate consent

- **Status:** accepted
- **Decision:** A group leader invites classmates through the application. Classmates accept or decline; leaders cannot force-add students.

### D-040 — Exactly one group leader

- **Status:** accepted
- **Decision:** Each populated current group has exactly one active leader.
- **Consequence:** Leadership transfer is atomic and a populated group cannot be committed without a leader.

### D-041 — Group Realtime strategy

- **Status:** accepted
- **Decision:** Group screens use initial fetch + private Realtime change signal + authoritative refetch on event, foreground, network reconnect, and Realtime reconnect.
- **Consequence:** Five-second polling is not the primary design. An optional slow fallback poll is allowed.

### D-042 — Teacher may move students

- **Status:** accepted
- **Decision:** Teacher may move students between groups in the same class when destination capacity and session rules allow.
- **Consequence:** If moving a leader from a non-empty group, a successor must be selected in the same operation.

### D-043 — Session membership snapshot

- **Status:** accepted
- **Decision:** Opening a session snapshots current group membership into session participants.
- **Consequence:** Later group moves affect future sessions and never rewrite historical participation.

### D-044 — Teacher may delete or archive groups

- **Status:** accepted
- **Decision:** Teacher may delete an unused group; a group with session history is archived instead of hard-deleted.
- **Consequence:** Pending invitations are cancelled, affected students are notified, and deleting an unused group restores a group slot.

### D-045 — Active-session membership protection

- **Status:** accepted
- **Decision:** Normal group move, removal, deletion, and leadership changes are blocked while the affected group/student participates in an active session.
- **Consequence:** Emergency removal is a separate teacher-supervised audited action.

### D-046 — Export delivery

- **Status:** accepted
- **Decision:** Reviewed-data export is delivered in-app. A large export becomes a queued job that notifies the teacher in-app when the download is ready.
- **Consequence:** No email dependency is introduced for exports. D-031 and D-032 stand unchanged.

### D-047 — Maximum group count is absolute

- **Status:** accepted
- **Decision:** `maximum_groups` is database-enforced for every actor, including teachers. No UI confirmation may create a group beyond the configured maximum.
- **Consequence:** A teacher who needs another group raises the class setting first. There is no over-quota override path.

### D-048 — Revision edit scope

- **Status:** accepted
- **Decision:** During revision, the student may edit only the topics the teacher flagged. Other fields are read-only.
- **Consequence:** The student may send an in-app "ขอแก้เพิ่ม" request with a reason; the teacher opens additional topics. This requires a new notification type and a request/approval endpoint. Supersedes the unrestricted-edit reading of `PLANT_SURVEY_PLUGIN.md` §13.

### D-049 — Observation issue report

- **Status:** accepted
- **Decision:** A student may report a problem on a plant detail record. The reporter's identity is not shown to the observation owner.
- **Consequence:** Requires an endpoint, a teacher-visible queue entry, and a rate limit of one report per record per 24 hours.

### D-050 — Rejected feature surface

- **Status:** accepted
- **Decision:** The following are explicitly out of scope and must not be implemented or designed:
  - student request-to-invite ("ขอให้หัวหน้ากลุ่มเชิญฉัน");
  - student-side same-specimen linking — S-21 displays the relationship read-only and only a teacher confirms it at review;
  - school email-domain whitelist on sign-in;
  - display-name change limit;
  - class-member suspend.
- **Reason:** None is supported by a product requirement. Each would add authorization, notification, or state surface that nothing else in the MVP needs.

### D-051 — GPS accuracy handling

- **Status:** accepted
- **Decision:** Poor accuracy warns only. The observation is flagged solely when no fix is obtainable.
- **Consequence:** The capture step shows the accuracy in metres with an amber chip and an option to wait, while the primary action remains "use this location". Refines D-020 rather than replacing it.

### D-052 — Concurrent observation update

- **Status:** accepted
- **Decision:** On `OBSERVATION_VERSION_CONFLICT`, the second writer is blocked, shown the reason, and given the refreshed record plus a repeat action.
- **Consequence:** Reuses the group-slot-race presentation. A teacher decision never lands silently on a version the teacher did not read.

### D-053 — Status token coverage

- **Status:** accepted
- **Decision:** Colour, shape, icon, and Thai text tokens are defined for all three status sets: observation (12), group (5), and session group (5).
- **Consequence:** Group and session-group statuses may not rely on colour alone, matching the existing observation tokens.

### D-054 — Live-location identifiability

- **Status:** accepted
- **Decision:** The live session map identifies students by name, visible to the class teacher only. Location broadcast stops when the session ends.
- **Reason:** Closes design question Q-A. A teacher responding to an out-of-boundary warning needs to know which student to reach.

### D-055 — Completed-map visibility

- **Status:** accepted
- **Decision:** Participants of the same session see each other's plant images and the recorder's name on the completed map.
- **Reason:** Closes design question Q-B. Consistent with D-027 and required for the same-species comparison discussion.

### D-056 — Session pause and per-group completion

- **Status:** accepted
- **Decision:** A teacher may pause and resume a session, and may complete an individual group without ending the session.
- **Consequence:** Adds a `paused` session-group status and the corresponding operations. While paused, students keep their drafts and may edit them but cannot submit.

### D-057 — Review feedback recipient

- **Status:** accepted
- **Decision:** Teacher review feedback is addressed to the owning student, never to the group.
- **Reason:** An observation belongs to one student (D-001). Corrects contradictory wording in the review UI.

### D-058 — Notification type coverage

- **Status:** accepted
- **Decision:** Every notification type in `PRODUCT_REQUIREMENTS.md` §8 maps to one of the eight designed row layouts, with a defined icon, Thai copy string, and deep-link target.
- **Consequence:** No notification copy is written at implementation time.

### D-059 — Required additional screens

- **Status:** accepted
- **Decision:** The following need a full screen specification before implementation handoff: manual plant entry, group unlock and group-creation-claim reset, the cross-class student observation list, and the class member list for both roles.
- **Reason:** Each is referenced by an accepted rule or an API operation but exists only as a navigation node.

### D-060 — Unmapped error codes

- **Status:** accepted
- **Decision:** `RATE_LIMITED` and `CLASS_NOT_ACTIVE` require defined UI states before the features that raise them ship.

## Working defaults

- Thai is the default UI language.
- Observation images are private by default.
- Location broadcast is approximately every 2–5 seconds while moving.
- Durable location sampling is approximately every 10–30 seconds or meaningful event.
- Same-species matching begins within the same session.
- Teacher-map status presentation uses amber/submitted, red/revision, blue/resubmitted, green/verified, purple/unable-to-verify, and gray/rejected, with non-color labels/icons.
- Gemini missing/unseen traits use `null` or explicit unavailable state.
- Group invitations and group changes use in-app notifications only for the MVP.
- Group-board Realtime events cause an authoritative refetch.
- An optional 30–60 second fallback refresh may be used while a group screen remains open.

## Remaining non-blocking questions

These do not block initial implementation but must be finalized before production/pilot deployment.

### Q-001 — Consent and target age

What school/guardian consent and student age rules apply to location, image, notification, and research-event collection?

### Q-002 — Retention

How long should raw live-location events, processed images, AI payloads, notifications, audit logs, and research logs be retained?

### Q-003 — Production Gemini configuration

Which Gemini model, rate limits, latency target, and monthly budget will production use?

### Q-004 — Taxonomy normalization source

Gemini text is acceptable for MVP display, but which authoritative source will later normalize names/synonyms/taxon IDs?

### Q-005 — Research instruments and exports

Which final research variables, scales, reflections, and anonymized export fields are required?

### Q-006 — Deployment ownership

Who owns and supports the Supabase, Vercel, Mapbox, Gemini, privacy, and production accounts?

## Agent behavior

Do not ask the product owner about already accepted decisions. Ask only when a new choice materially affects privacy, retention, grading, public sharing, paid provider configuration, destructive migrations, or emergency behavior. For ordinary implementation details, choose the safest simple option, document it, and proceed.
