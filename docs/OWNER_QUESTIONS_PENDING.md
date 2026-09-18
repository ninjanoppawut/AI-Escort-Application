# Owner Questions Pending

This file collects items the autonomous build could not complete without
external access or an owner decision, and implementation choices made under
existing documents that the owner should confirm. It does not replace
`DECISIONS_AND_QUESTIONS.md`; accepted answers move there with the affected
module, traceability, and roadmap updates in the same change.

Last updated: 2026-09-19.

## Blocked on external access or environment ownership

| Roadmap item | Blocked because | What is needed |
|---|---|---|
| P0-09, P0-EXIT | Production custom SMTP, deployed Auth redirect allowlists, and the environment matrix need the hosted Supabase and deployment accounts. | An environment owner configures custom SMTP and redirect allowlists on the dedicated hosted project, then records staging email delivery evidence. |
| P1-01 | Same hosted Auth configuration as P0-09 (SMTP, redirect allowlists, CAPTCHA/rate policy). | Same as above; local and CI Auth flows already pass against local Supabase and Mailpit. |
| Hosted migrations | Phase 1–7 migrations after the first identity migration are verified locally and in CI but not applied to hosted project `rhntelxdmuvldrxyceqx`. | Owner approval to push migrations to the hosted development project (`supabase db push`). |
| P10 (Gemini) | Requires a Gemini API key, model choice, and budget (DEC-Q003). | Owner provides server-only credentials and approves model and limits. |
| Mapbox map screens (P6, P7, P13) | Requires a Mapbox access token. | Owner provides a restricted public token for development. |

## Pilot blockers already listed in the roadmap

DEC-Q001 consent and target age, DEC-Q002 retention schedule approval,
DEC-Q003 Gemini model and limits, DEC-Q004 taxonomy normalization source,
DEC-Q005 research variables and export fields, and DEC-Q006 service ownership
remain open. No answer was assumed.

## Implementation choices to confirm

These follow existing documents or design artifacts where the canonical
contract was silent. Each can be changed without data loss.

1. **Group invitation lifetime is 24 hours.** Source: design artifact S-08
   (`AI Escort - Forms.dc.html`). The API and database documents define
   expiry but no duration.
2. **Closed group formation also blocks student invitations, acceptances,
   readiness, and leader removals.** PRD §6 describes `forming` as the state
   where membership may change; teachers can still cancel invitations.
3. **Pending invitations count against seats when sending.** A leader can
   hold at most `max_group_size − members` pending invitations (design S-08:
   selections beyond open seats are disabled). Acceptance revalidates
   capacity again.
4. **Accepting one invitation cancels the student's other pending
   invitations in the class** without notifying those leaders; their open
   group screens refresh from the class-group signal.
5. **A group may be marked ready only by its leader, only from `forming`, and
   only at or above minimum size.** A ready group that drops below minimum
   after a removal returns to `forming`.
6. **Leader removal of a member has no notification** because no removal
   notification type exists in `UI_CONTRACTS.md` §4. Adding one needs a
   registry entry and Thai copy.
7. **`expectedGroupVersion` is not part of the transfer request.** Leadership
   is rechecked after the group row lock, so a stale transfer returns
   `NOT_GROUP_LEADER`; no group version column was added.
8. **Design items not implemented because accepted decisions reject them:**
   student "ask the leader to invite me" (D-050) and teacher group creation
   above the maximum with confirmation (D-047).
9. **Teachers unlock a group before moving students into or out of it or
   changing its leader.** Lock means membership is frozen for everyone;
   `move_student_between_groups` returns `GROUP_LOCKED`.
10. **A creation claim can be reset only after the claimed group is resolved:**
    deleted, archived, or the student is no longer an active member of it, and
    the group is not in an active session. Resets record the reason on the
    claim, a `claim_reset` history row, and an audit log whose ID is shown to
    the teacher. No student notification is sent because no claim-reset
    notification type exists in `UI_CONTRACTS.md` §4.
11. **Returning a student to unassigned sends no notification**, matching
    leader removal (item 6). Moves between groups notify the student.
12. **Delete-or-archive is one endpoint.** `DELETE /api/groups/:id` archives
    when the group has session history and deletes otherwise; members always
    return to unassigned, so explicit re-homing happens beforehand with the
    move dialog. The separate `POST /api/groups/:id/archive` route and the
    `memberHandling`/`moves` body in `API_AND_REALTIME.md` §10 were not added.
13. **Session stubs were replaced in P6-01.** A group has session history once
    any session snapshot includes it, and it is in an active session while its
    uncompleted snapshot belongs to an open or paused session.
14. **A class has at most one open or paused session at a time.** This keeps
    the student waiting and field shells unambiguous; a teacher completes one
    session before opening the next.
15. **An activity has at most one draft and one published version.** Editing a
    published activity creates the next draft version; publishing supersedes the
    previous version, which stays readable for sessions that used it.
16. **Activity and session rows restrict class deletion** instead of cascading as
    sketched in `DATABASE_DESIGN.md` §14A, so historical sessions cannot vanish
    with a class. Classes are archived rather than deleted today.
17. **Publish containment rule:** the route must intersect the boundary and every
    checkpoint must lie inside it. `DATABASE_DESIGN.md` §14A leaves the exact
    "inside or intersect" rule to the activity; a stricter route-inside rule is a
    one-line change.
18. **Geometry is authored as GeoJSON until Mapbox is configured.** Teachers paste
    or import GeoJSON (Feature and FeatureCollection accepted) and see a
    coordinate sketch; drawing on a base map waits for the Mapbox token.
19. **New stable error codes** `VALIDATION_FAILED`, `ACTIVITY_GEOMETRY_INVALID`,
    `ACTIVITY_VERSION_CONFLICT`, `ACTIVITY_NOT_PUBLISHED`, and
    `SESSION_ALREADY_RUNNING` extend `API_AND_REALTIME.md` §3 additively, with
    Thai copy in `UI_CONTRACTS.md` §5.
20. **A session snapshots every current group that still has a member**, in the
    queue order the teacher sets. Empty groups are listed as excluded, and
    students with no group do not join the session. The queue must name exactly
    those groups, so a membership change during setup is refused rather than
    silently snapshotting a stale roster.
21. **Session lists are visible to the whole class**, but only teachers read the
    setup screen, and participants read only their own session roster.
22. **The next group is promoted when the current group starts.** Activation
    marks the next waiting group `ready` ("กลุ่มถัดไป") and sends
    `session_group_next`; completing a group reports the ready group and
    promotes one only if none is waiting in line.
23. **Live positions use a per-student topic**
    `session:{sessionId}:location:{userId}` (additive to API §19). Realtime
    cannot verify a client sender and delivers to every reader, so this is the
    only way to keep named coordinates visible to just the student and the
    class teacher.
24. **Every active teacher of the class sees named live locations**, not only
    the teacher who opened the session.
25. **While paused, the teacher sees no last-known positions**; the live read
    model returns an empty list until the group is active again.
26. **Publishing stops when the page is hidden** and nothing is queued
    offline. Background tracking inside a session is not built.
27. **Working cadences**: broadcast about every 3 s while moving (3 m minimum
    movement) with a 15 s heartbeat; durable sample every 15 s; the database
    accepts at most one sample per 8 s and capture times within ±120 s; the
    teacher read model shows samples from the last 10 minutes.
28. **Design T-09 per-session live-tracking toggle is not built.** It is not in
    the PRD, API, or database documents and is a privacy/consent choice tied to
    DEC-Q001.
29. **Thai copy for the field-mode location notice** (PRIVACY §3) is missing
    from `UI_CONTRACTS.md`; P7-04 needs it before the student shell ships.
30. **Boundary-warning and checkpoint events** (`location_events` types and the
    `location_session_warning` producer) are deferred to P7-05 or later; their
    thresholds and throttling are undecided.
31. **Stale-location threshold** differs between the design brief (30 s) and the
    wireframes (2 min); P7-05 needs one value.
32. **Hosted Realtime "Allow public access" must be off** for GATE-03; this is
    an environment-owner setting.
33. **Realtime capacity**: roughly 85 messages/s at the 50-session envelope
    needs a check against the Supabase plan limits and the pilot budget.

## Local environment note

During the 2026-09-12 run the local Docker engine stopped responding.
Database, generated-type, and browser verification continued in hosted CI.
Docker Desktop was not force-restarted because other local projects share it;
restarting Docker Desktop restores local `supabase test db`, the PowerShell
race harnesses, and local Playwright runs.

On 2026-09-19 the recurring browser failures were traced to the P2-EXIT
durability test, which restarts the local database container while other
browser tests run in parallel. It now runs in its own `database-restart`
Playwright project after the other projects finish.
