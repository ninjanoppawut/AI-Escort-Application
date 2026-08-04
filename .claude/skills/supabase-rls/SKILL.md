---
name: supabase-rls
description: Row Level Security and authorization for AI Escort. Use when writing or reviewing any RLS policy, Storage bucket policy, `GRANT`, or authorization check; when adding a table or exposing one to PostgREST; when a query returns rows a user should not see; or when the task touches class/group/session membership, notifications, observations, media, or the completed map. Also use before writing authorization tests.
---

# RLS and authorization

Source: `docs/SYSTEM_ARCHITECTURE.md` §5, `AGENTS.md` "Security rules", `docs/DECISIONS_AND_QUESTIONS.md` D-030.

## Non-negotiables

1. **RLS on every exposed table.** No exceptions, including join/history/event tables.
2. **Membership tables are authoritative** (D-030). A UI role check, a JWT claim, or a client-supplied `classId` is never sufficient.
3. **Every UPDATE policy needs both `USING` and `WITH CHECK`.** `USING` alone lets a user move a row out of their own scope.
4. **Never authorize with user-editable metadata.** Not `raw_user_meta_data`, not a client-sent role field.
5. **Realtime channel access is not authorization.** Subscribing to a channel must never be the only gate on data — the underlying read must pass RLS too.
6. **Service-role key stays server-side.** Browser gets the anon key only.

## Authorization sources, in order

```text
auth.uid()
→ class_memberships (active, role)
→ groups + group_members (current membership, leader role)
→ session_participants (snapshot at session open — NOT current membership)
→ row ownership (observations.student_id)
```

`session_participants` is the authority for anything scoped to a past or running session. Current group membership answers "what happens next time", never "what happened then" (D-043).

## Per-actor rules

- **Student** reads only their authorized class, group, session, own notifications, own observations, and observations the completed-map policy permits.
- **Leader** manages only their own group, only while it is unlocked. Cannot bypass class membership or capacity.
- **Teacher** manages groups only for classes they teach.
- **Admin** must not bypass school/class scoping in normal UI flows (PRD §2).
- **Notifications** are recipient-scoped for both read and mark-read (D-032).
- **Drafts** are private to their creator and never reach the teacher map (D-026).

## Storage

- Private buckets only. Deterministic paths. Signed or policy-authorized access.
- Media policy mirrors the observation policy — if a user cannot read the observation row, they cannot read its objects.
- Presentation derivatives (256/512/1200/2048 px) inherit the same authorization.

## Never log or transmit

Access tokens, service-role or Gemini keys, exact live locations in general-purpose logs, unrestricted private image URLs. Never send another student's live location to Gemini (`PLANT_SURVEY_PLUGIN.md` §5).

## Testing (required before a feature is done)

Write these as multi-user tests, not single-user smoke tests:

1. Cross-class isolation — user in class A cannot read any row of class B.
2. Cross-session isolation — non-participant cannot read session rows or map data.
3. Notification isolation — recipient only, for `select` and `update`.
4. Storage denial — unauthorized user gets denied on a direct object path.
5. Draft invisibility — teacher cannot see a draft observation.
6. Completed-map access — participating student yes, non-participant no.

A policy without a test that proves the *negative* case is not done.
